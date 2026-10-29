import { findSubject } from "../../data/catalog.js";
import { materiasInicial, observacionesDiarias, valoracionesInicial, registrosAlumnoInicial } from "../../services/modeloInicial.js";
import { e, icon } from "./ComponentesInicial.js";

export function alumnosInicial(state) {
  return [...(state.data.leer("students", state.courseId) || [])].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
export const alumnoInicial = (state) => alumnosInicial(state).find((item) => item.id === state.studentId) || alumnosInicial(state)[0];
export function selectorAlumnoInicial(state) {
  const student = alumnoInicial(state);
  return `<div class="initial-report-student-selector"><span class="initial-report-student-label">Seleccionar alumno</span><button type="button" data-initial-action="select-student" aria-haspopup="dialog" aria-label="Seleccionar alumno: ${e(student?.nombre || "Sin seleccionar")}" ${state.busy ? "disabled" : ""}>${icon("user-round")}<span>${e(student?.nombre || "Seleccionar alumno")}</span>${icon("chevron-down")}</button></div>`;
}
export function cuadriculaAlumnosInicial(state) {
  const students = alumnosInicial(state), selected = alumnoInicial(state);
  return `<p class="initial-report-picker-count">${students.length} estudiantes</p><div class="initial-report-student-grid" role="group" aria-label="Alumnos del curso">${students.map((student, index) => `<button type="button" data-initial-picker-student="${e(student.id)}" aria-pressed="${student.id === selected?.id}"><span class="initial-report-student-number">${index + 1}</span><span class="initial-report-student-name">${e(student.nombre)}</span>${student.id === selected?.id ? icon("check-circle-2", "initial-report-student-check") : ""}</button>`).join("")}</div>`;
}
export function selectorMateriaInicial(state, optional = false) {
  const subjects = materiasInicial(state.data.leer("schedule", state.courseId));
  return `<div class="initial-subject-picker" role="group" aria-label="Materia">${optional ? `<button type="button" data-initial-subject="general" class="${!state.subjectId ? "is-active" : ""}" ${state.busy ? "disabled" : ""}>General</button>` : ""}${subjects.map((subject) => `<button type="button" data-initial-subject="${subject.id}" class="${state.subjectId === subject.id ? "is-active" : ""}" style="--initial-subject-color:${subject.color}" aria-pressed="${state.subjectId === subject.id}" ${state.busy ? "disabled" : ""}><i></i>${e(subject.nombre)}</button>`).join("")}</div>`;
}
export function historialInicial(records, studentId, limit = Infinity, { editarBitacora = false, docenteUid = "" } = {}) {
  const own = registrosAlumnoInicial(records, studentId).slice(0, limit);
  return own.length ? `<ol class="initial-timeline">${own.map((item) => {
    const subject = item.materiaId ? findSubject(item.materiaId) : null;
    const assessment = valoracionesInicial.find((value) => value.id === item.valoracion);
    const legacy = observacionesDiarias.find((value) => value.id === item.estado);
    const date = item.createdAt?.toDate?.() || (item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000) : item.fecha ? new Date(`${item.fecha}T12:00:00`) : null);
    const kind = ["observacion", "actividad"].includes(item.tipo) ? item.dimension.toUpperCase() : item.tipo === "bitacora" ? "Bitacora" : item.tipo === "diario" ? "Registro anterior" : "Bitacora anterior";
    return `<li><div class="initial-timeline-meta"><span>${e(kind)}</span>${subject ? `<span class="initial-subject-tag" style="--surface-color:${subject.color}">${e(subject.nombre)}</span>` : ""}${date && Number.isFinite(date.getTime()) ? `<time>${e(date.toLocaleDateString("es-BO", { day: "numeric", month: "short" }))}</time>` : ""}${editarBitacora && item.tipo === "bitacora" && item.docenteUid === docenteUid ? `<button type="button" class="initial-icon-button initial-timeline-edit" data-initial-edit-journal="${e(item.id)}" aria-label="Editar observacion de bitacora" title="Editar observacion">${icon("pencil")}</button>` : ""}</div>${item.actividadTitulo ? `<h3>${e(item.actividadTitulo)}</h3>` : ""}${item.criterio ? `<h3>${e(item.criterio)}</h3>` : ""}${item.opinion ? `<p class="initial-rating-label ${e(item.valoracion)}">${e(item.opinion)}</p>` : assessment || legacy ? `<span class="initial-rating-label ${e(item.valoracion || "")}">${e(assessment?.label || legacy?.label)}</span>` : ""}${item.descripcion ? `<p>${e(item.descripcion)}</p>` : ""}</li>`;
  }).join("")}</ol>` : `<p class="initial-muted">Sin registros de este estudiante en el trimestre.</p>`;
}
