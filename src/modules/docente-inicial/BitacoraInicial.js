import { e, icon, paginaInicial, puedeRegistrarInicial, vacioInicial } from "./ComponentesInicial.js";
import { alumnoInicial, selectorAlumnoInicial, historialInicial } from "./SeguimientoInicial.js";

export function BitacoraInicial(state) {
  const students = state.data.leer("students", state.courseId);
  const records = state.data.leer("records", state.courseId, state.termId);
  if (!students || !records) return paginaInicial(state, "Bitacora", vacioInicial("Cargando bitacora...", "", "book-open-text"));
  const student = alumnoInicial(state);
  if (!student) return paginaInicial(state, "Bitacora", vacioInicial("Sin estudiantes activos", ""));
  const draft = state.noteDraft();
  const writable = puedeRegistrarInicial(state) && !state.busy;
  return paginaInicial(state, "Bitacora", `${selectorAlumnoInicial(state)}<form data-initial-note-form class="initial-journal-form"><label class="initial-field" for="initial-journal-note">Observacion del estudiante</label><textarea id="initial-journal-note" data-initial-journal-note maxlength="5000" rows="6" required ${!writable ? "disabled" : ""}>${e(draft.descripcion || "")}</textarea><div class="initial-form-footer"><span data-initial-note-count>${(draft.descripcion || "").length}/5000</span><button type="submit" class="initial-button is-primary" data-initial-save-note ${!writable || !draft.descripcion?.trim() ? "disabled" : ""}>${icon("save")}Guardar observacion</button></div></form><section class="initial-section"><div class="initial-section-title"><h2>Observaciones del estudiante</h2></div>${historialInicial(records.filter((item) => ["bitacora", "semanal"].includes(item.tipo)), student.id)}</section>`);
}
