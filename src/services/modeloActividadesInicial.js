import { SUBJECTS } from "../data/catalog.js";
import { dimensionesActividad, opcionesActividad, validarCriteriosActividad } from "../../functions/criterios-core.js";
export { dimensionesActividad, opcionesActividad, validarCriteriosActividad };
export const etiquetasOpcionesActividad = { logrado: "Lo logra", en_proceso: "En proceso", requiere_apoyo: "Requiere apoyo", no_observado: "Sin observar" };
export function validarActividadInicial(input) {
  const titulo = String(input.titulo || "").trim(), descripcion = String(input.descripcion || "").trim();
  if (!titulo || titulo.length > 150 || descripcion.length > 2000 || !SUBJECTS.some((item) => item.id === input.materiaId)) throw new Error("Revisa la materia, el titulo (hasta 150 caracteres) y la descripcion (hasta 2000).");
  return { titulo, descripcion, materiaId: input.materiaId };
}
export const ordenarActividadesInicial = (rows) => [...rows].sort((a, b) => String(a.orden) < String(b.orden) ? -1 : String(a.orden) > String(b.orden) ? 1 : String(a.id).localeCompare(String(b.id)));
export const prioridadesInicial = (rows) => ordenarActividadesInicial(rows.filter((item) => item.prioritaria && item.estado === "pendiente"));
export const actividadesRegistrablesInicial = (rows) => ordenarActividadesInicial(rows.filter((item) => item.estado === "pendiente" && dimensionesActividad.every((id) => item.criterios?.[id]?.opciones))).sort((a, b) => Number(b.prioritaria) - Number(a.prioritaria));
export function registrosDeActividadInicial(records, activityId, studentId) { return records.filter((item) => item.tipo === "actividad" && item.actividadId === activityId && item.alumnoId === studentId); }
export function valoracionConCriterioActual(record, activity) {
  const row = activity.criterios?.[record.dimension];
  return Boolean(row && record.criterio === row.criterio && record.opinion === row.opciones?.[record.valoracion]);
}
export function siguientePasoRegistroInicial(records, activityId, students, studentId, dimension) {
  const own = registrosDeActividadInicial(records, activityId, studentId);
  const missing = (id) => !own.some((item) => item.dimension === id);
  const after = dimensionesActividad[dimensionesActividad.indexOf(dimension) + 1];
  const nextDimension = after || dimensionesActividad.find(missing);
  if (nextDimension) return { studentId, dimension: nextDimension, completo: false };
  const index = students.findIndex((item) => item.id === studentId);
  const ordered = [...students.slice(index + 1), ...students.slice(0, index)];
  const next = ordered.find((student) => dimensionesActividad.some((id) => !registrosDeActividadInicial(records, activityId, student.id).some((item) => item.dimension === id)));
  return next ? { studentId: next.id, dimension: "ser", completo: false } : { studentId, dimension: "hacer", completo: true };
}
export const idAvanceInicial = (uid, activityId, studentId, dimension) => `${uid}_actividad_${activityId}_${studentId}_${dimension}`;
