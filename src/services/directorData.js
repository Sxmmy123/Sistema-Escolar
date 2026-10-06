import { coleccionGestion, gestionActual } from "./rutasFirestore.js";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where
} from "firebase/firestore";
import { COURSES, DAYS, SUBJECTS, findCourse, findSubject } from "../data/catalog.js";
import { auth, firestore } from "../firebase/client.js";
import { todayIso } from "./teacherData.js";
import { calculateCourseTerm, isAttendanceValue, normalizarEstadoAsistencia } from "./calculoAcademico.js";
import { listarAlumnosMatriculados } from "./matriculas.js";

const DIRECTOR_ATTENDANCE_SETTINGS_ID = "sistema";

function rows(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listDirectorStudents(courseId = "") {
  const [students, avisos] = await Promise.all([
    listarAlumnosMatriculados(courseId, { soloActivos: true }),
    getDocs(query(collectionGroup(firestore, "avisos"), where("gestionId", "==", gestionActual()), where("activa", "==", true)))
  ]);
  const porAlumno = new Map();
  rows(avisos).sort((a, b) => (a.updatedAt?.toMillis?.() || 0) - (b.updatedAt?.toMillis?.() || 0))
    .forEach((aviso) => porAlumno.set(aviso.alumnoId, aviso));
  return students.map((student) => ({ ...student, advertenciaAsistencia: porAlumno.get(student.id) || null }));
}

export async function listDirectorTeachers() {
  const [teachersSnap, assignmentsSnap] = await Promise.all([
    getDocs(query(collection(firestore, "usuarios"), where("rol", "==", "docente"), where("activo", "==", true))),
    getDocs(coleccionGestion(firestore, "asignaciones"))
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
  const snap = await getDocs(coleccionGestion(firestore, "horarios"));
  return Object.fromEntries(rows(snap).map((item) => [item.id, item]));
}

export async function listDirectorAttendance({ fecha = todayIso(), trimestreId = "" } = {}) {
  const snap = await getDocs(query(coleccionGestion(firestore, "asistencias"), where("fecha", "==", fecha)));
  return rows(snap).filter((item) => !trimestreId || (item.trimestreId || "t1") === trimestreId);
}

export async function listDirectorAttendanceRange({ fechaInicio, fechaFin, trimestreId = "" } = {}) {
  if (!fechaInicio || !fechaFin) return [];
  const snap = await getDocs(query(
    coleccionGestion(firestore, "asistencias"),
    where("fecha", ">=", fechaInicio),
    where("fecha", "<=", fechaFin)
  ));
  return rows(snap).filter((item) => !trimestreId || (item.trimestreId || "t1") === trimestreId);
}

export async function listDirectorAttendanceByTrimester(trimestreId = "t1") {
  const snap = await getDocs(query(
    coleccionGestion(firestore, "asistencias"),
    where("trimestreId", "==", trimestreId)
  ));
  return rows(snap);
}

export async function getDirectorAttendanceSettings() {
  const localValue = Number(localStorage.getItem("directorLimiteFaltas") ?? 4);
  const fallback = Number.isFinite(localValue) ? Math.max(0, Math.min(30, Math.round(localValue))) : 4;
  try {
    const snap = await getDoc(doc(firestore, "configuracion", DIRECTOR_ATTENDANCE_SETTINGS_ID));
    if (!snap.exists()) return { limiteFaltas: fallback, guardadoEnFirebase: false };
    const value = Number(snap.data()?.limiteFaltasDirector ?? 4);
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
    limiteFaltasDirector: safeLimit,
    actualizadoPorUid: auth.currentUser?.uid || "",
    actualizadoPor: auth.currentUser?.email || "director",
    updatedAt: serverTimestamp()
  };
  try {
    await setDoc(doc(firestore, "configuracion", DIRECTOR_ATTENDANCE_SETTINGS_ID), payload, { merge: true });
    localStorage.setItem("directorLimiteFaltas", String(safeLimit));
    return { id: DIRECTOR_ATTENDANCE_SETTINGS_ID, ...payload, limiteFaltas: safeLimit, guardadoEnFirebase: true };
  } catch {
    return { id: DIRECTOR_ATTENDANCE_SETTINGS_ID, ...payload, limiteFaltas: safeLimit, guardadoEnFirebase: false };
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
    gestionId: gestionActual(),
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const source = collection(firestore, "alumnos", student.id, "avisos");
  const anteriores = await getDocs(query(source, where("gestionId", "==", gestionActual()), where("trimestreId", "==", trimestreId), where("activa", "==", true)));
  const batch = writeBatch(firestore);
  anteriores.docs.forEach((aviso) => batch.update(aviso.ref, {
    activa: false, cerradoPorUid: auth.currentUser?.uid || "", cerradoAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
  const ref = isActive ? doc(source) : null;
  if (ref) batch.set(ref, payload);
  await batch.commit();
  return { ...payload, id: ref?.id || "" };
}

export async function listDirectorRecentAttendance(limitCount = 800) {
  const safeLimit = Math.max(1, Math.min(1500, Number(limitCount) || 800));
  const snap = await getDocs(query(
    coleccionGestion(firestore, "asistencias"),
    orderBy("fecha", "desc"),
    limit(safeLimit)
  ));
  return rows(snap);
}

export async function listDirectorActivities(trimestreId = "") {
  const activities = await listDirectorAllActivities(trimestreId);
  return activities.filter((item) => !item.interno && !["material", "materiales"].includes(String(item.tipo || "").toLowerCase()));
}

export async function listDirectorAllActivities(trimestreId = "") {
  const source = coleccionGestion(firestore, "actividades");
  const snap = await getDocs(trimestreId ? query(source, where("trimestreId", "==", trimestreId)) : source);
  return rows(snap).filter((item) => item.activo !== false);
}

export async function listDirectorGrades(trimestreId = "") {
  const filters = [];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = filters.length
    ? await getDocs(query(coleccionGestion(firestore, "calificaciones"), ...filters))
    : await getDocs(coleccionGestion(firestore, "calificaciones"));
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
    const key = normalizarEstadoAsistencia(item.estado) || "falta";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { presente: 0, atraso: 0, permiso: 0, falta: 0 });
}

export function attendancePercent(records = []) {
  if (!records.length) return 0;
  const valid = records.filter((item) => isAttendanceValue(item.estado)).length;
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

export function calculateCourseGrades(options = {}) {
  return calculateCourseTerm(options);
}

export { COURSES, DAYS, SUBJECTS };
