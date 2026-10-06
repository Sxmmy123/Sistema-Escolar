import { coleccionGestion, documentoSeguimiento, gestionActual } from "./rutasFirestore.js";
import { arrayUnion, collection, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";
import { calculateTeacherAlerts } from "./calcularAlertasDocente.js";
import { localDateIso } from "./comunicadosDocentes.js";
import { listarAlumnosMatriculados } from "./matriculas.js";

function rows(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function loadTeacherAcademicAlerts(context, trimesterId = "t1") {
  const courseIds = [...new Set((context?.courses || []).map((course) => course.id))];
  const uid = auth.currentUser?.uid || "";
  const today = localDateIso();
  if (!uid || !courseIds.length) return { absences: [], studentAlerts: [], seenKeys: [], today };

  const [students, attendanceSnap, activitiesSnap, gradesSnap, followUpsResult] = await Promise.all([
    Promise.all(courseIds.map((id) => listarAlumnosMatriculados(id, { soloActivos: true }))).then((groups) => groups.flat()),
    getDocs(query(coleccionGestion(firestore, "asistencias"), where("cursoId", "in", courseIds), where("trimestreId", "==", trimesterId))),
    getDocs(query(coleccionGestion(firestore, "actividades"), where("cursoId", "in", courseIds), where("trimestreId", "==", trimesterId))),
    getDocs(query(coleccionGestion(firestore, "calificaciones"), where("cursoId", "in", courseIds), where("trimestreId", "==", trimesterId))),
    getDocs(query(collection(firestore, "usuarios", uid, "seguimientos"), where("gestionId", "==", gestionActual()), where("trimestreId", "==", trimesterId)))
      .then((snapshot) => ({ rows: rows(snapshot), unavailable: false }))
      .catch((error) => {
        if (error?.code !== "permission-denied") throw error;
        return { rows: [], unavailable: true };
      })
  ]);

  return {
    ...calculateTeacherAlerts({
      students, attendance: rows(attendanceSnap),
      activities: rows(activitiesSnap), grades: rows(gradesSnap),
      followUps: followUpsResult.rows, courses: context.courses, trimesterId, today
    }),
    today,
    followUpUnavailable: followUpsResult.unavailable,
    seenKeys: followUpsResult.rows.flatMap((item) => item.avisosVistos || []),
    seenUnavailable: followUpsResult.unavailable
  };
}

export async function markTeacherAlertsViewed({ trimesterId, keys }) {
  const uid = auth.currentUser?.uid || "";
  if (!uid || !["t1", "t2", "t3"].includes(trimesterId) || !keys?.length) return;
  const porAlumno = new Map();
  for (const key of keys) {
    const match = String(key).match(/^(missing|pending|absence):([^:]+):.+$/);
    if (!match) throw new Error("Aviso no valido.");
    if (!porAlumno.has(match[2])) porAlumno.set(match[2], []);
    porAlumno.get(match[2]).push(key);
  }
  const batch = writeBatch(firestore);
  for (const [alumnoId, avisos] of porAlumno) batch.set(documentoSeguimiento(firestore, uid, alumnoId, trimesterId), {
    gestionId: gestionActual(), alumnoId, trimestreId,
    avisosVistos: arrayUnion(...avisos), updatedAt: serverTimestamp()
  }, { merge: true });
  await batch.commit();
}

export async function markTeacherAbsenceFollowedUp({ studentId, trimesterId, lastDate }) {
  const uid = auth.currentUser?.uid || "";
  if (!uid || !studentId || !["t1", "t2", "t3"].includes(trimesterId) || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
    throw new Error("No se pudo identificar el seguimiento de asistencia.");
  }
  await setDoc(documentoSeguimiento(firestore, uid, studentId, trimesterId), {
    gestionId: gestionActual(),
    alumnoId: studentId,
    trimestreId,
    ultimaFaltaAtendida: lastDate,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
