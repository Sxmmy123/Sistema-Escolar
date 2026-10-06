import { deliveryStateForActivity, deliveryStateForGrade, isMaterialActivity, isSaberActivity, isScoredMaterialActivity } from "./AcademicoDocente.js";
import { DELIVERY_STATES, todayIso } from "../../services/teacherData.js";
import { teacherState } from "./EstadoDocente.js";

export function resolvedActivityReviewState(activity = null, gradesMap = {}) {
  const stored = String(activity?.estadoRevision || "").toLowerCase();
  if (["sin_iniciar", "en_proceso", "cerrada"].includes(stored)) return stored;
  return Object.keys(gradesMap || {}).length ? "cerrada" : "sin_iniciar";
}

export function deliveryEditorData(activity = {}, grade = null, attendanceState = "", gradesForActivity = {}) {
  const storedState = deliveryStateForGrade(grade);
  const wasNotSubmitted = storedState === DELIVERY_STATES.NOT_SUBMITTED;
  const fechaEntrega = String(
    grade?.fechaEntrega || todayIso()
  ).slice(0, 10);
  const estadoEntrega = wasNotSubmitted
    ? DELIVERY_STATES.NOT_SUBMITTED
    : deliveryStateForActivity(
      activity,
      { ...grade, valor: grade?.valor ?? 1, fechaEntrega },
      gradesForActivity
    );
  return { estadoEntrega, fechaEntrega };
}

export function readGradeDelivery(activity = {}, student = null, gradesMap = {}, attendanceMap = {}) {
  const grade = gradesMap?.[student?.id] || null;
  const pending = activity.entregasPendientes?.[student?.id] || null;
  const fechaEntrega = String(grade?.fechaEntrega || pending?.fechaEntrega || todayIso()).slice(0, 10);
  const attendanceState = String(attendanceMap?.[student?.id]?.estado || "");
  return {
    estadoEntrega: deliveryStateForActivity(activity, { ...grade, valor: Math.max(1, Number(grade?.valor || 0)), fechaEntrega }, gradesMap),
    fechaEntrega,
    asistenciaActividad: attendanceState
  };
}

export function sortStudentsByName(students = []) {
  return [...students].sort((a, b) => {
    const nameOrder = String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" });
    return nameOrder || Number(a.numeroLista || 9999) - Number(b.numeroLista || 9999);
  });
}

export function selectedCourse(context = teacherState.context) {
  return context?.courses?.find((course) => course.id === teacherState.selectedCourseId) || context?.courses?.[0] || null;
}

export function activityEvaluationLabel(activity = {}) {
  if (isMaterialActivity(activity)) return "Responsabilidad";
  return isSaberActivity(activity) ? "Saber" : "Hacer";
}

export function activityPointsLabel(activity = {}) {
  if (isMaterialActivity(activity) && !isScoredMaterialActivity(activity)) return "Sin puntaje";
  return `${Number(activity.maximo || 100)} pts`;
}

export function materialItemsForActivity(activity = {}) {
  const storedItems = Array.isArray(activity.materiales) ? activity.materiales : [];
  const items = storedItems
    .map((item) => ({
      cantidad: Math.max(1, Math.min(999, Math.round(Number(item?.cantidad) || 1))),
      material: String(item?.material || "").trim()
    }))
    .filter((item) => item.material);
  if (items.length) return items;
  const legacyTitle = String(activity.titulo || "").trim();
  if (!legacyTitle) return [];
  return legacyTitle
    .split(/\r?\n|,\s*/)
    .map((material) => material.replace(/^\s*[-*\u2022]\s*/, "").trim())
    .filter(Boolean)
    .map((material) => ({ cantidad: 1, material }));
}
