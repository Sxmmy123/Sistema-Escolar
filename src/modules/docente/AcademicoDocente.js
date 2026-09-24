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
  return ["examen", "saber"].includes(String(activity?.tipo || "").toLowerCase());
}

export function isMaterialActivity(activity = {}) {
  return ["material", "materiales"].includes(String(activity?.tipo || "").toLowerCase());
}

export function isScoredMaterialActivity(activity = {}) {
  const scoreEnabled = activity?.calificable === true || activity?.calificable === 1 || activity?.calificable === "true";
  return isMaterialActivity(activity) && scoreEnabled && Number(activity?.maximo || 0) > 0;
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

export function deliveryStateForGrade(grade = null) {
  const storedState = String(grade?.estadoEntrega || "").toLowerCase();
  if (["a_tiempo", "tardia", "no_presento", "pendiente_licencia", "sin_revisar"].includes(storedState)) {
    return storedState;
  }
  if (!grade) return "sin_revisar";
  return Number(grade.valor || 0) > 0 ? "a_tiempo" : "no_presento";
}

export function deliveryStateForActivity(activity = {}, grade = null, gradesByStudent = {}) {
  if (!grade) return "sin_revisar";
  if (Number(grade.valor || 0) <= 0) return "no_presento";

  const submittedDate = String(grade.fechaEntrega || "").slice(0, 10);
  if (!submittedDate) return deliveryStateForGrade(grade);

  const dates = Object.values(gradesByStudent || {})
    .filter((item) => Number(item?.valor || 0) > 0)
    .map((item) => String(item?.fechaEntrega || "").slice(0, 10))
    .filter(Boolean);

  if (dates.length) {
    const counts = dates.reduce((map, date) => {
      map[date] = (map[date] || 0) + 1;
      return map;
    }, {});
    const referenceDate = Object.entries(counts)
      .sort(([dateA, countA], [dateB, countB]) => Number(countB) - Number(countA) || dateA.localeCompare(dateB))[0]?.[0];
    if (referenceDate) return submittedDate === referenceDate ? "a_tiempo" : "tardia";
  }

  return "a_tiempo";
}

export function responsibilityContribution(task, studentId, gradesMap, attendanceRows = []) {
  const grade = gradesMap[task.id]?.[studentId] || null;
  const state = deliveryStateForActivity(task, grade, gradesMap[task.id] || {});
  if (state === "a_tiempo") return 100;
  if (state === "tardia") return 50;
  if (state === "no_presento") return 0;
  if (["pendiente_licencia", "sin_revisar"].includes(state) && grade) return null;

  const reviewState = String(task.estadoRevision || "").toLowerCase();
  if (["sin_iniciar", "en_proceso"].includes(reviewState)) return null;
  const attendanceState = attendanceStateForDate(studentId, task.fecha, attendanceRows);
  if (["permiso", "licencia"].includes(String(attendanceState || "").toLowerCase())) return null;
  return 0;
}

export function responsibilityScore(tasks, studentId, gradesMap, attendanceRows = []) {
  const values = tasks
    .map((task) => responsibilityContribution(task, studentId, gradesMap, attendanceRows))
    .filter((value) => value != null);
  if (!values.length) return 35;
  return gradeNumber(values.reduce((total, value) => total + value, 0) / values.length);
}

export function materialResponsibilityScore(materials, studentId, gradesMap) {
  const scoredMaterials = materials.filter(isScoredMaterialActivity);
  const possible = scoredMaterials.reduce((total, material) => total + Math.max(Number(material.maximo || 0), 0), 0);
  if (!possible) return null;
  const obtained = scoredMaterials.reduce((total, material) => {
    const maximum = Math.max(Number(material.maximo || 0), 0);
    const rawValue = Number(gradesMap[material.id]?.[studentId]?.valor ?? 0);
    const safeValue = Number.isFinite(rawValue) ? Math.max(0, Math.min(maximum, rawValue)) : 0;
    return total + safeValue;
  }, 0);
  return gradeNumber((obtained * 100) / possible);
}

export function calculateStudentTerm(student, activities, gradesMap, attendanceRows, serExtras = [], autoGrade = null) {
  const materials = activities.filter(isMaterialActivity);
  const tasks = activities.filter((activity) => !isSaberActivity(activity) && !isMaterialActivity(activity));
  const exams = activities.filter(isSaberActivity);
  const hacer100 = averageGrades(tasks.map((activity) => studentActivityGrade(activity, student.id, gradesMap)));
  const saber100 = averageGrades(exams.map((activity) => studentActivityGrade(activity, student.id, gradesMap)));
  const asistencia100 = attendanceScore(student.id, attendanceRows);
  const puntualidad100 = punctualityScore(student.id, attendanceRows);
  const materialScore = materialResponsibilityScore(materials, student.id, gradesMap);
  const taskResponsibilityValues = tasks
    .map((task) => responsibilityContribution(task, student.id, gradesMap, attendanceRows))
    .filter((value) => value != null);
  const responsibilityValues = materialScore == null
    ? taskResponsibilityValues
    : [...taskResponsibilityValues, materialScore];
  const responsabilidad100 = responsibilityValues.length
    ? gradeNumber(responsibilityValues.reduce((total, value) => total + value, 0) / responsibilityValues.length)
    : 35;
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
    materials,
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


