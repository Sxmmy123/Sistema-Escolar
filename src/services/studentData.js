import { coleccionGestion, documentoGestion, gestionActual } from "./rutasFirestore.js";
import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { findCourse, findSubject, SUBJECTS } from "../data/catalog.js";
import { auth, firestore } from "../firebase/client.js";
import { actividadPendienteRegularizacion } from "./revisionActividad.js";
import { calculateSubjectTerm, gradeByActivityAndStudent, isAttendanceValue, isMaterialActivity } from "./calculoAcademico.js";
import { fechaEscolarIso } from "./fechaEscolar.js";
import { studentIdFromProfile } from "./identidadAlumno.js";
import { alumnoConMatricula } from "./matriculas.js";
import { periodosCurso } from "./periodosCurso.js";
import { STUDENT_TRIMESTERS, etiquetaTrimestreAlumno, normalizarTrimestreAlumno, resolverVistaTrimestreAlumno, trimestreAutomaticoAlumno } from "./trimestreAlumno.js";
import { identificarAutoresAsistencia } from "./autoriaAsistencia.js";
export { STUDENT_TRIMESTERS } from "./trimestreAlumno.js";

const defaultClients = { auth, firestore };

function verifyStudentSession(clients, uid) {
  if (clients.auth.currentUser?.uid !== uid) throw new Error("La sesion del alumno cambio. Vuelve a ingresar.");
}

