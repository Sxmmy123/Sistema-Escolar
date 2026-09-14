import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { COURSES, DAYS, SUBJECTS, findCourse, findSubject } from "../data/catalog.js";
import { auth, firestore } from "../firebase/client.js";
import { todayIso } from "./teacherData.js";

const DIRECTOR_ATTENDANCE_SETTINGS_ID = "asistencia";

function rows(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listDirectorStudents(courseId = "") {
  const filters = [where("activo", "==", true)];
  if (courseId) filters.push(where("cursoId", "==", courseId));
  const snap = await getDocs(query(collection(firestore, "alumnos"), ...filters));
  return rows(snap).sort((a, b) => Number(a.numeroLista || 999) - Number(b.numeroLista || 999) || String(a.nombre || "").localeCompare(String(b.nombre || "")));
}

export async function listDirectorTeachers() {
  const [teachersSnap, assignmentsSnap] = await Promise.all([
    getDocs(query(collection(firestore, "docentes"), where("activo", "==", true))),
    getDocs(collection(firestore, "asignaciones"))
  ]);
  const assignments = Object.fromEntries(rows(assignmentsSnap).map((item) => [item.id, item.cursos || {}]));
  return rows(teachersSnap)
    .map((teacher) => ({
      ...teacher,
      asignaciones: assignments[teacher.id] || {}
    }))
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")));
}

export async function listDirectorSchedules() {
  const snap = await getDocs(collection(firestore, "horarios"));
  return Object.fromEntries(rows(snap).map((item) => [item.id, item]));
}

export async function listDirectorAttendance({ fecha = todayIso(), trimestreId = "" } = {}) {
  const snap = await getDocs(query(collection(firestore, "asistencias"), where("fecha", "==", fecha)));
  return rows(snap).filter((item) => !trimestreId || (item.trimestreId || "t1") === trimestreId);
}

export async function listDirectorAttendanceRange({ fechaInicio, fechaFin, trimestreId = "" } = {}) {
  if (!fechaInicio || !fechaFin) return [];
  const snap = await getDocs(query(
    collection(firestore, "asistencias"),
    where("fecha", ">=", fechaInicio),
    where("fecha", "<=", fechaFin)
  ));
  return rows(snap).filter((item) => !trimestreId || (item.trimestreId || "t1") === trimestreId);
}

export async function listDirectorAttendanceByTrimester(trimestreId = "t1") {
  const snap = await getDocs(query(
    collection(firestore, "asistencias"),
    where("trimestreId", "==", trimestreId)
  ));
  return rows(snap);
}

export async function getDirectorAttendanceSettings() {
  const localValue = Number(localStorage.getItem("directorLimiteFaltas") ?? 4);
  const fallback = Number.isFinite(localValue) ? Math.max(0, Math.min(30, Math.round(localValue))) : 4;
  try {
    const snap = await getDoc(doc(firestore, "configuracion_director", DIRECTOR_ATTENDANCE_SETTINGS_ID));
    if (!snap.exists()) return { limiteFaltas: fallback, guardadoEnFirebase: false };
    const value = Number(snap.data()?.limiteFaltas);
    const limiteFaltas = Number.isFinite(value) ? Math.max(0, Math.min(30, Math.round(value))) : fallback;
    localStorage.setItem("directorLimiteFaltas", String(limiteFaltas));
    return { id: snap.id, ...snap.data(), limiteFaltas, guardadoEnFirebase: true };
  } catch {
    return { limiteFaltas: fallback, guardadoEnFirebase: false };
  }
}

export async function saveDirectorAttendanceSettings(limiteFaltas = 4) {
  const safeLimit = Math.max(0, Math.min(30, Math.round(Number(limiteFaltas) || 0)));
  const payload = {
    limiteFaltas: safeLimit,
    actualizadoPorUid: auth.currentUser?.uid || "",
    actualizadoPor: auth.currentUser?.email || "director",
    updatedAt: serverTimestamp()
  };
  localStorage.setItem("directorLimiteFaltas", String(safeLimit));
  try {
    await setDoc(doc(firestore, "configuracion_director", DIRECTOR_ATTENDANCE_SETTINGS_ID), payload, { merge: true });
    return { id: DIRECTOR_ATTENDANCE_SETTINGS_ID, ...payload, guardadoEnFirebase: true };
  } catch {
    return { id: DIRECTOR_ATTENDANCE_SETTINGS_ID, ...payload, guardadoEnFirebase: false };
  }
}

export async function sendStudentAttendanceWarning({
  student,
  course,
  trimestreId = "t1",
  faltas = 0,
  limiteFaltas = 4,
  mensaje = "",
  activa = false
}) {
  if (!student?.id) throw new Error("No se encontro el alumno para enviar la advertencia.");
  const safeAbsences = Math.max(0, Math.round(Number(faltas) || 0));
  const safeLimit = Math.max(0, Math.round(Number(limiteFaltas) || 0));
  const safeMessage = String(mensaje || "").trim().slice(0, 500);
  const isActive = activa === true;
  if (isActive && !safeMessage) throw new Error("Escribe el mensaje antes de activar la advertencia.");
  const payload = {
    tipo: "advertencia_asistencia",
    alumnoId: student.id,
    alumnoNombre: student.nombre || "Alumno",
    cursoId: student.cursoId || course?.id || "",
    cursoNombre: course?.nombre || courseName(student.cursoId),
    trimestreId,
    faltas: safeAbsences,
    limiteFaltas: safeLimit,
    mensaje: safeMessage,
    activa: isActive,
    creadaPorUid: auth.currentUser?.uid || "",
    creadaPor: auth.currentUser?.email || "director",
    updatedAt: serverTimestamp()
  };
  await updateDoc(doc(firestore, "alumnos", student.id), {
    advertenciaAsistencia: payload,
    updatedAt: serverTimestamp()
  });
  return payload;
}

export async function listDirectorRecentAttendance(limitCount = 800) {
  const safeLimit = Math.max(1, Math.min(1500, Number(limitCount) || 800));
  const snap = await getDocs(query(
    collection(firestore, "asistencias"),
    orderBy("fecha", "desc"),
    limit(safeLimit)
  ));
  return rows(snap);
}

export async function listDirectorActivities(trimestreId = "") {
  const filters = [where("activo", "==", true)];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = await getDocs(query(collection(firestore, "actividades"), ...filters));
  return rows(snap).filter((item) => !item.interno && !["material", "materiales"].includes(String(item.tipo || "").toLowerCase()));
}

export async function listDirectorGrades(trimestreId = "") {
  const filters = [];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = filters.length
    ? await getDocs(query(collection(firestore, "calificaciones"), ...filters))
    : await getDocs(collection(firestore, "calificaciones"));
  return rows(snap);
}

export async function listDirectorAudit(limitCount = 12) {
  try {
    const snap = await getDocs(query(collection(firestore, "auditoria"), orderBy("createdAt", "desc"), limit(limitCount)));
    return rows(snap);
  } catch {
    return [];
  }
}

export function attendanceTotals(records = []) {
  return records.reduce((acc, item) => {
    const key = item.estado || "falta";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { presente: 0, atraso: 0, permiso: 0, falta: 0 });
}

export function attendancePercent(records = []) {
  if (!records.length) return 0;
  const totals = attendanceTotals(records);
  const valid = (totals.presente || 0) + (totals.atraso || 0) + (totals.permiso || 0);
  return Math.round((valid / records.length) * 100);
}

export function courseName(courseId) {
  return findCourse(courseId)?.nombre || courseId || "-";
}

export function subjectName(subjectId) {
  return findSubject(subjectId)?.nombre || subjectId || "-";
}

export function courseShort(courseId) {
  return findCourse(courseId)?.corto || courseName(courseId);
}

export function subjectShort(subjectId) {
  return findSubject(subjectId)?.corto || subjectName(subjectId);
}

export function activeCoursesWithCounts(students = []) {
  const counts = students.reduce((acc, student) => {
    acc[student.cursoId] = (acc[student.cursoId] || 0) + 1;
    return acc;
  }, {});
  return COURSES.map((course) => ({ ...course, total: counts[course.id] || 0 }));
}

export function assignmentText(assignments = {}) {
  const entries = Object.entries(assignments || {});
  if (!entries.length) return "Sin asignacion";
  return entries.map(([courseId, value]) => {
    const subjects = (value?.materias || []).map((subjectId) => subjectShort(subjectId)).join(", ");
    return `${courseShort(courseId)}: ${subjects || "Sin materias"}`;
  }).join(" | ");
}

export function calculateCourseGrades({ students = [], activities = [], grades = [], courseId = "" } = {}) {
  const courseStudents = students.filter((student) => student.cursoId === courseId && student.activo !== false);
  const startedActivityIds = new Set(grades.map((grade) => grade.actividadId).filter(Boolean));
  const courseActivities = activities.filter((activity) => (
    activity.cursoId === courseId &&
    activity.activo !== false &&
    startedActivityIds.has(activity.id)
  ));
  const gradeByKey = new Map(grades.map((grade) => [`${grade.actividadId}|${grade.alumnoId}`, grade]));
  if (!courseStudents.length || !courseActivities.length) {
    return { courseId, average: 0, approved: 0, risk: 0, pending: 0, totalCells: courseStudents.length * courseActivities.length };
  }

  let sum = 0;
  let count = 0;
  let pending = 0;
  const studentAverages = courseStudents.map((student) => {
    let studentSum = 0;
    courseActivities.forEach((activity) => {
      const grade = gradeByKey.get(`${activity.id}|${student.id}`);
      const note = Number(grade?.nota || 35);
      if (!grade) pending += 1;
      studentSum += Math.max(35, note);
      sum += Math.max(35, note);
      count += 1;
    });
    return Math.round(studentSum / courseActivities.length);
  });
  return {
    courseId,
    average: count ? Math.round(sum / count) : 0,
    approved: studentAverages.filter((value) => value >= 51).length,
    risk: studentAverages.filter((value) => value < 51).length,
    pending,
    totalCells: count
  };
}

export { COURSES, DAYS, SUBJECTS };
