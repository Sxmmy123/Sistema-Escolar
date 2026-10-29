import { SUBJECTS, findSubject } from "../../data/catalog.js";
import { dimensionesActividad, opcionesActividad, etiquetasOpcionesActividad, validarCriteriosActividad } from "../../services/modeloActividadesInicial.js";
import { validarBorradorCriterios } from "../../../functions/criterios-core.js";
import { e, icon, puedeRegistrarInicial } from "./ComponentesInicial.js";
import { cursoActividadInicial } from "../../services/grupoInicial.js";

export function abrirPreparacionActividad({ state, data, activity, dialog, run, assertWritable, generate, refreshIcons, drafts }) {
  const key = JSON.stringify([state.courseId, state.termId, activity?.id || "nueva"]);
  const existing = !!activity, hasCriteria = existing && Object.keys(activity.criterios || {}).length > 0;
  const locked = !puedeRegistrarInicial(state) || activity?.estado === "eliminada";
  let draft = drafts.get(key);
  if (!draft) {
    draft = { id: activity?.id || data.nuevoId(), materiaId: activity?.materiaId || SUBJECTS[0].id, titulo: activity?.titulo || "", descripcion: activity?.descripcion || "", prioritaria: activity?.prioritaria ?? true, criterios: hasCriteria ? structuredClone(activity.criterios) : null, dimension: "ser", step: hasCriteria ? "criterios" : "datos" };
    drafts.set(key, draft);
  }
  const scope = { cursoId: cursoActividadInicial(state, activity), trimestreId: state.termId };
  let busy = false, error = "";
  const modal = dialog(existing ? "Criterios de la actividad" : "Nueva actividad", '<div data-activity-wizard></div>');
  modal.host.querySelector(".initial-dialog").classList.add("initial-activity-wizard");
  const body = modal.host.querySelector("[data-activity-wizard]");
  function render() {
    if (modal.signal.aborted) return;
    const status = error ? `<p class="initial-status is-error" role="alert">${e(error)}</p>` : "";
    if (draft.step === "datos") body.innerHTML = `${status}<form data-wizard-details class="initial-activity-form"><label class="initial-field">Materia<select name="materiaId" data-wizard-info="materiaId" required ${existing || busy ? "disabled" : ""}>${SUBJECTS.map((item) => `<option value="${item.id}" ${draft.materiaId === item.id ? "selected" : ""}>${e(item.nombre)}</option>`).join("")}</select></label><label class="initial-field">Nombre de la actividad<input data-wizard-info="titulo" value="${e(draft.titulo)}" maxlength="150" required ${existing || busy ? "disabled" : ""}></label><label class="initial-field">Descripcion<textarea data-wizard-info="descripcion" maxlength="2000" rows="4" ${!existing ? "required" : ""} ${existing || busy ? "disabled" : ""}>${e(draft.descripcion)}</textarea></label>${existing ? "" : `<label class="initial-checkbox"><input type="checkbox" data-wizard-info="prioritaria" ${draft.prioritaria ? "checked" : ""} ${busy ? "disabled" : ""}>Prioritaria</label>`}<p class="initial-privacy-note">Gemini recibira solo la materia, el nombre y la descripcion de esta actividad; no los datos de alumnos.</p><div class="initial-dialog-actions"><button type="button" class="initial-button" data-wizard-cancel ${busy ? "disabled" : ""}>Cancelar</button><button type="submit" class="initial-button is-primary" ${busy || !state.iaAvailable ? "disabled" : ""}>${icon("sparkles")}${busy ? "Generando criterios..." : draft.criterios && Object.keys(draft.criterios).length ? "Continuar revision" : "Generar criterios con Gemini"}</button></div></form>`;
    else {
      const dimension = draft.dimension, row = draft.criterios[dimension], subject = findSubject(draft.materiaId);
      body.innerHTML = `${status}<div class="initial-wizard-context"><span class="initial-subject-tag" style="--surface-color:${subject.color}">${e(subject.nombre)}</span><h3>${e(draft.titulo)}</h3></div><nav class="initial-dimension-tabs" aria-label="Revision de criterios">${dimensionesActividad.map((id) => `<button type="button" data-wizard-dimension="${id}" aria-pressed="${dimension === id}" class="${dimension === id ? "is-active" : ""}">${id.toUpperCase()}</button>`).join("")}</nav><div class="initial-wizard-criteria"><label class="initial-field">Criterio de ${dimension.toUpperCase()}<input data-wizard-criterion="criterio" maxlength="200" value="${e(row.criterio)}" ${locked || busy ? "disabled" : ""} required></label><div class="initial-wizard-options">${opcionesActividad.map((id) => `<label class="initial-field">${etiquetasOpcionesActividad[id]}<textarea data-wizard-criterion="${id}" maxlength="200" rows="2" ${locked || busy ? "disabled" : ""} required>${e(row.opciones[id])}</textarea></label>`).join("")}</div></div><div class="initial-dialog-actions">${!locked ? `<button type="button" class="initial-button" data-wizard-back>${icon("chevron-left")}Actividad</button>${dimension !== "hacer" ? `<button type="button" class="initial-button" data-wizard-next>${icon("arrow-right")}Siguiente criterio</button>` : ""}<button type="button" class="initial-button" data-wizard-regenerate ${busy || !state.iaAvailable ? "disabled" : ""}>${icon("sparkles")}${busy ? "Generando..." : "Generar nuevos criterios"}</button><button type="button" class="initial-button is-primary" data-wizard-accept ${busy ? "disabled" : ""}>${icon("check-check")}${existing ? "Guardar criterios" : "Aceptar criterios y crear"}</button>` : `<button type="button" class="initial-button" data-wizard-cancel>Cerrar</button>`}</div>`;
    }
    refreshIcons?.();
  }
  async function propose(event, regenerate = false) {
    event.preventDefault(); if (busy || locked) return;
    try {
      const borrador = validarBorradorCriterios(draft);
      if (!regenerate && draft.criterios && Object.keys(draft.criterios).length) { draft.step = "criterios"; render(); return; }
      assertWritable(); busy = true; error = ""; render();
      const result = await generate(state.context, { ...scope, borrador });
      if (modal.signal.aborted) return;
      draft.criterios = validarCriteriosActividad(result.criterios); draft.dimension = "ser"; draft.step = "criterios";
    } catch (failure) { error = failure.message || "No se pudieron generar los criterios."; }
    finally { busy = false; render(); }
  }
  modal.host.addEventListener("submit", (event) => { if (event.target.matches("[data-wizard-details]")) propose(event); }, { signal: modal.signal });
  modal.host.addEventListener("input", (event) => {
    if (busy || locked) return; const target = event.target;
    if (target.dataset.wizardInfo && !existing) {
      const field = target.dataset.wizardInfo; draft[field] = target.type === "checkbox" ? target.checked : target.value;
      if (field !== "prioritaria") { draft.criterios = null; }
    }
    if (target.dataset.wizardCriterion) {
      const field = target.dataset.wizardCriterion, row = draft.criterios[draft.dimension];
      if (field === "criterio") row.criterio = target.value; else row.opciones[field] = target.value;
    }
  }, { signal: modal.signal });
  modal.host.addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button || button.disabled || busy) return;
    if (button.hasAttribute("data-wizard-regenerate")) { propose(event, true); return; }
    if (button.hasAttribute("data-wizard-cancel")) modal.close();
    if (button.dataset.wizardDimension) { draft.dimension = button.dataset.wizardDimension; render(); }
    if (button.hasAttribute("data-wizard-next")) { draft.dimension = dimensionesActividad[dimensionesActividad.indexOf(draft.dimension) + 1]; render(); }
    if (button.hasAttribute("data-wizard-back")) { draft.step = "datos"; render(); }
    if (button.hasAttribute("data-wizard-accept") && !locked) {
      let criterios; try { criterios = validarCriteriosActividad(draft.criterios); } catch (failure) { error = failure.message; render(); return; }
      const input = { ...scope, id: draft.id, accion: existing ? "criterios" : "crear", materiaId: draft.materiaId, titulo: draft.titulo, descripcion: draft.descripcion, prioritaria: draft.prioritaria, criterios };
      modal.close(); run(async () => { assertWritable(); await data.guardarActividad(input); drafts.delete(key); }, existing ? "Criterios actualizados. Las valoraciones anteriores se conservan." : "Actividad creada con criterios aprobados.");
    }
  }, { signal: modal.signal });
  render();
}
