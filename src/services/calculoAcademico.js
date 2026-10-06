export function gradeNumber(value) {
  const number = Math.round(Number(value || 0));
  return Math.max(35, Math.min(100, number || 35));
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
  return attendanceRows.find((record) => record.alumnoId === studentId && record.fecha === fecha)?.estado || "";
}

export function activityHasGrades(activity = {}, gradesMap = {}) {
  return activity.activo !== false && (
    ["en_proceso", "cerrada"].includes(activity.estadoRevision) ||
    activity.origen === "carga_historica" ||
    Object.keys(gradesMap[activity.id] || {}).length > 0
  );
}

export function isSaberActivity(activity = {}) {
  return ["examen", "saber"].includes(String(activity.tipo || "").toLowerCase());
}

export function isMaterialActivity(activity = {}) {
  return ["material", "materiales"].includes(String(activity.tipo || "").toLowerCase());
}

export function isScoredMaterialActivity(activity = {}) {
  return isMaterialActivity(activity) && [true, 1, "true"].includes(activity.calificable) && Number(activity.maximo || 0) > 0;
}

export function normalizarEstadoAsistencia(state) {
  const normalized = String(state || "").trim().toLowerCase();
  return normalized === "licencia" ? "permiso" : normalized;
}

export function isAttendanceValue(state) {
  return ["presente", "atraso", "permiso"].includes(normalizarEstadoAsistencia(state));
}

export function isPunctualValue(state) {
  return ["presente", "permiso"].includes(normalizarEstadoAsistencia(state));
}

export function attendanceScore(studentId, attendanceRows = []) {
  const states = Object.values(attendanceByStudentAndDate(attendanceRows).byStudent[studentId] || {});
  return states.length ? gradeNumber((states.filter(isAttendanceValue).length * 100) / states.length) : 35;
}

export function punctualityScore(studentId, attendanceRows = []) {
  const states = Object.values(attendanceByStudentAndDate(attendanceRows).byStudent[studentId] || {}).filter(isAttendanceValue);
  return states.length ? gradeNumber((states.filter(isPunctualValue).length * 100) / states.length) : 35;
}

export function studentActivityGrade(activity, studentId, gradesMap) {
  return gradeNumber(gradesMap[activity.id]?.[studentId]?.nota || 35);
}

export function optionalStudentActivityGrade(activity, studentId, gradesMap) {
  const grade = gradesMap[activity.id]?.[studentId];
  return grade ? gradeNumber(grade.nota) : "";
}

export function deliveryStateForGrade(grade = null) {
  const state = String(grade?.estadoEntrega || "").toLowerCase();
  if (["a_tiempo", "tardia", "no_presento", "pendiente_licencia", "sin_revisar"].includes(state)) return state;
  return !grade ? "sin_revisar" : Number(grade.valor || 0) > 0 ? "a_tiempo" : "no_presento";
}

export function deliveryStateForActivity(activity = {}, grade = null, gradesByStudent = {}) {
  if (!grade) return "sin_revisar";
  if (Number(grade.valor || 0) <= 0) return "no_presento";
  const stored = String(grade.estadoEntrega || "").toLowerCase();
  if (["a_tiempo", "tardia"].includes(stored)) return stored;
  const submittedDate = String(grade.fechaEntrega || "").slice(0, 10);
  if (!submittedDate) return deliveryStateForGrade(grade);

  // Legacy grades without an explicit delivery state use the review date when available.
  const reviewDate = String(activity.revisionFinalizadaFecha || "").slice(0, 10);
  if (reviewDate) return submittedDate <= reviewDate ? "a_tiempo" : "tardia";
  const dates = Object.values(gradesByStudent)
    .filter((item) => Number(item?.valor || 0) > 0)
    .map((item) => String(item.fechaEntrega || "").slice(0, 10))
    .filter(Boolean);
  if (!dates.length) return "a_tiempo";
  const counts = dates.reduce((result, date) => {
    result[date] = (result[date] || 0) + 1;
    return result;
  }, {});
  const referenceDate = Object.entries(counts)
    .sort(([dateA, countA], [dateB, countB]) => countB - countA || dateA.localeCompare(dateB))[0][0];
  return submittedDate <= referenceDate ? "a_tiempo" : "tardia";
}

export function responsibilityContribution(task, studentId, gradesMap, attendanceRows = []) {
  const grade = gradesMap[task.id]?.[studentId] || null;
  const attendanceState = String(attendanceStateForDate(studentId, task.fecha, attendanceRows)).toLowerCase();
  const licensed = ["permiso", "licencia"].includes(attendanceState);
  if (licensed) return Number(grade?.valor || 0) > 0 ? 100 : null;
  const state = deliveryStateForActivity(task, grade, gradesMap[task.id] || {});
  if (state === "a_tiempo") return 100;
  if (state === "tardia") return 50;
  if (state === "no_presento") return 0;
  if (grade || ["sin_iniciar", "en_proceso"].includes(task.estadoRevision)) return null;
  return 0;
}

export function responsibilityScore(tasks, studentId, gradesMap, attendanceRows = []) {
  const values = tasks.map((task) => responsibilityContribution(task, studentId, gradesMap, attendanceRows)).filter((value) => value != null);
  return values.length ? gradeNumber(values.reduce((sum, value) => sum + value, 0) / values.length) : 35;
}

