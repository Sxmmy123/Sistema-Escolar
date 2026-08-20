export const attendanceStates = [
  { id: "presente", label: "Presente", short: "P", tone: "bg-green-100 text-green-800 border-green-200" },
  { id: "atraso", label: "Atraso", short: "A", tone: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  { id: "permiso", label: "Permiso", short: "L", tone: "bg-purple-100 text-purple-800 border-purple-200" },
  { id: "falta", label: "Falta", short: "F", tone: "bg-red-100 text-red-800 border-red-200" }
];

export function attendanceTone(stateId) {
  return attendanceStates.find((item) => item.id === stateId)?.tone || "bg-slate-100 text-slate-500 border-slate-200";
}

export function attendanceLabel(stateId) {
  return attendanceStates.find((item) => item.id === stateId)?.label || "Falta";
}

export function attendanceShort(stateId) {
  return attendanceStates.find((item) => item.id === stateId)?.short || "F";
}

export function gradeNumber(value) {
  const number = Math.round(Number(value || 0));
  return Math.max(35, Math.min(100, number || 35));
}

export function gradeTone(value) {
  return gradeNumber(value) <= 50
    ? "bg-red-100 text-red-700"
    : "bg-green-100 text-green-800";
}

export function weightedGrade(value, weight) {
  return Math.round((gradeNumber(value) * weight) / 100);
}

export function averageGrades(values) {
  if (!values.length) return 35;
  return gradeNumber(values.reduce((total, value) => total + gradeNumber(value), 0) / values.length);
}

export function gradeByActivityAndStudent(grades = []) {
  const map = {};
  grades.forEach((grade) => {
    if (!grade.actividadId || !grade.alumnoId) return;
    if (!map[grade.actividadId]) map[grade.actividadId] = {};
    map[grade.actividadId][grade.alumnoId] = grade;
  });
  return map;
}

export function attendanceByStudentAndDate(records = []) {
  const byStudent = {};
  const registeredDates = new Set();
  records.forEach((record) => {
    if (!record.fecha || !record.alumnoId) return;
    registeredDates.add(record.fecha);
    if (!byStudent[record.alumnoId]) byStudent[record.alumnoId] = {};
    byStudent[record.alumnoId][record.fecha] = record.estado || "falta";
  });
  return { byStudent, registeredDates: [...registeredDates] };
}

export function attendanceStateForDate(studentId, fecha, attendanceRows = []) {
  if (!studentId || !fecha) return "";
  return attendanceRows.find((record) => record.alumnoId === studentId && record.fecha === fecha)?.estado || "";
}

export function activityHasGrades(activity, gradesMap = {}) {
  return Object.keys(gradesMap[activity.id] || {}).length > 0;
}

export function isSaberActivity(activity = {}) {
  return ["examen", "saber"].includes(String(activity.tipo || "").toLowerCase());
}

export function isAttendanceValue(state) {
  return ["presente", "atraso", "permiso"].includes(state);
}

export function isPunctualValue(state) {
  return ["presente", "permiso"].includes(state);
}

export function attendanceScore(studentId, attendanceRows = []) {
  const { byStudent, registeredDates } = attendanceByStudentAndDate(attendanceRows);
  if (!registeredDates.length) return 35;
  const attended = registeredDates.filter((date) => isAttendanceValue(byStudent[studentId]?.[date] || "falta")).length;
  return gradeNumber((attended * 100) / registeredDates.length);
}

export function punctualityScore(studentId, attendanceRows = []) {
  const { byStudent, registeredDates } = attendanceByStudentAndDate(attendanceRows);
  const attendedStates = registeredDates
    .map((date) => byStudent[studentId]?.[date] || "falta")
    .filter(isAttendanceValue);
  if (!attendedStates.length) return 35;
  const punctual = attendedStates.filter(isPunctualValue).length;
  return gradeNumber((punctual * 100) / attendedStates.length);
}

export function studentActivityGrade(activity, studentId, gradesMap) {
  return gradeNumber(gradesMap[activity.id]?.[studentId]?.nota || 35);
}

export function optionalStudentActivityGrade(activity, studentId, gradesMap) {
  const grade = gradesMap[activity.id]?.[studentId];
  return grade ? gradeNumber(grade.nota) : "";
}

export function responsibilityScore(tasks, studentId, gradesMap) {
  if (!tasks.length) return 35;
  const presented = tasks.filter((task) => studentActivityGrade(task, studentId, gradesMap) > 35).length;
  return gradeNumber((presented * 100) / tasks.length);
}

export function calculateStudentTerm(student, activities, gradesMap, attendanceRows, serExtras = [], autoGrade = null) {
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
  const final = ser10 + saber45 + hacer40 + auto5;
  return {
    tasks,
    exams,
    asistencia100,
    puntualidad100,
    responsabilidad100,
    ser100,
    saber100,
    hacer100,
    auto100,
    ser10,
    saber45,
    hacer40,
    auto5,
    final
  };
}


