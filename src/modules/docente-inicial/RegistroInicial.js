import { findSubject } from "../../data/catalog.js";
import { dimensionesActividad, opcionesActividad, etiquetasOpcionesActividad, actividadesRegistrablesInicial, registrosDeActividadInicial, valoracionConCriterioActual } from "../../services/modeloActividadesInicial.js";
import { botonInicial, e, icon, paginaInicial, puedeRegistrarInicial, vacioInicial } from "./ComponentesInicial.js";
import { alumnosInicial } from "./SeguimientoInicial.js";
export function actividadSeleccionada(state) {
  return actividadesRegistrablesInicial(state.data.leer("activities", state.courseId, state.termId) || []).find((item) => item.id === state.activityId);
}
function tarjetaActividad(item, completed, total, busy, selected = false) {
  const subject = findSubject(item.materiaId);
  const action = selected ? `data-activity-grid data-activity-key="${e(item.id)}" title="Ver mosaico de actividades" aria-label="Cambiar actividad: ${e(item.titulo)}"` : `data-activity-open="${e(item.id)}"`;
  return `<button type="button" class="initial-priority-item ${selected ? "initial-selected-activity-toggle" : ""}" style="--initial-subject-color:${subject.color}" ${action} ${busy ? "disabled" : ""}><span class="initial-priority-mark ${item.prioritaria ? "is-priority" : ""}">${item.prioritaria ? icon("star") : icon("notebook-pen")}</span><span><strong>${e(item.titulo)}</strong><span>${e(subject.nombre)}</span><span>${completed}/${total} estudiantes registrados</span></span>${icon("chevron-right")}</button>`;
}
export function RegistroInicial(state) {
  const rows = state.data.leer("activities", state.courseId, state.termId), students = state.data.leer("students", state.courseId), records = state.data.leer("records", state.courseId, state.termId);
  if (!rows || !students || !records) return paginaInicial(state, "Registro", vacioInicial(state.loadError ? "Registro no disponible" : "Cargando actividades...", "", "notebook-pen"));
  const ready = actividadesRegistrablesInicial(rows), shown = ready.slice(0, state.activityLimit || 5), activity = actividadSeleccionada(state);
  const queueHeading = `<div class="initial-section-title"><h2>Actividades</h2><span>${ready.length} listas para registrar</span></div>`;
  if (!activity) {
    const queue = `<section class="initial-registration-workspace initial-registration-grid">${queueHeading}${ready.length ? `<div class="initial-priority-list">${shown.map((item) => {
      const completed = students.filter((student) => registrosDeActividadInicial(records, item.id, student.id).length === 3).length;
      return tarjetaActividad(item, completed, students.length, state.busy);
    }).join("")}</div>${ready.length > shown.length ? botonInicial("more-activities", "Cargar mas", "chevron-down", false, state.busy) : ""}` : vacioInicial("Sin actividades con criterios aprobados", "", "notebook-pen")}<a class="initial-activity-link" href="#/docente/actividades">Actividades ${icon("arrow-right")}</a></section>`;
    return paginaInicial(state, "Registro", queue);
  }
  const writable = puedeRegistrarInicial(state) && !state.busy;
  const ordered = alumnosInicial(state), selected = state.registrationStudentSelected ? ordered.find((item) => item.id === state.studentId) : null;
  const completed = ordered.filter((student) => registrosDeActividadInicial(records, activity.id, student.id).length === 3).length;
  const heading = `<div class="initial-selected-activity">${tarjetaActividad(activity, completed, ordered.length, state.busy, true)}</div>`;
  const studentTile = (student) => {
    const own = registrosDeActividadInicial(records, activity.id, student.id), active = student.id === selected?.id;
    const progress = dimensionesActividad.map((id) => ({ id, saved: own.some((item) => item.dimension === id) }));
    return `<button type="button" data-activity-student="${e(student.id)}" class="initial-registration-student ${active ? "is-active" : ""} ${own.length === 3 ? "is-complete" : ""}" aria-pressed="${active}" ${state.busy ? "disabled" : ""}><span class="initial-student-pointer" aria-hidden="true">${active ? icon("triangle") : ""}</span><span class="initial-student-name">${e(student.nombre)}</span><span class="initial-student-progress" role="img" aria-label="${progress.map(({ id, saved }) => `${id.toUpperCase()}: ${saved ? "registrado" : "pendiente"}`).join("; ")}">${progress.map(({ id, saved }) => `<span data-progress-dimension="${id}" class="${saved ? "is-saved" : ""}" aria-hidden="true"></span>`).join("")}</span></button>`;
  };
  const studentGrid = `<div class="initial-registration-students" role="group" aria-label="Estudiantes de la actividad">${ordered.filter((student) => student.id !== selected?.id).map(studentTile).join("")}</div>`;
  let detail = !ordered.length ? vacioInicial("Sin estudiantes activos", "") : !selected ? vacioInicial("Selecciona un estudiante", "", "user-round") : "";
  if (selected) {
    const own = registrosDeActividadInicial(records, activity.id, selected.id), draft = state.advanceDraft(), dimension = state.dimension, row = activity.criterios[dimension], saved = own.find((item) => item.dimension === dimension);
    const previousCriteria = saved && !valoracionConCriterioActual(saved, activity), entry = draft[dimension] || (!previousCriteria ? saved : null);
    const previousNotice = previousCriteria ? `<details class="initial-criteria-previous"><summary>Registrado con criterios anteriores</summary><p>${e(saved.criterio)}</p><p>${e(saved.opinion)}</p></details>` : "";
    const pending = Object.keys(draft).length > 0;
    detail = `<section class="initial-activity-assessment initial-student-bubble" data-registration-student="${e(selected.id)}" aria-label="Registro de ${e(selected.nombre)}"><span class="initial-student-bubble-frame" aria-hidden="true"></span><div class="initial-assessment-content"><div class="initial-selected-student">${studentTile(selected)}</div><div class="initial-registration-controls"><nav class="initial-dimension-tabs initial-registration-steps" aria-label="Dimension">${dimensionesActividad.map((id, index) => `<button type="button" data-initial-dimension="${id}" class="${dimension === id ? "is-active" : ""}" aria-pressed="${dimension === id}" ${state.busy ? "disabled" : ""}><span>${index + 1}</span>${id.toUpperCase()}${own.some((item) => item.dimension === id) ? icon("check") : ""}</button>`).join("")}</nav><span class="initial-auto-status" role="status">${state.autoSaving ? `${icon("refresh-cw")}Guardando...` : pending ? `${icon("cloud-off")}Sin guardar` : previousCriteria ? "Registro anterior" : own.length ? `${icon("check")}Guardado` : "Sin registro"}</span></div><h3>${e(row.criterio)}</h3>${previousNotice}<div class="initial-activity-options" role="group" aria-label="${e(row.criterio)}">${opcionesActividad.map((option) => `<button type="button" class="${option} ${entry?.valoracion === option ? "is-selected" : ""}" data-activity-rate="${option}" aria-pressed="${entry?.valoracion === option}" ${!writable ? "disabled" : ""}><span>${etiquetasOpcionesActividad[option]}</span><span>${e(row.opciones[option])}</span>${entry?.valoracion === option ? icon("check") : ""}</button>`).join("")}</div>${pending && !state.busy ? `<div class="initial-status is-error" role="alert">El avance no se guardo. ${botonInicial("retry-advance", "Reintentar", "refresh-cw", false, !writable)}</div>` : ""}</div></section>`;
  }
  return paginaInicial(state, "Registro", `<section class="initial-registration-workspace">${queueHeading}${heading}<div class="initial-registration-detail"><div class="initial-student-session">${studentGrid}${detail}</div>${completed === ordered.length && ordered.length ? `<div class="initial-registration-complete" role="status">${icon("check-check")}Todos los estudiantes registrados</div>` : ""}<div class="initial-save-row">${botonInicial("finish-activity", "Finalizar actividad", "check-check", false, !writable)}</div></div></section>`);
}
