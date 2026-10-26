import { modalidadDeContexto } from "../../services/modalidadDocente.js";

export function crearEntradaDocente(obtenerContexto, importadores) {
  const disponibles = new Map();
  let revision = 0;
  let active = null;
  return {
    get rutas() { return active?.rutas || {}; },
    async preparar() {
      const request = ++revision;
      let context = await obtenerContexto();
      try { context = { ...context, ...modalidadDeContexto(context) }; }
      catch (error) { context = { ...context, nivelDocente: "pendiente", errorModalidad: error.message }; }
      if (request !== revision) return false;
      const type = context.nivelDocente === "inicial" || context.errorModalidad ? "inicial" : "primaria";
      if (!disponibles.has(type)) {
        disponibles.set(type, Promise.resolve().then(importadores[type]).catch((error) => { disponibles.delete(type); throw error; }));
      }
      const selected = await disponibles.get(type);
      if (request !== revision) return false;
      if (active && active !== selected) active.desmontar?.();
      active = selected;
      active.preparar?.(context);
      return true;
    },
    vincular: (route) => active?.vincular?.(route),
    actualizarIconos: () => active?.actualizarIconos?.(),
    desmontar() { revision += 1; active?.desmontar?.(); active = null; }
  };
}
