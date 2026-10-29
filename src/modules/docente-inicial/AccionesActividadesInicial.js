import { opcionesActividad, siguientePasoRegistroInicial } from "../../services/modeloActividadesInicial.js";
import { generarCriteriosConIA } from "../../services/informeInicialIA.js";
import { actividadesDeEstado } from "./ActividadesInicial.js";
import { actividadSeleccionada } from "./RegistroInicial.js";
import { alumnoInicial, alumnosInicial } from "./SeguimientoInicial.js";
import { abrirPreparacionActividad } from "./PrepararActividadInicial.js";
import { e } from "./ComponentesInicial.js";

export function crearAccionesActividades({ state, data, dialog, draw, run, assertWritable, refreshIcons, selectActivity = (_, activate) => activate(), generate = generarCriteriosConIA }) {
  const rows = () => data.leer("activities", state.courseId, state.termId) || [];
  const base = () => ({ cursoId: state.courseId, trimestreId: state.termId });
  const creationDrafts = new Map();
  function prepare(activity) { abrirPreparacionActividad({ state, data, activity, dialog, run, assertWritable, generate, refreshIcons, drafts: creationDrafts }); }
  function confirm(title, text, label, operation) {
    const modal = dialog(title, `<p class="initial-dialog-context">${e(text)}</p><div class="initial-dialog-actions"><button type="button" class="initial-button" data-initial-cancel-term>Cancelar</button><button type="button" class="initial-button is-primary" data-activity-confirm>${e(label)}</button></div>`);
    modal.host.querySelector("[data-activity-confirm]").addEventListener("click", () => { modal.close(); run(async () => { assertWritable(); await operation(); }, "Cambio guardado."); }, { signal: modal.signal });
  }
  function saveSelection() {
    const activity = actividadSeleccionada(state), student = alumnoInicial(state), draft = state.advanceDraft(), dimension = state.dimension;
    if (!activity || !student || !state.registrationStudentSelected || !Object.keys(draft).length) return;
    const snapshot = structuredClone(draft);
    state.autoSaving = true;
    run(async (current) => {
      try {
        assertWritable(); await data.guardarAvance(activity, student.id, snapshot);
        for (const key of Object.keys(snapshot)) if (JSON.stringify(draft[key]) === JSON.stringify(snapshot[key])) delete draft[key];
        if (!current()) return;
        const next = siguientePasoRegistroInicial(data.leer("records", state.courseId, activity.trimestreId) || [], activity.id, alumnosInicial(state), student.id, dimension);
        state.studentId = next.studentId; state.dimension = next.dimension;
      } catch (error) {
        if (error.code === "initial/criteria-changed") for (const key of Object.keys(snapshot)) delete draft[key];
        throw error;
      } finally { state.autoSaving = false; }
    }, "Avance guardado automaticamente.");
  }
  return {
    click(button) {
      if (button.hasAttribute("data-activity-view")) { state.activityView = button.dataset.activityView; draw(); return true; }
      if (button.hasAttribute("data-activity-archive")) { state.activityArchive = !state.activityArchive; draw(); return true; }
      if (button.hasAttribute("data-activity-grid")) { selectActivity(button, () => { state.activityId = ""; state.registrationStudentSelected = false; state.message = ""; state.error = false; draw(); }); return true; }
      if (button.dataset.activityOpen) { const id = button.dataset.activityOpen; selectActivity(button, () => { state.activityId = id; state.registrationStudentSelected = false; state.dimension = "ser"; state.message = ""; state.error = false; draw(); }); return true; }
      if (button.dataset.activityStudent && alumnosInicial(state).some((item) => item.id === button.dataset.activityStudent)) { state.studentId = button.dataset.activityStudent; state.registrationStudentSelected = true; state.dimension = "ser"; state.message = ""; state.error = false; draw(); return true; }
      if (button.dataset.activityRate && opcionesActividad.includes(button.dataset.activityRate)) {
        const activity = actividadSeleccionada(state); if (!activity?.criterios?.[state.dimension] || !state.registrationStudentSelected) return true;
        const saved = (data.leer("records", state.courseId, state.termId) || []).find((item) => item.tipo === "actividad" && item.actividadId === activity.id && item.alumnoId === alumnoInicial(state)?.id && item.dimension === state.dimension);
        const draft = state.advanceDraft();
        draft[state.dimension] = { valoracion: button.dataset.activityRate, descripcion: draft[state.dimension]?.descripcion ?? saved?.descripcion ?? "" };
        saveSelection(); return true;
      }
      const id = button.dataset.activityId, operation = button.dataset.activityAction, activity = rows().find((item) => item.id === id);
      if (activity && operation) {
        if (!["criterios", "up", "down", "eliminar", "prioridad", "reabrir", "restaurar"].includes(operation)) return true;
        if (operation === "criterios") { prepare(activity); return true; }
        if (["up", "down"].includes(operation)) {
          const ordered = actividadesDeEstado(state), neighbor = ordered[ordered.findIndex((item) => item.id === id) + (operation === "up" ? -1 : 1)];
          if (neighbor) run(async () => { assertWritable(); await data.moverActividad(activity, neighbor); }, "Orden actualizado.");
        } else if (operation === "eliminar") confirm("Eliminar actividad", `${activity.titulo}. Se retirara de la lista; los registros de estudiantes se conservaran.`, "Eliminar", () => data.guardarActividad({ ...base(), id, accion: operation }));
        else run(async () => { assertWritable(); await data.guardarActividad({ ...base(), id, accion: operation }); }, "Actividad actualizada.");
        return true;
      }
      const action = button.dataset.initialAction;
      if (action === "new-activity") { prepare(); return true; }
      if (action === "more-activities") { state.activityLimit += 5; draw(); return true; }
      if (action === "retry-advance") { saveSelection(); return true; }
      if (action === "finish-activity" && state.route === "/docente/registro") {
        const activity = actividadSeleccionada(state); if (activity) confirm("Finalizar actividad", `${activity.titulo}. Los registros guardados se conservaran. No se asignaran valoraciones a alumnos sin observacion.`, "Finalizar", () => data.guardarActividad({ ...base(), id: activity.id, accion: "finalizar" })); return true;
      }
      return false;
    }
  };
}
