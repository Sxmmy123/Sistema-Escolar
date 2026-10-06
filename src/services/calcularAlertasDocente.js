import { revisionDisponibleParaRegularizar } from "./revisionActividad.js";

export const ALERT_THRESHOLDS = { activityCount: 6, absenceStreak: 3 };

function isEvaluable(activity) {
  const type = String(activity.tipo || "").toLowerCase();
  return !activity.interno && !["ser", "auto"].includes(type) &&
    (!["material", "materiales"].includes(type) || activity.calificable === true);
}

export function calculateTeacherAlerts({ students = [], attendance = [], grades = [], activities = [], courses = [], followUps = [], trimesterId = "t1", today = "", thresholds = ALERT_THRESHOLDS }) {
  const assigned = new Map(courses.map((course) => [course.id, new Set(course.materias || [])]));
  const activeStudents = students.filter((student) => student.activo !== false && assigned.has(student.cursoId));
  const studentsById = new Map(activeStudents.map((student) => [student.id, student]));
  const studentsByCourse = new Map(courses.map((course) => [course.id, activeStudents.filter((student) => student.cursoId === course.id)]));
  const attendanceByCourse = new Map();
  attendance.forEach((record) => {
    const student = studentsById.get(record.alumnoId);
    const courseId = record.cursoId || student?.cursoId;
    if (!student || courseId !== student.cursoId || (record.trimestreId || "t1") !== trimesterId) return;
    if (!record.fecha || (today && record.fecha > today)) return;
    if (!attendanceByCourse.has(courseId)) attendanceByCourse.set(courseId, new Map());
    const byDate = attendanceByCourse.get(courseId);
    if (!byDate.has(record.fecha)) byDate.set(record.fecha, new Map());
    byDate.get(record.fecha).set(student.id, String(record.estado || "").toLowerCase());
  });

  const followUpByStudent = new Map(followUps
    .filter((item) => item.trimestreId === trimesterId)
    .map((item) => [item.alumnoId, item.ultimaFaltaAtendida || ""]));
  const absences = [];
  activeStudents.forEach((student) => {
    const byDate = attendanceByCourse.get(student.cursoId) || new Map();
    const dates = [...byDate.keys()].sort();
    const missingDates = dates.filter((date) => byDate.get(date).get(student.id) === "falta");
    let streak = 0;
    for (let index = dates.length - 1; index >= 0; index -= 1) {
      if (byDate.get(dates[index]).get(student.id) !== "falta") break;
      streak += 1;
    }
    const lastDate = missingDates.at(-1) || "";
    if (streak < thresholds.absenceStreak || followUpByStudent.get(student.id) >= lastDate) return;
    absences.push({
      id: `absence:${student.id}`, kind: "absence", student, courseId: student.cursoId,
      count: streak, total: missingDates.length, lastDate, dates: missingDates
    });
  });
  absences.sort((a, b) => b.count - a.count || a.student.nombre.localeCompare(b.student.nombre, "es"));

  const relevantActivities = activities.filter((activity) =>
    assigned.get(activity.cursoId)?.has(activity.materiaId) &&
    (activity.trimestreId || "t1") === trimesterId &&
    (!today || !activity.fecha || activity.fecha <= today) && isEvaluable(activity));
  const activitiesById = new Map(relevantActivities.map((activity) => [activity.id, activity]));
  const gradesByActivity = new Map();
  grades.forEach((grade) => {
    const student = studentsById.get(grade.alumnoId);
    if (!student || (grade.trimestreId || "t1") !== trimesterId ||
        (grade.cursoId && grade.cursoId !== student.cursoId) ||
        !assigned.get(student.cursoId)?.has(grade.materiaId)) return;
    if (!activitiesById.has(grade.actividadId)) return;
    if (!gradesByActivity.has(grade.actividadId)) gradesByActivity.set(grade.actividadId, new Map());
    gradesByActivity.get(grade.actividadId).set(student.id, grade);
  });

  const alertsByStudent = new Map();
  function studentAlert(student) {
    if (!alertsByStudent.has(student.id)) alertsByStudent.set(student.id, {
      id: `student:${student.id}`, kind: "student", student,
      courseId: student.cursoId, missing: [], pending: []
    });
    return alertsByStudent.get(student.id);
  }
  relevantActivities.forEach((activity) => {
    const enrolled = studentsByCourse.get(activity.cursoId) || [];
    const activityGrades = gradesByActivity.get(activity.id) || new Map();
    const reviewState = activity.estadoRevision || (activityGrades.size ? "cerrada" : "sin_iniciar");
    if (revisionDisponibleParaRegularizar({ ...activity, estadoRevision: reviewState }, today)) {
      enrolled.forEach((student) => {
        const grade = activityGrades.get(student.id);
        if (grade && Number(grade.valor || 0) > 0) return;
        studentAlert(student).missing.push({
          activityId: activity.id, title: activity.titulo || "Actividad", subjectId: activity.materiaId,
          date: activity.fecha || "", attendance: attendanceByCourse.get(student.cursoId)?.get(activity.fecha)?.get(student.id) || "sin registro"
        });
      });
      return;
    }
    if (reviewState === "cerrada" || !activity.fecha) return;
    const attendanceOnDate = attendanceByCourse.get(activity.cursoId)?.get(activity.fecha);
    if (!attendanceOnDate) return;
    enrolled.forEach((student) => {
      const attendanceState = attendanceOnDate.get(student.id);
      if (!["presente", "atraso"].includes(attendanceState) || activityGrades.has(student.id)) return;
      studentAlert(student).pending.push({
        activityId: activity.id, title: activity.titulo || "Actividad", subjectId: activity.materiaId,
        date: activity.fecha, attendance: attendanceState
      });
    });
  });

  const studentAlerts = [...alertsByStudent.values()]
    .filter((item) => item.missing.length + item.pending.length >= thresholds.activityCount)
    .sort((a, b) => b.missing.length - a.missing.length || b.pending.length - a.pending.length ||
      a.student.nombre.localeCompare(b.student.nombre, "es"));
  return { absences, studentAlerts };
}

export function teacherAlertKeys(item) {
  if (item.kind === "absence") return [`absence:${item.student.id}:${item.lastDate}`];
  return [
    ...item.missing.map((entry) => `missing:${item.student.id}:${entry.activityId}`),
    ...item.pending.map((entry) => `pending:${item.student.id}:${entry.activityId}`)
  ];
}

export function unseenTeacherAlerts(alerts, seenKeys = []) {
  const seen = new Set(seenKeys);
  return alerts.filter((item) => teacherAlertKeys(item).some((key) => !seen.has(key)));
}