function todayIso() {
  return fechaEscolarIso();
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

function bulletinAverage(values) {
  const present = values.filter((value) => value !== null && Number.isFinite(value));
  return present.length ? Math.round(present.reduce((total, value) => total + value, 0) / present.length) : null;
}

export function buildStudentAnnualBulletin({ student, activities = [], grades = [], attendance = [] }) {
  const ownGrades = grades.filter((item) => item.alumnoId === student.id);
  const ownAttendance = attendance.filter((item) => item.alumnoId === student.id);
  const byTerm = Object.fromEntries(STUDENT_TRIMESTERS.map((term) => {
    const termActivities = activities.filter((item) => (item.trimestreId || "t1") === term.id);
    const termGrades = ownGrades.filter((item) => (item.trimestreId || "t1") === term.id);
    const gradedIds = new Set(termGrades.map((item) => item.actividadId));
    const recordedSubjects = new Set(termActivities.filter((item) => gradedIds.has(item.id)).map((item) => item.materiaId));
    const bulletin = buildBulletin({ student, trimesterId: term.id, activities: termActivities, grades: termGrades, attendance: ownAttendance.filter((item) => (item.trimestreId || "t1") === term.id) });
    return [term.id, bulletin.map((item) => ({ ...item, hasData: item.hasData && recordedSubjects.has(item.subjectId) }))];
  }));
  const rows = SUBJECTS.map((subject, index) => {
    const terms = Object.fromEntries(STUDENT_TRIMESTERS.map((term) => [term.id, byTerm[term.id][index].hasData ? byTerm[term.id][index] : null]));
    const values = Object.values(terms).filter(Boolean).map((item) => item.final);
    return { subjectId: subject.id, subjectName: subject.nombre, color: subject.color, terms, average: bulletinAverage(values), termCount: values.length };
  });
  const terms = STUDENT_TRIMESTERS.map((term) => ({ ...term, average: bulletinAverage(byTerm[term.id].filter((item) => item.hasData).map((item) => item.final)) }));
  const termCount = terms.filter((item) => item.average !== null).length;
  return { rows, byTerm, terms, average: bulletinAverage(terms.map((item) => item.average)), termCount, partial: rows.some((item) => item.termCount < 3) };
}

function dashboardQueries(context, firestore) {
  const courseId = context.student.cursoId;
  const studentId = context.student.id;
  const year = context.gestionId;
  return [
    ["activities", query(coleccionGestion(firestore, "actividades", year), where("cursoId", "==", courseId))],
    ["grades", query(coleccionGestion(firestore, "calificaciones", year), where("alumnoId", "==", studentId))],
    ["attendance", query(coleccionGestion(firestore, "asistencias", year), where("alumnoId", "==", studentId))],
    ["warnings", query(collection(firestore, "alumnos", studentId, "avisos"), where("gestionId", "==", year), where("activa", "==", true))],
    ["periods", periodosCurso(firestore, courseId, year)]
  ];
}

const snapshotRows = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

export function buildStudentDashboardData(context, { activities: allActivities = [], grades: allGrades = [], attendance: allAttendance = [], warnings = [], periods = [] }, now = todayIso()) {
  const automaticTrimesterId = trimestreAutomaticoAlumno({ activities: allActivities, attendance: allAttendance, periods, today: now });
  const trimesterId = resolverVistaTrimestreAlumno({ profile: context.profile, year: context.gestionId, courseId: context.student.cursoId, automatic: automaticTrimesterId });
  const activities = allActivities.filter((activity) => (activity.trimestreId || "t1") === trimesterId);
  const grades = allGrades.filter((grade) => (grade.trimestreId || "t1") === trimesterId);
  const attendance = identificarAutoresAsistencia(allAttendance).filter((item) => (item.trimestreId || "t1") === trimesterId);
  const gradeByActivity = new Map(grades.map((grade) => [grade.actividadId, grade]));
  const attendanceWarning = warnings
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
  const annualBulletin = buildStudentAnnualBulletin({ student: context.student, activities: allActivities, grades: allGrades, attendance: allAttendance });
  const bulletin = annualBulletin.byTerm[trimesterId];

  return {
    ...context,
    trimesterId,
    automaticTrimesterId,
    trimesterLabel: etiquetaTrimestreAlumno(trimesterId),
    activities,
    grades,
    gradeByActivity,
    materials,
    programmed,
    missing,
    attendance,
    attendanceWarning,
    attendancePercent: attendanceCount ? Math.round((presentCount / attendanceCount) * 100) : 0,
    bulletin,
    annualBulletin
  };
}

export async function getStudentDashboardData(clients = defaultClients) {
  const context = await getStudentContext(clients);
  const entries = await Promise.all(dashboardQueries(context, clients.firestore).map(async ([name, ref]) => {
    try { return [name, snapshotRows(await getDocs(ref))]; }
    catch (error) { if (name === "periods" && error.code === "permission-denied") return [name, []]; throw error; }
  }));
  verifyStudentSession(clients, context.uid);
  return buildStudentDashboardData(context, Object.fromEntries(entries));
}

export async function observarPanelAlumno(onData, onError, clients = defaultClients) {
  const context = await getStudentContext(clients);
  const rows = {}, stops = [];
  let disposed = false, current = null;
  const emit = () => {
    if (disposed || Object.keys(rows).length !== 5) return;
    verifyStudentSession(clients, context.uid);
    current = buildStudentDashboardData(context, rows);
    onData(current);
  };
  const fail = (error) => { if (!disposed) onError(error); };
  for (const [name, ref] of dashboardQueries(context, clients.firestore)) {
    stops.push(onSnapshot(ref, (snapshot) => {
      if (disposed) return;
      rows[name] = snapshotRows(snapshot);
      try { emit(); } catch (error) { fail(error); }
    }, (error) => {
      if (name === "periods" && error.code === "permission-denied") {
        rows.periods = [];
        try { emit(); } catch (failure) { fail(failure); }
      } else fail(error);
    }));
  }
  return {
    stop() { disposed = true; stops.forEach((stop) => stop()); },
    async seleccionarTrimestre(termId) {
      if (disposed || !current || !normalizarTrimestreAlumno(termId)) throw new Error("No se puede cambiar el trimestre.");
      verifyStudentSession(clients, context.uid);
      const preference = { cursoId: context.student.cursoId, trimestreId: termId, automatico: current.automaticTrimesterId };
      await updateDoc(doc(clients.firestore, "usuarios", context.uid), { [`preferencias.vistasAlumnoPorGestion.${context.gestionId}`]: preference, updatedAt: serverTimestamp() });
      if (disposed) return;
      verifyStudentSession(clients, context.uid);
      context.profile = { ...context.profile, preferencias: { ...context.profile.preferencias, vistasAlumnoPorGestion: { ...context.profile.preferencias?.vistasAlumnoPorGestion, [context.gestionId]: preference } } };
      emit();
    }
  };
}

export function subjectName(subjectId) {
  return findSubject(subjectId)?.nombre || subjectId || "-";
}
