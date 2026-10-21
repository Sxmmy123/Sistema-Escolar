import { createIcons, icons } from "lucide";
import { icon } from "../../ui/dom.js";
import { configuracionActual, VERSION_MODELO } from "../../services/rutasFirestore.js";
import { gestionDelCalendario } from "../../services/fechaEscolar.js";
import { listarGestiones, prepararGestion } from "../../services/configuracionSistema.js";
import { auth } from "../../firebase/client.js";
import { programarGuiaRegistro } from "./InicioRegistroAdmin.js";

export function estadoGestionEscolar(configuracion, date = new Date(), registradas = []) {
  const calendario = gestionDelCalendario(date);
  const preparada = configuracion.versionModelo === VERSION_MODELO;
  const activa = configuracion.gestionActivaId || calendario;
  const anteriores = [...new Set(registradas)].filter((id) => /^20\d{2}$/.test(id) && id <= calendario).sort().reverse();
  return { calendario, preparada, activa, anteriores, habilitada: configuracion.gestionHabilitada === true, nuevoAno: preparada && activa !== calendario };
}

export function renderGestionEscolar(configuracion = configuracionActual(), registradas = [], date = new Date()) {
  const estado = estadoGestionEscolar(configuracion, date, registradas);
  const status = `<p data-gestion-status role="status" class="mt-3 text-sm text-slate-600 empty:hidden"></p>`;
  if (!estado.preparada || !estado.habilitada) {
    return `
      <div class="border-b border-slate-200 py-5 sm:py-7">
        <p class="text-xs font-medium text-school-green">Paso 1 de configuracion</p>
        <h2 class="mt-2 text-xl font-semibold text-slate-900">${estado.preparada ? "Habilitar ano escolar" : "Bienvenido al sistema"}</h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Confirma el ano escolar actual para habilitar los modulos de registro. Los docentes no podran registrar asistencia, actividades o notas hasta que lo habilites.</p>
        <div class="mt-5 flex flex-wrap items-center justify-between gap-4">
          <label class="flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 has-[:checked]:border-school-green has-[:checked]:bg-green-50">
            <input type="radio" name="gestion-inicial" data-confirmar-ano value="${estado.calendario}" aria-label="Seleccionar ano escolar ${estado.calendario}" class="h-5 w-5 shrink-0 accent-school-green">
            <span class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-green-50 text-school-green">${icon("calendar-days", "h-5 w-5")}</span>
            <div><p class="text-xs text-slate-600">Ano escolar actual</p><p class="mt-1 text-2xl font-semibold text-slate-900">${estado.calendario}</p></div>
          </label>
          <button type="button" data-iniciar-gestion="${estado.calendario}" disabled class="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-school-green px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">${icon("check", "h-4 w-4")} Confirmar ano y continuar</button>
        </div>
        ${status}
      </div>
    `;
  }
  const selector = estado.anteriores.length > 1
    ? `<label class="flex flex-wrap items-center gap-2 text-sm text-slate-600">Gestion activa
        <select data-seleccionar-gestion aria-label="Gestion escolar activa" class="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50">
          ${estado.anteriores.map((id) => `<option value="${id}" ${id === estado.activa ? "selected" : ""}>${id}</option>`).join("")}
        </select></label>`
    : `<span class="inline-flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-school-green">${icon("calendar-days", "h-4 w-4")} Gestion ${estado.activa}</span>`;
  return `
    <div class="mb-5 border-b border-slate-200 pb-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-base font-semibold text-slate-900">Gestion escolar</h2>${selector}
      </div>
      ${estado.nuevoAno ? `<div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-l-4 border-school-green bg-green-50 px-4 py-3">
        <div><p class="text-sm font-semibold text-slate-900">Ano escolar ${estado.calendario}</p><p class="mt-1 text-sm text-slate-600">La gestion activa sigue siendo ${estado.activa}. Los docentes no pueden registrar cambios hasta que actives el ano actual.</p></div>
        <button type="button" data-iniciar-gestion="${estado.calendario}" class="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-school-green px-3 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">${icon("calendar-check", "h-4 w-4")} ${estado.anteriores.includes(estado.calendario) ? "Activar" : "Iniciar"} ${estado.calendario}</button>
      </div>` : ""}
      ${status}
    </div>
  `;
}

