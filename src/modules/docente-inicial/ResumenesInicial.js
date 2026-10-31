import { findSubject } from "../../data/catalog.js";
import { dimensionesInicial, firmaRegistrosInicial, observacionesDiarias, registrosAlumnoInicial, valoracionesInicial } from "../../services/modeloInicial.js";
import { botonInicial, e, icon, paginaInicial, puedeRegistrarInicial, vacioInicial } from "./ComponentesInicial.js";
import { alumnosInicial } from "./SeguimientoInicial.js";

export const categoriasResumenInicial = [...dimensionesInicial.map((item) => ({ id: item.id, label: item.label })), { id: "bitacora", label: "Bitacora" }];
const categoriaRegistro = (item) => ["bitacora", "semanal"].includes(item.tipo) ? "bitacora" : ["observacion", "actividad"].includes(item.tipo) ? item.dimension : "otros";

export function registrosCategoriaInicial(records, studentId, category) {
  return registrosAlumnoInicial(records, studentId).filter((item) => categoriaRegistro(item) === category);
}

export function fichaResumenInicial(records, studentId) {
  const own = registrosAlumnoInicial(records, studentId);
  const counts = Object.fromEntries([...categoriasResumenInicial.map((item) => item.id), "otros"].map((id) => [id, 0]));
  own.forEach((item) => { const category = categoriaRegistro(item); if (Object.hasOwn(counts, category)) counts[category]++; });
  const saved = records.find((item) => item.tipo === "informe" && item.alumnoId === studentId);
  let report = { id: "missing", label: "Sin informe", icon: "file-minus" };
  if (saved?.descripcion?.trim()) {
    const current = saved.fuentesFirma === firmaRegistrosInicial(own, studentId) && saved.descripcion.length <= 200;
    report = saved.aprobado ? current ? { id: "approved", label: "Aprobado", icon: "check-check" } : { id: "outdated", label: "Requiere revision", icon: "file-clock" } : { id: "draft", label: "Borrador", icon: "file-pen-line" };
  }
  return { records: own, counts, report };
}

export function agruparRegistrosResumenInicial(records) {
  const groups = new Map();
  for (const item of records) {
    const key = JSON.stringify([item.materiaId || "", item.actividadId || item.actividadTitulo || ""]);
    if (!groups.has(key)) groups.set(key, { subject: findSubject(item.materiaId), title: item.actividadTitulo || "", records: [] });
    groups.get(key).records.push(item);
  }
  return [...groups.values()];
}

