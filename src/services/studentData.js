import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { findCourse, findSubject, SUBJECTS } from "../data/catalog.js";
import { auth, firestore } from "../firebase/client.js";

export const STUDENT_TRIMESTERS = [
  { id: "t1", label: "1er trimestre" },
  { id: "t2", label: "2do trimestre" },
  { id: "t3", label: "3er trimestre" }
];

function currentUid() {
  return sessionStorage.getItem("sesionUid") || auth.currentUser?.uid || "";
}

function currentLocalStudentId() {
  return sessionStorage.getItem("sesionAlumnoId") || "";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

function gradeNumber(value) {
  const number = Math.round(Number(value || 0));
  return Math.max(35, Math.min(100, number || 35));
}

function weightedGrade(value, weight) {
  return Math.round((gradeNumber(value) * weight) / 100);
}

function averageGrades(values) {
  if (!values.length) return 35;
  return gradeNumber(values.reduce((total, value) => total + gradeNumber(value), 0) / values.length);
}

function isSaberActivity(activity = {}) {
  return ["examen", "saber"].includes(String(activity.tipo || "").toLowerCase());
}

function isAttendanceValue(state) {
  return ["presente", "atraso", "permiso", "licencia"].includes(String(state || "").toLowerCase());
}

function isPunctualValue(state) {
  return ["presente", "permiso", "licencia"].includes(String(state || "").toLowerCase());
}

function attendanceScore(studentId, attendanceRows = []) {
  const registeredDates = [...new Set(attendanceRows.filter((item) => item.fecha).map((item) => item.fecha))];
  if (!registeredDates.length) return 35;
  const byDate = new Map(attendanceRows.map((item) => [item.fecha, item.estado || "falta"]));
  const attended = registeredDates.filter((date) => isAttendanceValue(byDate.get(date) || "falta")).length;
  return gradeNumber((attended * 100) / registeredDates.length);
}

function punctualityScore(studentId, attendanceRows = []) {
  const states = attendanceRows
    .filter((item) => item.fecha)
    .map((item) => item.estado || "falta")
    .filter(isAttendanceValue);
  if (!states.length) return 35;
  const punctual = states.filter(isPunctualValue).length;
  return gradeNumber((punctual * 100) / states.length);
}

function gradeByActivityAndStudent(grades = []) {
  const map = {};
  grades.forEach((grade) => {
    if (!grade.actividadId || !grade.alumnoId) return;
    if (!map[grade.actividadId]) map[grade.actividadId] = {};
    map[grade.actividadId][grade.alumnoId] = grade;
  });
  return map;
}

function studentActivityGrade(activity, studentId, gradesMap) {
  return gradeNumber(gradesMap[activity.id]?.[studentId]?.nota || 35);
}

function responsibilityScore(tasks, studentId, gradesMap) {
  if (!tasks.length) return 35;
  const presented = tasks.filter((task) => studentActivityGrade(task, studentId, gradesMap) > 35).length;
  return gradeNumber((presented * 100) / tasks.length);
}

function calculateStudentTerm(student, activities, gradesMap, attendanceRows, serExtras = [], autoGrade = null) {
  const tasks = activities.filter((activity) => !isSaberActivity(activity));
  const exams = activities.filter(isSaberActivity);
  const hacer100 = averageGrades(tasks.map((activity) => studentActivityGrade(activity, student.id, gradesMap)));
  const saber100 = averageGrades(exams.map((activity) => studentActivityGrade(activity, student.id, gradesMap)));
  const asistencia100 = attendanceScore(student.id, attendanceRows);
  const puntualidad100 = punctualityScore(student.id, attendanceRows);
  const responsabilidad100 = responsibilityScore(tasks, student.id, gradesMap);
  const ser100 = averageGrades([asistencia100, puntualidad100, responsabilidad100, ...serExtras]);
  const auto100 = autoGrade ?? 35;
  const ser10 = weightedGrade(ser100, 10);
  const saber45 = weightedGrade(saber100, 45);
  const hacer40 = weightedGrade(hacer100, 40);
  const auto5 = weightedGrade(auto100, 5);
  return {
    ser100,
    saber100,
    hacer100,
    auto100,
    ser10,
    saber45,
    hacer40,
    auto5,
    final: ser10 + saber45 + hacer40 + auto5
  };
}

export async function getStudentContext(uid = currentUid()) {
  const localStudentId = currentLocalStudentId();
  if (localStudentId) {
    const studentSnap = await getDoc(doc(firestore, "alumnos", localStudentId));
    if (!studentSnap.exists()) throw new Error("No se encontro el alumno vinculado.");
    const student = { id: studentSnap.id, ...studentSnap.data() };
    const profile = {
      rol: "alumno",
      usuario: sessionStorage.getItem("sesionUsuario") || student.usuario || student.ci || student.id,
      alumnoId: localStudentId,
      ci: student.ci || "",
      cursoId: student.cursoId || sessionStorage.getItem("sesionAlumnoCursoId") || ""
    };
    return {
      uid: `alumno:${localStudentId}`,
      profile,
      student,
      course: findCourse(student.cursoId || profile.cursoId)
    };
  }

  if (!uid) throw new Error("No hay sesion de alumno.");

  const profileSnap = await getDoc(doc(firestore, "usuarios", uid));
  if (!profileSnap.exists()) throw new Error("No se encontro el perfil del alumno.");

  const profile = profileSnap.data() || {};
  const studentId = profile.alumnoId || profile.ci || profile.usuario;
  const studentSnap = studentId ? await getDoc(doc(firestore, "alumnos", studentId)) : null;
  const student = studentSnap?.exists() ? { id: studentSnap.id, ...studentSnap.data() } : {
    id: studentId,
    nombre: profile.nombre,
    ci: profile.ci || profile.usuario,
    cursoId: profile.cursoId
  };

  return {
    uid,
    profile,
    student,
    course: findCourse(student.cursoId || profile.cursoId)
  };
}

function buildBulletin({ student, activities, grades, attendance, trimesterId }) {
  const gradesMap = gradeByActivityAndStudent(grades);
  return SUBJECTS.map((subject) => {
    const subjectActivities = activities.filter((activity) => activity.materiaId === subject.id);
    const gradedSubjectActivities = subjectActivities.filter((activity) => gradesMap[activity.id]?.[student.id]);
    const serCriteria = subjectActivities.filter((activity) => String(activity.tipo || "").toLowerCase() === "ser");
    const autoActivity = subjectActivities.find((activity) => String(activity.tipo || "").toLowerCase() === "auto");
    const visibleActivities = gradedSubjectActivities.filter((activity) => !activity.interno && !["ser", "auto"].includes(String(activity.tipo || "").toLowerCase()));
    const internalActivities = serCriteria.concat(autoActivity ? [autoActivity] : []);
    const hasData = visibleActivities.length || internalActivities.some((activity) => gradesMap[activity.id]?.[student.id]);
    const serExtraValues = serCriteria.map((item) => studentActivityGrade(item, student.id, gradesMap));
    const autoGrade = autoActivity ? gradesMap[autoActivity.id]?.[student.id]?.nota ?? null : null;
    const calc = calculateStudentTerm(student, visibleActivities, gradesMap, attendance, serExtraValues, autoGrade);
    return {
      subjectId: subject.id,
      subjectName: subject.nombre,
      subjectShort: subject.corto || subject.nombre,
      color: subject.color,
      trimesterId,
      hasData,
      ...calc
    };
  });
}

export async function getStudentDashboardData() {
  const context = await getStudentContext();
  const courseId = context.student.cursoId || context.profile.cursoId;
  const studentId = context.student.id;
  const now = todayIso();

  const [activitiesSnap, gradesSnap, attendanceSnap] = await Promise.all([
    courseId ? getDocs(query(collection(firestore, "actividades"), where("cursoId", "==", courseId))) : { docs: [] },
    studentId ? getDocs(query(collection(firestore, "calificaciones"), where("alumnoId", "==", studentId))) : { docs: [] },
    studentId ? getDocs(query(collection(firestore, "asistencias"), where("alumnoId", "==", studentId))) : { docs: [] }
  ]);

  const allActivities = activitiesSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")));
  const allGrades = gradesSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const allAttendance = attendanceSnap.docs.map((item) => ({ id: item.id, ...item.data() }));

  const preferredTrimester = normalizeTrimester(context.profile.trimestreActivo || context.student.trimestreActivo);
  const trimesterId = preferredTrimester || inferActiveTrimester({ activities: allActivities, grades: allGrades, attendance: allAttendance });
  const activities = allActivities.filter((activity) => (activity.trimestreId || "t1") === trimesterId);
  const grades = allGrades.filter((grade) => (grade.trimestreId || "t1") === trimesterId);
  const attendance = allAttendance.filter((item) => (item.trimestreId || "t1") === trimesterId);
  const gradeByActivity = new Map(grades.map((grade) => [grade.actividadId, grade]));

  const programmed = activities.filter((activity) => !activity.interno && String(activity.fecha || "") >= now);
  const missing = activities.filter((activity) => !activity.interno && String(activity.fecha || "") < now && !gradeByActivity.has(activity.id));
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
    programmed,
    missing,
    attendance,
    attendancePercent: attendanceCount ? Math.round((presentCount / attendanceCount) * 100) : 0,
    bulletin
  };
}

export function subjectName(subjectId) {
  return findSubject(subjectId)?.nombre || subjectId || "-";
}
