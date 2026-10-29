import { resumirAsistenciaInicial, trimestresInicial } from "../../services/modeloInicial.js";
import { controlFechaInicial, e, icon, paginaInicial, puedeRegistrarInicial, vacioInicial } from "./ComponentesInicial.js";
import { alumnosInicial } from "./SeguimientoInicial.js";
import { cursoTrabajoInicial } from "../../services/grupoInicial.js";

export const opcionesAsistenciaInicial = [
  { id: "presente", short: "P", label: "Presente", icon: "check-circle-2" },
  { id: "atraso", short: "A", label: "Atraso", icon: "clock-3" },
  { id: "licencia", short: "L", label: "Permiso", icon: "file-text" },
  { id: "falta", short: "F", label: "Falta", icon: "x-circle" }
];
const normalizar = (value) => value === "permiso" ? "licencia" : value;
function estadoAlumno(records, id) {
  const value = normalizar(records[id]?.estado);
  return opcionesAsistenciaInicial.find((item) => item.id === value) || { id: "sin-registro", label: "Sin registrar" };
}
function opciones(state, student, records, guided = false) {
  const current = estadoAlumno(records, student.id);
  return `<div class="initial-attendance-options ${guided ? "is-guided" : ""}" role="group" aria-label="Asistencia de ${e(student.nombre)}">${opcionesAsistenciaInicial.map((item) => `<button type="button" class="${item.id} ${current.id === item.id ? "is-selected" : ""}" data-initial-attendance="${item.id}" data-student="${e(student.id)}" aria-pressed="${current.id === item.id}" ${!puedeRegistrarInicial(state) || state.busy ? "disabled" : ""}>${guided ? `<span class="initial-attendance-letter">${item.short}</span>` : icon(item.icon)}<span>${item.label}</span></button>`).join("")}</div>`;
}
function observacion(state, student, records) {
  const text = state.attendanceNote?.(student.id).observacion ?? records[student.id]?.observacion ?? "";
  return `<label class="initial-attendance-note">${icon("message-square")}<input data-initial-attendance-note="${e(student.id)}" aria-label="Observacion de ${e(student.nombre)}" placeholder="Observacion (opcional)" maxlength="1500" value="${e(text)}" ${!puedeRegistrarInicial(state) || state.busy ? "disabled" : ""}></label>`;
}
export function guiaAsistenciaInicial(state) {
  const students = alumnosInicial(state), index = Math.min(state.attendanceGuidedIndex || 0, Math.max(0, students.length - 1)), student = students[index];
  const records = state.data.leer("attendance", state.courseId, state.termId, state.date) || {};
  if (!student) return vacioInicial("Sin estudiantes activos", "");
  const course = cursoTrabajoInicial(state), current = estadoAlumno(records, student.id);
  return `<div class="initial-attendance-guide"><p class="initial-dialog-context">${e(course?.nombre)} · ${e(trimestresInicial.find((item) => item.id === state.termId)?.label)}</p>${state.error ? `<p class="initial-status is-error" role="alert">${e(state.message)}</p>` : ""}<div class="initial-attendance-guide-student"><span>Alumno ${index + 1} de ${students.length}</span><h3>${e(student.nombre)}</h3><span class="initial-attendance-badge ${current.id}">${current.label}</span></div>${opciones(state, student, records, true)}${observacion(state, student, records)}<div class="initial-attendance-guide-navigation"><button type="button" class="initial-icon-button" data-initial-attendance-prev aria-label="Alumno anterior" title="Anterior" ${state.busy || !index ? "disabled" : ""}>${icon("chevron-left")}</button><progress max="${students.length}" value="${index + 1}" aria-label="Alumno ${index + 1} de ${students.length}"></progress><button type="button" class="initial-icon-button" data-initial-attendance-next aria-label="Alumno siguiente" title="Siguiente" ${state.busy || index === students.length - 1 ? "disabled" : ""}>${icon("chevron-right")}</button></div>${state.attendanceSavingId ? `<span class="initial-auto-status" role="status">${icon("refresh-cw")}Guardando...</span>` : ""}</div>`;
}
export function AsistenciaInicial(state) {
  const loaded = state.data.leer("students", state.courseId), records = state.data.leer("attendance", state.courseId, state.termId, state.date);
  const ready = loaded && records, students = alumnosInicial(state);
  const totals = ready ? resumirAsistenciaInicial(students, records) : null;
  const modes = `<div class="initial-attendance-modes" role="group" aria-label="Modo de asistencia"><button type="button" data-initial-attendance-mode="lista" class="${state.attendanceMode !== "guia" ? "is-active" : ""}" aria-pressed="${state.attendanceMode !== "guia"}" ${state.busy ? "disabled" : ""}>${icon("list")}Lista</button><button type="button" data-initial-attendance-mode="guia" class="${state.attendanceMode === "guia" ? "is-active" : ""}" aria-pressed="${state.attendanceMode === "guia"}" ${!ready || !students.length || state.busy ? "disabled" : ""}>${icon("user-check")}Guia</button></div>`;
  const content = !ready ? vacioInicial(state.loadError ? "Asistencia no disponible" : "Cargando asistencia...", "", "clipboard-check") : !students.length ? vacioInicial("Sin estudiantes activos", "") : `
    <div class="initial-attendance-totals">${opcionesAsistenciaInicial.map((item) => `<span class="initial-attendance-badge ${item.id}">${item.label}: ${totals[item.id]}</span>`).join("")}<span class="initial-attendance-badge sin-registro">Sin registrar: ${totals.sinRegistro}</span></div>
    <div class="initial-attendance-list">${students.map((student, index) => {
      const status = estadoAlumno(records, student.id), open = state.attendanceStudentId === student.id;
      return `<article class="initial-attendance-card"><button type="button" class="initial-attendance-open" data-initial-attendance-open="${e(student.id)}" aria-expanded="${open}" ${state.busy ? "disabled" : ""}><span class="initial-attendance-number">${index + 1}</span><span class="initial-attendance-name">${e(student.nombre)}</span><span class="initial-attendance-badge ${status.id}">${status.label}</span>${icon(open ? "chevron-down" : "chevron-right")}</button>${open ? `<div class="initial-attendance-editor">${opciones(state, student, records)}${observacion(state, student, records)}${state.attendanceSavingId === student.id ? `<span class="initial-auto-status" role="status">${icon("refresh-cw")}Guardando...</span>` : ""}</div>` : ""}</article>`;
    }).join("")}</div>`;
  return paginaInicial(state, "Asistencia", content, `${controlFechaInicial(state)}${modes}`);
}
