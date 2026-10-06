import { coleccionGestion, documentoGestion, gestionActual } from "./rutasFirestore.js";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { findCourse, findSubject, SUBJECTS } from "../data/catalog.js";
import { auth, firestore } from "../firebase/client.js";
import { actividadPendienteRegularizacion } from "./revisionActividad.js";
import { calculateSubjectTerm, gradeByActivityAndStudent, isAttendanceValue, isMaterialActivity } from "./calculoAcademico.js";
import { fechaEscolarIso } from "./fechaEscolar.js";
import { studentIdFromProfile } from "./identidadAlumno.js";
import { alumnoConMatricula } from "./matriculas.js";

const defaultClients = { auth, firestore };

function verifyStudentSession(clients, uid) {
  if (clients.auth.currentUser?.uid !== uid) throw new Error("La sesion del alumno cambio. Vuelve a ingresar.");
}

export const STUDENT_TRIMESTERS = [
  { id: "t1", label: "1er trimestre" },
  { id: "t2", label: "2do trimestre" },
  { id: "t3", label: "3er trimestre" }
];

function todayIso() {
  return fechaEscolarIso();
}

function trimesterLabel(trimestreId) {
  return STUDENT_TRIMESTERS.find((item) => item.id === trimestreId)?.label || STUDENT_TRIMESTERS[0].label;
}

function normalizeTrimester(value) {
  return STUDENT_TRIMESTERS.some((item) => item.id === value) ? value : "";
}

function inferActiveTrimester({ activities = [], grades = [], attendance = [] }) {
  const scores = { t1: 0, t2: 0, t3: 0 };
  const today = todayIso();
  activities.forEach((item) => {
    const trimester = normalizeTrimester(item.trimestreId);
    if (!trimester) return;
    scores[trimester] += String(item.fecha || "") >= today ? 4 : 1;
  });
  attendance.forEach((item) => {
    const trimester = normalizeTrimester(item.trimestreId);
    if (trimester) scores[trimester] += 2;
  });
  grades.forEach((item) => {
    const trimester = normalizeTrimester(item.trimestreId);
    if (trimester) scores[trimester] += 2;
  });
  return STUDENT_TRIMESTERS.reduce((best, item) => {
    if (scores[item.id] > scores[best]) return item.id;
    if (scores[item.id] === scores[best] && scores[item.id] > 0) return item.id;
    return best;
  }, "t1");
}

export async function getStudentContext(clients = defaultClients) {
  const { auth, firestore } = clients;
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No hay sesion de alumno autenticada.");
  const profileSnap = await getDoc(doc(firestore, "usuarios", uid));
  if (!profileSnap.exists()) throw new Error("No se encontro el perfil del alumno.");
  const profile = profileSnap.data();
  const studentId = studentIdFromProfile(profile);
  const studentSnap = await getDoc(doc(firestore, "alumnos", studentId));
  if (!studentSnap.exists() || studentSnap.data().activo === false) throw new Error("El alumno no esta habilitado.");
  const matricula = await getDoc(documentoGestion(firestore, "matriculas", studentId));
  if (!matricula.exists() || matricula.data().estado !== "activo") throw new Error("El alumno no tiene matricula activa en esta gestion.");
  verifyStudentSession(clients, uid);
  const student = alumnoConMatricula(studentSnap.id, studentSnap.data(), matricula.data());
  return { uid, profile, student, gestionId: gestionActual(), course: findCourse(student.cursoId) };
}

export function buildBulletin({ student, activities, grades, attendance, trimesterId }) {
  const gradesMap = gradeByActivityAndStudent(grades);
  return SUBJECTS.map((subject) => ({
    subjectId: subject.id,
    subjectName: subject.nombre,
    subjectShort: subject.corto || subject.nombre,
    color: subject.color,
    trimesterId,
    ...calculateSubjectTerm(student, subject.id, activities, gradesMap, attendance)
  }));
}

export async function getStudentDashboardData(clients = defaultClients) {
  const { firestore } = clients;
  const context = await getStudentContext(clients);
  const courseId = context.student.cursoId;
  const studentId = context.student.id;
  const now = todayIso();

  const [activitiesSnap, gradesSnap, attendanceSnap, avisosSnap] = await Promise.all([
    courseId ? getDocs(query(coleccionGestion(firestore, "actividades"), where("cursoId", "==", courseId))) : { docs: [] },
    studentId ? getDocs(query(coleccionGestion(firestore, "calificaciones"), where("alumnoId", "==", studentId))) : { docs: [] },
    studentId ? getDocs(query(coleccionGestion(firestore, "asistencias"), where("alumnoId", "==", studentId))) : { docs: [] },
    getDocs(query(collection(firestore, "alumnos", studentId, "avisos"), where("gestionId", "==", gestionActual()), where("activa", "==", true)))
  ]);
  verifyStudentSession(clients, context.uid);

  const allActivities = activitiesSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")));
  const allGrades = gradesSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const allAttendance = attendanceSnap.docs.map((item) => ({ id: item.id, ...item.data() }));

  const preferredTrimester = normalizeTrimester(context.profile.preferencias?.trimestresPorGestion?.[gestionActual()]);
  const trimesterId = preferredTrimester || inferActiveTrimester({ activities: allActivities, grades: allGrades, attendance: allAttendance });
  const activities = allActivities.filter((activity) => (activity.trimestreId || "t1") === trimesterId);
  const grades = allGrades.filter((grade) => (grade.trimestreId || "t1") === trimesterId);
  const attendance = allAttendance.filter((item) => (item.trimestreId || "t1") === trimesterId);
  const gradeByActivity = new Map(grades.map((grade) => [grade.actividadId, grade]));
  const attendanceWarning = avisosSnap.docs.map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.trimestreId === trimesterId)
    .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0))[0] || null;

  const materials = activities.filter((activity) => !activity.interno && isMaterialActivity(activity) && String(activity.fecha || "") >= now);
  const programmed = activities.filter((activity) => !activity.interno && !isMaterialActivity(activity) && String(activity.fecha || "") >= now);
  const missing = activities.filter((activity) => {
    return !activity.interno && !isMaterialActivity(activity)
      && actividadPendienteRegularizacion(activity, gradeByActivity.get(activity.id), now);
  });
  const attendanceCount = attendance.length;
  const presentCount = attendance.filter((item) => isAttendanceValue(item.estado)).length;
  const bulletin = buildBulletin({ student: context.student, activities, grades, attendance, trimesterId });

  return {
    ...context,
    trimesterId,
    trimesterLabel: trimesterLabel(trimesterId),
    activities,
    grades,
    gradeByActivity,
    materials,
    programmed,
    missing,
    attendance,
    attendanceWarning,
    attendancePercent: attendanceCount ? Math.round((presentCount / attendanceCount) * 100) : 0,
    bulletin
  };
}

export function subjectName(subjectId) {
  return findSubject(subjectId)?.nombre || subjectId || "-";
}
