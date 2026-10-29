import { DAYS, findSubject } from "../../data/catalog.js";
import { controlTrimestreInicial, e, icon, paginaInicial, vacioInicial } from "./ComponentesInicial.js";
import { cursoTrabajoInicial } from "../../services/grupoInicial.js";

function clasesDelDia(schedule, date) {
  const dayIndex = new Date(`${date}T12:00:00`).getDay();
  const day = dayIndex >= 1 && dayIndex <= 5 ? DAYS[dayIndex - 1] : null;
  return (schedule?.periodos || []).filter((period) => !period.recreo && day && schedule.clases?.[period.id]?.[day.id]).map((period) => ({ ...period, materiaId: schedule.clases[period.id][day.id] }));
}

function listaClases(schedule, date, course) {
  if (!schedule) return vacioInicial("Cargando horario...", "", "calendar-days");
  const classes = clasesDelDia(schedule, date);
  if (!classes.length) return vacioInicial("Sin clases programadas", "", "calendar-days");
  return `<div class="initial-today">${classes.map((period) => {
    const subject = findSubject(period.materiaId);
    return `<article class="initial-class" style="--initial-subject-color:${subject?.color || "#f1f5f9"}"><span>Per. ${e(period.label)} · ${e(period.hora)}</span><strong>${e(subject?.nombre || period.materiaId)}</strong><span>${e(course.nombre)}</span></article>`;
  }).join("")}</div>`;
}

export function PanelInicial(state) {
  const course = cursoTrabajoInicial(state);
  const termControl = controlTrimestreInicial(state);
  if (!course || state.context.errorModalidad) return paginaInicial(state, "Panel docente", vacioInicial("Sin cursos asignados", "Administracion debe asignar Inicial, Preinicial o ambos."), "", termControl);
  const students = state.data.leer("students", course.id);
  const schedule = state.data.leer("schedule", course.id);
  const records = state.data.leer("records", course.id, state.termId);
  const next = new Date(`${state.date}T12:00:00`);
  const todayIndex = next.getDay();
  do { next.setDate(next.getDate() + 1); } while ([0, 6].includes(next.getDay()));
  const nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  const nextLabel = todayIndex >= 1 && todayIndex <= 4 ? "Manana" : "Proximo dia de clases";
  const metrics = [
    [course.multigrado ? "Grupo multigrado" : "Cursos asignados", course.multigrado ? 1 : state.context.courses.length, "graduation-cap", "blue"],
    [course.multigrado ? "Estudiantes del grupo" : "Estudiantes del curso", students?.length ?? "—", "users", "green"],
    ["Registros del trimestre", records ? records.filter((item) => ["observacion", "actividad", "diario"].includes(item.tipo)).length : "—", "notebook-pen", "amber"],
    ["Notas de bitacora", records ? records.filter((item) => ["bitacora", "semanal"].includes(item.tipo)).length : "—", "book-open-text", "violet"]
  ];
  return paginaInicial(state, "Panel docente", `
    <div class="initial-metrics initial-panel-metrics">${metrics.map(([label, value, symbol, color]) => `<article><span class="initial-metric-icon ${color}">${icon(symbol)}</span><div><strong>${e(value)}</strong><p>${e(label)}</p></div></article>`).join("")}</div>
    <div class="initial-panel-grid">
      <section class="initial-section"><div class="initial-section-title"><h2>${icon("calendar-days")}Hoy</h2><a href="#/docente/horario">Ver horario ${icon("arrow-right")}</a></div>${listaClases(schedule, state.date, course)}</section>
      <section class="initial-section"><div class="initial-section-title"><h2>${icon("calendar-range")}${nextLabel}</h2></div>${listaClases(schedule, nextDate, course)}</section>
      <section class="initial-section initial-panel-courses"><div class="initial-section-title"><h2>${icon("school")}${course.multigrado ? "Grupo multigrado" : "Mis cursos"}</h2><span>${course.multigrado ? 1 : state.context.courses.length}</span></div><div class="initial-course-list">${course.multigrado ? `<a class="initial-group-link" href="#/docente/registro"><span class="initial-course-symbol inicial">${icon("school")}</span><span><strong>Inicial y Preinicial</strong><span>${students?.length ?? "—"} estudiantes</span></span>${icon("chevron-right")}</a>` : state.context.courses.map((item) => `<button type="button" data-initial-course="${e(item.id)}" ${state.busy ? "disabled" : ""}><span class="initial-course-symbol ${item.id}">${icon("school")}</span><span><strong>${e(item.nombre)}</strong><span>${state.data.leer("students", item.id)?.length ?? "—"} estudiantes</span></span>${icon("chevron-right")}</button>`).join("")}</div></section>
    </div>
    <nav class="initial-shortcuts" aria-label="Accesos del docente"><a href="#/docente/asistencia">${icon("clipboard-check")}Tomar asistencia${icon("arrow-right")}</a><a href="#/docente/actividades">${icon("columns-3")}Actividades${icon("arrow-right")}</a><a href="#/docente/registro">${icon("notebook-pen")}Registro${icon("arrow-right")}</a><a href="#/docente/bitacora">${icon("book-open-text")}Bitacora${icon("arrow-right")}</a><a href="#/docente/informe">${icon("file-text")}Informe trimestral${icon("arrow-right")}</a></nav>
  `, "", termControl);
}