export async function bindGestionEscolar() {
  const root = document.querySelector("[data-admin-gestion]");
  if (!root) return;
  let busy = false;
  let registradas = [];
  function status(message, error = false) {
    const node = root.querySelector("[data-gestion-status]");
    if (!node) return;
    node.textContent = message;
    node.className = `mt-3 text-sm ${error ? "text-red-700" : "text-slate-600"} empty:hidden`;
  }
  async function activar(gestion) {
    const anterior = configuracionActual();
    const preparada = anterior.versionModelo === VERSION_MODELO;
    if (busy || (gestion === anterior.gestionActivaId && preparada && anterior.gestionHabilitada === true)) return;
    const seleccion = root.querySelector("[data-confirmar-ano]");
    if (seleccion && (!seleccion.checked || seleccion.value !== gestion)) return;
    const selector = root.querySelector("[data-seleccionar-gestion]");
    const accion = selector?.querySelector(`option[value="${gestion}"]`) ? "Activar" : "Iniciar";
    const detalle = gestion === gestionDelCalendario() ? `Los docentes podran registrar asistencia, actividades y notas en ${gestion}.` : "Los docentes solo podran consultar esta gestion anterior, sin registrar cambios.";
    if (!seleccion && !window.confirm(`${accion} la gestion ${gestion}? ${detalle} Los datos de otros anos se conservan.`)) {
      if (selector) selector.value = configuracionActual().gestionActivaId;
      return;
    }
    const uid = auth.currentUser?.uid;
    busy = true;
    root.querySelectorAll("button, select, input").forEach((node) => { node.disabled = true; });
    status(`Configurando gestion ${gestion}...`);
    try {
      const registradasAntes = preparada ? await listarGestiones() : [];
      if (auth.currentUser?.uid !== uid) return;
      const mostrarGuia = gestion === gestionDelCalendario() && (!preparada || !registradasAntes.includes(gestion) || (anterior.gestionActivaId === gestion && !anterior.gestionHabilitada));
      await prepararGestion(gestion);
      if (auth.currentUser?.uid !== uid) return;
      if (mostrarGuia) programarGuiaRegistro(uid, gestion);
      window.location.reload();
    } catch (error) {
      status(error?.code === "permission-denied" ? "Publica las reglas actualizadas de Firestore y vuelve a intentar." : error.message || "No se pudo configurar la gestion.", true);
      if (selector) selector.value = configuracionActual().gestionActivaId;
      root.querySelectorAll("button, select, input").forEach((node) => { node.disabled = false; });
      busy = false;
    }
  }
  function bindControls() {
    const seleccion = root.querySelector("[data-confirmar-ano]");
    const continuar = root.querySelector("[data-iniciar-gestion]");
    seleccion?.addEventListener("change", () => { continuar.disabled = !seleccion.checked || busy; });
    root.querySelector("[data-iniciar-gestion]")?.addEventListener("click", (event) => activar(event.currentTarget.dataset.iniciarGestion));
    root.querySelector("[data-seleccionar-gestion]")?.addEventListener("change", (event) => activar(event.currentTarget.value));
  }
  bindControls();
  try {
    registradas = await listarGestiones();
    if (!root.isConnected || busy) return;
    const seleccionada = root.querySelector("[data-confirmar-ano]:checked")?.value;
    root.innerHTML = renderGestionEscolar(configuracionActual(), registradas);
    const seleccion = root.querySelector("[data-confirmar-ano]");
    if (seleccion && seleccion.value === seleccionada) {
      seleccion.checked = true;
      root.querySelector("[data-iniciar-gestion]").disabled = false;
    }
    bindControls();
    createIcons({ icons });
  } catch (error) {
    if (root.isConnected && !busy) status(error.message || "No se pudieron consultar las gestiones registradas.", true);
  }
}