export function materiasSeguimientoInicial(records, studentId, category) {
  const subjects = new Map();
  for (const item of registrosCategoriaInicial(records, studentId, category)) {
    const subject = findSubject(item.materiaId), id = subject?.id || "general";
    if (!subjects.has(id)) subjects.set(id, { id, nombre: subject?.nombre || "General", color: subject?.color || "#9aa8b5", count: 0 });
    subjects.get(id).count++;
  }
  return [...subjects.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function fechaRegistro(item) {
  return item.createdAt?.toDate?.() || (item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000) : item.fecha ? new Date(`${item.fecha}T12:00:00`) : null);
}

function entradaResumen(item, state, showActivity = false) {
  const date = fechaRegistro(item);
  const assessment = valoracionesInicial.find((value) => value.id === item.valoracion);
  const legacy = observacionesDiarias.find((value) => value.id === item.estado);
  const rating = item.opinion || assessment?.label || legacy?.label || (item.valoracion === "no_observado" ? "Sin observar" : "");
  const tone = ["logrado", "en_proceso", "requiere_apoyo", "no_observado"].includes(item.valoracion) ? item.valoracion : "";
  const editable = item.tipo === "bitacora" && item.docenteUid === state.context.uid && puedeRegistrarInicial(state) && !state.busy;
  const description = item.descripcion || "";
  const body = description.length > 220 && ["bitacora", "semanal"].includes(item.tipo) ? `<details class="initial-summary-note"><summary><span>${e(description.slice(0, 160).replace(/\s+\S*$/, ""))}...</span>${icon("chevron-down")}<span class="initial-summary-note-more">Leer comentario</span><span class="initial-summary-note-less">Cerrar comentario</span></summary><p>${e(description)}</p></details>` : description ? `<p>${e(description)}</p>` : "";
  return `<li class="initial-summary-entry" data-initial-map-record="${e(item.id)}"><div class="initial-summary-entry-meta">${date && Number.isFinite(date.getTime()) ? `<time>${e(date.toLocaleDateString("es-BO", { day: "numeric", month: "short" }))}</time>` : ""}${editable ? `<button type="button" class="initial-icon-button initial-timeline-edit" data-initial-edit-journal="${e(item.id)}" aria-label="Editar observacion de bitacora" title="Editar observacion">${icon("pencil")}</button>` : ""}</div>${showActivity && item.actividadTitulo ? `<span class="initial-map-activity">${e(item.actividadTitulo)}</span>` : ""}${item.criterio ? `<h4>${e(item.criterio)}</h4>` : ""}${rating ? `<span class="initial-rating-label ${tone}">${e(rating)}</span>` : ""}${body}</li>`;
}

export function mapaSeguimientoInicial(state, ficha, category) {
  const subjects = materiasSeguimientoInicial(ficha.records, state.summaryStudentId, category);
  const selected = subjects.find((item) => item.id === state.summarySubjectId);
  const filtered = ficha.records.filter((item) => categoriaRegistro(item) === category && (!selected || (findSubject(item.materiaId)?.id || "general") === selected.id));
  const label = categoriasResumenInicial.find((item) => item.id === category)?.label || "SER";
  const filters = category !== "bitacora" && subjects.length ? `<div class="initial-summary-subjects" role="group" aria-label="Materias con registros"><button type="button" data-initial-summary-subject="all" aria-pressed="${!selected}">${icon("list")}Todas<span>${ficha.counts[category]}</span></button>${subjects.map((item) => `<button type="button" data-initial-summary-subject="${item.id}" aria-pressed="${selected?.id === item.id}" style="--summary-subject:${item.color}"><i></i>${e(item.nombre)}<span>${item.count}</span></button>`).join("")}</div>` : "";
  if (!filtered.length) return `${filters}<p class="initial-muted initial-summary-empty">Sin registros en esta categoria.</p>`;
  let branches;
  if (category === "bitacora") {
    const months = new Map();
    for (const item of filtered) {
      const date = fechaRegistro(item), valid = date && Number.isFinite(date.getTime());
      const key = valid ? date.toLocaleDateString("es-BO", { month: "long", year: "numeric", timeZone: "America/La_Paz" }) : "Sin fecha registrada";
      const month = valid ? date.toLocaleDateString("es-BO", { month: "long", timeZone: "America/La_Paz" }) : key;
      if (!months.has(key)) months.set(key, { label: month[0].toUpperCase() + month.slice(1), color: "#a5a0c9", records: [] });
      months.get(key).records.push(item);
    }
    branches = [...months.values()];
  } else if (selected) {
    branches = agruparRegistrosResumenInicial(filtered).map((group) => ({ label: group.title || "Observaciones", color: selected.color, records: group.records }));
  } else {
    branches = subjects.map((subject) => ({ label: subject.nombre, color: subject.color, records: filtered.filter((item) => (findSubject(item.materiaId)?.id || "general") === subject.id) }));
  }
  const mapKey = JSON.stringify([state.courseId, state.termId, state.summaryStudentId, category, selected?.id || "all"]);
  return `<div class="initial-summary-map-toolbar">${filters}</div><div class="initial-map-viewport" data-initial-map-viewport data-initial-map-key="${e(mapKey)}" role="region" aria-label="Observaciones de ${label}${selected ? ` en ${e(selected.nombre)}` : ""}"><section class="initial-summary-map is-${category}" data-initial-summary-map aria-label="Mapa de observaciones de ${label}${selected ? ` en ${e(selected.nombre)}` : ""}"><svg class="initial-map-connectors" data-initial-map-connectors aria-hidden="true" focusable="false"><path></path></svg><div class="initial-map-root"><span>${icon(dimensionesInicial.find((item) => item.id === category)?.icon || "book-open-text")}${label}</span><h3>${e(selected?.nombre || (category === "bitacora" ? "Bitacora personal" : "Todas las materias"))}</h3><small>${filtered.length} ${filtered.length === 1 ? "registro" : "registros"}</small></div><div class="initial-map-branches">${branches.map((branch) => `<section class="initial-map-branch" style="--branch-color:${branch.color}"><header class="initial-map-branch-label"><i></i><h3>${e(branch.label)}</h3><span>${branch.records.length}</span></header><ol class="initial-map-leaves">${branch.records.map((item) => entradaResumen(item, state, !selected && category !== "bitacora")).join("")}</ol></section>`).join("")}</div></section></div>`;
}

function detalleResumen(state, ficha, category) {
  const legacy = ficha.records.filter((item) => categoriaRegistro(item) === "otros");
  return `<div class="initial-summary-categories" role="group" aria-label="Categorias del seguimiento">${categoriasResumenInicial.map((item) => `<button type="button" data-initial-summary-category="${item.id}" aria-pressed="${item.id === category}">${e(item.label)}<span>${ficha.counts[item.id]}</span></button>`).join("")}</div>${mapaSeguimientoInicial(state, ficha, category)}${legacy.length ? `<details class="initial-summary-legacy"><summary>Registros anteriores <span>${legacy.length}</span></summary><ol class="initial-map-leaves">${legacy.map((item) => entradaResumen(item, state)).join("")}</ol></details>` : ""}`;
}

const normalizarBusqueda = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();

export function listaResumenInicial(state) {
  const records = state.data.leer("records", state.courseId, state.termId) || [];
  const students = alumnosInicial(state), query = normalizarBusqueda(state.summarySearch);
  const selected = students.find((student) => student.id === state.summaryStudentId);
  const shown = students.map((student, index) => ({ student, index })).filter(({ student }) => selected ? student.id === selected.id : normalizarBusqueda(student.nombre).includes(query));
  return `${!selected ? `<p class="initial-summary-result-count" role="status">${query ? `${shown.length} de ${students.length}` : students.length} estudiantes</p>` : ""}${!shown.length ? vacioInicial(students.length ? "No se encontraron alumnos" : "Sin estudiantes activos", "", "users") : `<div class="initial-summary-list ${selected ? "is-focused" : ""}">${shown.map(({ student, index }) => {
    const ficha = fichaResumenInicial(records, student.id), active = state.summaryStudentId === student.id;
    const category = categoriasResumenInicial.some((item) => item.id === state.summaryCategory) ? state.summaryCategory : "ser";
    const detailId = `initial-summary-${e(student.id)}`;
    return `<article class="initial-summary-student ${active ? "is-open" : ""}"><button type="button" class="initial-summary-toggle" data-initial-summary-student="${e(student.id)}" aria-expanded="${active}" aria-controls="${detailId}" ${active ? 'title="Ver todos los alumnos"' : ""}><span class="initial-number">${index + 1}</span><span class="initial-summary-name">${e(student.nombre)}</span><span class="initial-summary-counts">${categoriasResumenInicial.map((item) => `<span class="is-${item.id}">${e(item.label)} <b>${ficha.counts[item.id]}</b></span>`).join("")}</span><span class="initial-summary-report is-${ficha.report.id}">${icon(ficha.report.icon)}<span>${ficha.report.label}</span></span>${icon(active ? "chevron-down" : "chevron-right")}</button></article>${active ? `<div class="initial-summary-detail" id="${detailId}">${detalleResumen(state, ficha, category)}</div>` : ""}`;
  }).join("")}</div>`}`;
}

export function ResumenesInicial(state) {
  const students = state.data.leer("students", state.courseId);
  const records = state.data.leer("records", state.courseId, state.termId);
  const ready = students && records;
  let content = vacioInicial(state.loading ? "Cargando seguimiento..." : "Seguimiento del trimestre", "", "chart-no-axes-combined");
  if (ready) {
    const fichas = students.map((student) => fichaResumenInicial(records, student.id));
    const totals = [["Observaciones", fichas.reduce((sum, item) => sum + item.counts.ser + item.counts.saber + item.counts.hacer + item.counts.otros, 0), "notebook-pen"], ["Bitacora", fichas.reduce((sum, item) => sum + item.counts.bitacora, 0), "book-open-text"], ["Informes aprobados", fichas.filter((item) => item.report.id === "approved").length, "file-check-2"]];
    const focused = students.some((student) => student.id === state.summaryStudentId);
    content = `${!focused ? `<div class="initial-summary-totals">${totals.map(([label, value, symbol]) => `<span>${icon(symbol)}<span>${label}</span><strong>${value}</strong></span>`).join("")}</div>` : ""}<section class="initial-summary-section"><div class="initial-summary-toolbar"><h2>${focused ? "Seguimiento por estudiante" : "Seleccionar alumno"}</h2>${!focused ? `<label class="initial-summary-search">${icon("search")}<input type="search" data-initial-summary-search aria-label="Buscar alumno" placeholder="Buscar alumno" value="${e(state.summarySearch || "")}" autocomplete="off"></label>` : ""}</div><div data-initial-summary-results>${listaResumenInicial(state)}</div></section>`;
  }
  return paginaInicial(state, "Seguimiento", content, botonInicial("load", state.loading ? "Cargando..." : ready ? "Actualizar seguimiento" : "Cargar seguimiento", "refresh-cw", false, state.loading || state.busy));
}
