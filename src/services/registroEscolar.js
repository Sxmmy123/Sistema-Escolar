import { gestionDelCalendario } from "./fechaEscolar.js";

export function gestionAdministrativaDisponible(configuracion = {}) {
  return configuracion.versionModelo === 2 && configuracion.gestionHabilitada === true;
}

export function estadoRegistroEscolar(configuracion = {}, date = new Date()) {
  const calendario = gestionDelCalendario(date);
  const gestion = String(configuracion.gestionActivaId || calendario);
  const habilitada = configuracion.versionModelo === 2 && configuracion.gestionHabilitada === true && gestion === calendario;
  return { gestion, calendario, habilitada, mensaje: habilitada ? "" : `Solo consulta. El administrador debe habilitar la gestion ${calendario} para registrar datos.` };
}

export function validarFechaGestion(fecha, gestion, { opcional = false } = {}) {
  const valor = String(fecha || "");
  if (!valor && opcional) return valor;
  const date = new Date(`${valor}T12:00:00Z`);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(valor) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== valor) {
    throw new Error("La fecha no es valida.");
  }
  if (valor.slice(0, 4) !== String(gestion)) throw new Error(`La fecha ${valor} no pertenece a la gestion ${gestion}.`);
  return valor;
}

export function fechaVisibleEscolar(fecha) {
  const text = new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${fecha}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}
