import { appShell } from "../../ui/shell.js";
import { icon } from "../../ui/dom.js";
import { configuracionActual } from "../../services/rutasFirestore.js";
import { estadoRegistroEscolar } from "../../services/registroEscolar.js";
import { puedeRegistrarTrimestre } from "../../services/relevoDocente.js";
import { escaparInicial as e, navegacionInicial, trimestresInicial } from "../../services/modeloInicial.js";

export { e, icon };
export const puedeRegistrarInicial = (state) => estadoRegistroEscolar(configuracionActual()).habilitada && (!state || puedeRegistrarTrimestre(state.context, state.termId));
export function botonInicial(action, label, symbol = "refresh-cw", primary = false, disabled = false) {
  return `<button type="button" data-initial-action="${action}" class="initial-button ${primary ? "is-primary" : ""}" ${disabled ? "disabled" : ""}>${icon(symbol)}<span>${e(label)}</span></button>`;
}
export function vacioInicial(title, text, symbol = "inbox") {
  return `<div class="initial-empty">${icon(symbol)}<h2>${e(title)}</h2>${text ? `<p>${e(text)}</p>` : ""}</div>`;
}
export function fechaInicial(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es-BO", { day: "numeric", month: "short" });
}
export function controlFechaInicial(state, weekly = false) {
  return `<label class="initial-field">${weekly ? "Semana del" : "Fecha"}<input type="date" data-initial-date value="${e(weekly ? state.week : state.date)}" min="${e(state.context.gestionId)}-01-01" max="${e(state.context.gestionId)}-12-31" ${state.busy ? "disabled" : ""}></label>`;
}
export function controlTrimestreInicial(state) {
  const unavailable = Boolean(state.context.errorModalidad) || !state.context.courses.length;
  return `<section class="initial-term-control" aria-label="Trimestre de trabajo"><span>Seleccionar trimestre</span><div role="group" aria-label="Trimestre activo">${trimestresInicial.map((item) => `<button type="button" data-initial-select-term="${item.id}" class="${state.termId === item.id ? "is-active" : ""}" aria-pressed="${state.termId === item.id}" ${state.busy || unavailable || !puedeRegistrarTrimestre(state.context, item.id) ? "disabled" : ""}><span class="initial-term-full">${e(item.label)}</span><span class="initial-term-short">${item.id === "t1" ? "1ro" : item.id === "t2" ? "2do" : "3ro"}</span></button>`).join("")}</div></section>`;
}
export function paginaInicial(state, title, content, actions = "", beforeHeading = "") {
  const context = state.context;
  const currentCourse = context.courses.find((course) => course.id === state.courseId);
  const term = trimestresInicial.find((item) => item.id === state.termId) || trimestresInicial[0];
  const blocked = Boolean(context.errorModalidad);
  const unavailable = blocked || !context.courses.length;
  const page = `<div class="initial-workspace ${state.route === "/docente" ? "is-dashboard" : ""}" data-initial-root data-teacher-page>
    ${beforeHeading}
    <section class="initial-heading teacher-module-surface teacher-module-header">
      <div class="teacher-module-heading"><h1 class="teacher-module-title">${e(title)}</h1>
      <div class="teacher-module-context"><span class="teacher-module-context-item">${icon("graduation-cap")}<span>${e(currentCourse?.nombre || "Sin curso asignado")}</span></span><span class="teacher-module-context-item initial-active-term" data-initial-active-term title="Trimestre activo">${icon("calendar-range")}<span>${e(term.label)}</span></span></div></div>
      ${actions ? `<div class="initial-header-actions">${actions}</div>` : ""}
    </section>
    ${!blocked && context.courses.length > 1 ? `<nav class="initial-course-tabs" aria-label="Cursos asignados">${context.courses.map((course) => `<button type="button" data-initial-course="${e(course.id)}" class="${state.courseId === course.id ? "is-active" : ""}" aria-pressed="${state.courseId === course.id}" ${state.busy ? "disabled" : ""}>${icon("school")} ${e(course.nombre)}</button>`).join("")}</nav>` : ""}
    <p class="initial-status ${state.error ? "is-error" : ""}" role="status" data-initial-status ${state.message ? "" : "hidden"}>${e(state.message)}</p>
    ${state.loadError ? `<div class="initial-status is-error" role="alert">${e(state.loadError)} ${botonInicial("retry", "Reintentar", "refresh-cw", false, state.loading)}</div>` : ""}
    ${blocked ? `<div class="initial-warning" role="alert">${e(context.errorModalidad)}</div>` : content}
    <div data-initial-dialog-host></div>
  </div>`;
  return state.soloContenido ? page : appShell("docente", state.route, page, { navigation: unavailable ? [navegacionInicial[0]] : navegacionInicial, areaLabel: "Docente de Inicial y Preinicial", fitDashboard: false });
}