export function materialResponsibilityScore(materials, studentId, gradesMap) {
  const scored = materials.filter(isScoredMaterialActivity);
  const possible = scored.reduce((sum, material) => sum + Math.max(Number(material.maximo || 0), 0), 0);
  if (!possible) return null;
  const obtained = scored.reduce((sum, material) => {
    const maximum = Math.max(Number(material.maximo || 0), 0);
    const value = Number(gradesMap[material.id]?.[studentId]?.valor ?? 0);
    return sum + (Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : 0);
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
  const values = tasks.map((task) => responsibilityContribution(task, student.id, gradesMap, attendanceRows)).filter((value) => value != null);
  if (materialScore != null) values.push(materialScore);
  const responsabilidad100 = values.length ? gradeNumber(values.reduce((sum, value) => sum + value, 0) / values.length) : 35;
  const ser100 = averageGrades([asistencia100, puntualidad100, responsabilidad100, ...serExtras]);
  const auto100 = autoGrade ?? 35;
  const ser10 = weightedGrade(ser100, 10);
  const saber45 = weightedGrade(saber100, 45);
  const hacer40 = weightedGrade(hacer100, 40);
  const auto5 = weightedGrade(auto100, 5);
  return { tasks, exams, materials, asistencia100, puntualidad100, responsabilidad100, ser100, saber100, hacer100, auto100, ser10, saber45, hacer40, auto5, final: ser10 + saber45 + hacer40 + auto5 };
}

export function calculateSubjectTerm(student, subjectId, activities, gradesMap, attendanceRows) {
  const subjectActivities = activities.filter((activity) => activity.materiaId === subjectId && activity.activo !== false);
  const typeOf = (activity) => String(activity.tipo || "").toLowerCase();
  const gradedActivities = subjectActivities.filter((activity) => !activity.interno && !["ser", "auto"].includes(typeOf(activity)) && activityHasGrades(activity, gradesMap));
  const serCriteria = subjectActivities.filter((activity) => typeOf(activity) === "ser" && gradesMap[activity.id]?.[student.id]);
  const autoActivity = subjectActivities.find((activity) => typeOf(activity) === "auto") || null;
  const autoGradeRecord = autoActivity ? gradesMap[autoActivity.id]?.[student.id] : null;
  const serExtraValues = serCriteria.map((activity) => studentActivityGrade(activity, student.id, gradesMap));
  return {
    ...calculateStudentTerm(student, gradedActivities, gradesMap, attendanceRows, serExtraValues, autoGradeRecord?.nota ?? null),
    hasData: Boolean(gradedActivities.length || serCriteria.length || autoGradeRecord),
    gradedActivities, serCriteria, autoActivity, autoGradeRecord,
    pendingCount: gradedActivities.filter((activity) => !isMaterialActivity(activity) && !gradesMap[activity.id]?.[student.id]).length
  };
}

export function calculateCourseTerm({ students = [], activities = [], grades = [], attendanceRows = [], courseId, trimestreId = "t1" }) {
  const courseActivities = activities.filter((activity) => activity.cursoId === courseId && (activity.trimestreId || "t1") === trimestreId && activity.activo !== false);
  const activityIds = new Set(courseActivities.map((activity) => activity.id));
  const gradesMap = gradeByActivityAndStudent(grades.filter((grade) => activityIds.has(grade.actividadId)));
  const courseStudents = students.filter((student) => student.cursoId === courseId && student.activo !== false);
  const studentIds = new Set(courseStudents.map((student) => student.id));
  const attendance = attendanceRows.filter((record) => (record.cursoId === courseId || (!record.cursoId && studentIds.has(record.alumnoId))) && (record.trimestreId || "t1") === trimestreId);
  const subjects = [...new Set(courseActivities.filter((activity) => activityHasGrades(activity, gradesMap)).map((activity) => activity.materiaId).filter(Boolean))];
  const studentResults = courseStudents.map((student) => {
    const subjectResults = Object.fromEntries(subjects.map((subjectId) => [subjectId, calculateSubjectTerm(student, subjectId, courseActivities, gradesMap, attendance)]));
    const finals = Object.values(subjectResults).filter((result) => result.hasData).map((result) => result.final);
    return { student, subjectResults, average: finals.length ? Math.round(finals.reduce((sum, value) => sum + value, 0) / finals.length) : 0, pending: Object.values(subjectResults).reduce((sum, result) => sum + result.pendingCount, 0) };
  });
  const withData = studentResults.filter((result) => result.average > 0);
  return {
    courseId, studentResults,
    average: withData.length ? Math.round(withData.reduce((sum, result) => sum + result.average, 0) / withData.length) : 0,
    approved: withData.filter((result) => result.average >= 51).length,
    risk: withData.filter((result) => result.average < 51).length,
    pending: studentResults.reduce((sum, result) => sum + result.pending, 0),
    totalCells: studentResults.length * courseActivities.filter((activity) => !activity.interno && !isMaterialActivity(activity) && activityHasGrades(activity, gradesMap)).length
  };
}

export function academicTrimester(activities = [], grades = [], preferred = "") {
  if (["t1", "t2", "t3"].includes(preferred)) return preferred;
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const counts = { t1: 0, t2: 0, t3: 0 };
  grades.forEach((grade) => {
    const term = grade.trimestreId || byId.get(grade.actividadId)?.trimestreId || "t1";
    if (term in counts) counts[term] += 1;
  });
  return ["t1", "t2", "t3"].sort((a, b) => counts[b] - counts[a])[0];
}
