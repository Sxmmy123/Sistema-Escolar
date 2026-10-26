import { evidenciasInformeInicial, firmaRegistrosInicial, registrosAlumnoInicial } from "../../services/modeloInicial.js";
import { botonInicial, e, paginaInicial, puedeRegistrarInicial, vacioInicial } from "./ComponentesInicial.js";
import { alumnoInicial, selectorAlumnoInicial } from "./SeguimientoInicial.js";

export function conteoFuentesInformeInicial(sources) {
  const records = sources.filter((item) => item.tipo !== "informe"), evidence = evidenciasInformeInicial(records);
  const groups = [{ id: "ser", label: "SER", records: [] }, { id: "saber", label: "SABER", records: [] }, { id: "hacer", label: "HACER", records: [] }, { id: "bitacora", label: "Bitacora", records: [] }];
  const legacy = { id: "anteriores", label: "Anteriores", records: [] };
  for (const item of evidence) {
    const category = ["bitacora", "semanal"].includes(item.tipo) ? "bitacora" : ["observacion", "actividad"].includes(item.tipo) ? item.dimension : "";
    (groups.find((group) => group.id === category) || legacy).records.push(item);
  }
  if (legacy.records.length) groups.push(legacy);
  return { groups, total: evidence.length, excluded: records.length - evidence.length };
}

export function barrasFuentesInformeInicial(sources) {
  const { groups, total, excluded } = conteoFuentesInformeInicial(sources);
  return `<section class="initial-report-evidence" aria-labelledby="initial-report-evidence-title"><header><h2 id="initial-report-evidence-title">Registros del informe</h2><span>${total} ${total === 1 ? "registro" : "registros"}</span></header><div class="initial-report-evidence-grid">${groups.map((group) => {
    const count = group.records.length, label = `${group.label}: ${count} ${count === 1 ? "registro" : "registros"}`;
    return `<div class="initial-report-evidence-category is-${group.id}" data-initial-evidence-category="${group.id}"><div class="initial-report-evidence-label"><h3>${group.label}</h3><span>${count}</span></div><div class="initial-report-evidence-track ${count ? "" : "is-empty"}" role="img" aria-label="${label}" title="${label}">${group.records.map(() => `<span class="initial-report-evidence-segment" aria-hidden="true"></span>`).join("")}</div></div>`;
  }).join("")}</div>${excluded ? `<span class="initial-report-evidence-excluded" title="Sin observar y sin comentario">${excluded} sin evidencia</span>` : ""}</section>`;
}

export function estadoInformeInicial(state) {
  const student = alumnoInicial(state);
  const records = state.data.leer("records", state.courseId, state.termId) || [];
  const saved = records.find((item) => item.tipo === "informe" && item.alumnoId === student?.id);
  const draft = state.reportDraft();
  const signature = firmaRegistrosInicial(records, student?.id);
  const changed = draft.descripcion !== (saved?.descripcion || "") || draft.origen !== (saved?.origen || "docente") || draft.fuentesFirma !== (saved?.fuentesFirma || signature);
  const outdated = Boolean((draft.fuentesFirma || saved?.fuentesFirma) && (draft.fuentesFirma || saved?.fuentesFirma) !== signature);
  const status = outdated ? "Hay registros nuevos por revisar" : changed ? "Cambios sin guardar" : saved?.aprobado ? "Aprobado por la docente" : "Borrador";
  return { student, saved, draft, signature, changed, outdated, status, printable: Boolean(saved?.aprobado && !changed && !outdated), sources: registrosAlumnoInicial(records, student?.id) };
}
export function InformeInicial(state) {
  const students = state.data.leer("students", state.courseId);
  const records = state.data.leer("records", state.courseId, state.termId);
  if (!students || !records) return paginaInicial(state, "Informe trimestral", vacioInicial("Cargando informe...", "", "file-text"));
  if (!alumnoInicial(state)) return paginaInicial(state, "Informe trimestral", vacioInicial("Sin estudiantes activos", ""));
  const info = estadoInformeInicial(state);
  const writable = puedeRegistrarInicial(state) && !state.busy;
  const status = info.status;
  const hasEvidence = evidenciasInformeInicial(info.sources).length > 0;
  return paginaInicial(state, "Informe trimestral", `${selectorAlumnoInicial(state)}<div class="initial-report-generation">${barrasFuentesInformeInicial(info.sources)}<section class="initial-report-editor"><div class="initial-section-title"><h2>Valoracion del trimestre</h2><span class="initial-report-status ${info.printable ? "is-approved" : ""}" data-initial-report-status>${status}</span></div><label class="initial-field" for="initial-report-text">Informe del estudiante</label><textarea id="initial-report-text" data-initial-report-text maxlength="200" rows="5" ${!writable ? "disabled" : ""}>${e(info.draft.descripcion)}</textarea><div class="initial-form-footer"><span data-initial-report-count aria-live="polite">${info.draft.descripcion.length}/200 caracteres</span><span>${info.draft.origen === "ia" ? "Borrador de Gemini" : "Redaccion docente"}</span></div><div class="initial-report-actions">${botonInicial("generate-report", "Generar con Gemini", "sparkles", false, !writable || !state.iaAvailable || !hasEvidence)}${botonInicial("approve-report", "Aprobar y guardar", "check-check", true, !writable || !info.draft.descripcion.trim())}</div>${!state.iaAvailable ? `<p class="initial-service-status">Gemini pendiente de activar en el servidor.</p>` : ""}</section></div>`, botonInicial("print-course-reports", "Imprimir informes", "printer", false, state.busy || state.loading));
}
