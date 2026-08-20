import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where
} from "firebase/firestore";
import { COURSES, DAYS, SUBJECTS, findCourse, findSubject } from "../data/catalog.js";
import { firestore } from "../firebase/client.js";
import { todayIso } from "./teacherData.js";

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
  const filters = [where("fecha", "==", fecha)];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = await getDocs(query(collection(firestore, "asistencias"), ...filters));
  return rows(snap);
}

export async function listDirectorActivities(trimestreId = "") {
  const filters = [where("activo", "==", true)];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = await getDocs(query(collection(firestore, "actividades"), ...filters));
  return rows(snap).filter((item) => !item.interno);
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
  const courseActivities = activities.filter((activity) => activity.cursoId === courseId && activity.activo !== false);
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
