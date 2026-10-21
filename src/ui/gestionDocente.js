import { configuracionActual } from "../services/rutasFirestore.js";
import { estadoRegistroEscolar, fechaVisibleEscolar } from "../services/registroEscolar.js";
import { fechaEscolarIso } from "../services/fechaEscolar.js";

export function etiquetaGestionDocente() {
  const estado = estadoRegistroEscolar(configuracionActual());
  return `<span class="inline-flex shrink-0 items-center rounded-md border px-2.5 py-1 text-xs font-medium ${estado.habilitada ? "border-green-200 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-900"}" data-gestion-docente>Gestion ${estado.gestion}</span>`;
}

export function avisoGestionDocente() {
  const estado = estadoRegistroEscolar(configuracionActual());
  return estado.habilitada ? "" : `<div class="border-b border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-5 text-amber-950 sm:px-8" role="status"><strong class="font-semibold">Registro no habilitado.</strong> ${estado.mensaje}</div>`;
}

export function fechaCabeceraDocente() {
  return fechaVisibleEscolar(fechaEscolarIso());
}

const accionesRegistro = [
  "[data-attendance-state]", "[data-guided-state]", "[data-dashboard-trimester]", "[data-trimester-confirm]",
  "[data-activity-form] [type=submit]", "[data-edit-activity-form] [type=submit]", "[data-save-guided-grade]",
  "[data-delete-edit-activity]", "[data-open-activity-date]", "[data-edit-activity]", "[data-finalize-activity-review]", "[data-confirm-finalize-review]", "[data-date-grade-auto]", "[data-grade-no-work]",
  "[data-list-grade-auto]", "[data-list-grade-no-work]", "[data-regularization-grade-value]",
  "[data-save-regularization-grade-input]", "[data-save-next-regularization-grade-input]",
  "[data-request-notes-edit]", "[data-confirm-notes-edit]", "[data-confirm-notes-save]", "[data-request-notes-save]", "[data-notes-edit-grade]", "[data-note-grade-value]",
  "[data-delete-ser-criterion]", "[data-ser-criterion-form] [type=submit]", "[data-add-ser-criterion]",
  "[data-edit-ser-criterion]", "[data-auto-grade]", "[data-ser-grade]"
].join(",");

export function bindRegistroDocente(signal) {
  const root = document.querySelector("[data-teacher-ui]");
  if (!root || estadoRegistroEscolar(configuracionActual()).habilitada) return;
  const bloquear = () => root.querySelectorAll(accionesRegistro).forEach((node) => {
    node.disabled = true;
    node.setAttribute("aria-disabled", "true");
    node.title = "El administrador debe habilitar el ano escolar para registrar cambios.";
    node.classList.add("opacity-50", "cursor-not-allowed");
  });
  bloquear();
  const observer = new MutationObserver(bloquear);
  observer.observe(root, { childList: true, subtree: true });
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}
