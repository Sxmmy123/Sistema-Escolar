import { revisionCachePrivada } from "../../services/cachePrivada.js";

const requests = new WeakMap();

export function mensajeErrorCarga(error) {
  if (error?.code === "permission-denied") return "No se pudo cargar. Revisa los permisos de tu cuenta.";
  if (error?.code === "unavailable" || error?.code === "deadline-exceeded") return "No se pudo conectar con el servidor. Intenta nuevamente.";
  return "No se pudo completar la carga. Intenta nuevamente.";
}

export async function cargarVistaDocente({ container, isCurrent, readCache, refresh, draw, force = false, complete = Boolean, timeoutMs = 20000 }) {
  const request = {}, revision = revisionCachePrivada();
  requests.set(container, request);
  const current = () => requests.get(container) === request && revision === revisionCachePrivada() && isCurrent();
  let cached = null;
  let timer;
  try {
    cached = await readCache();
    if (!current()) return;
    if (!force && complete(cached)) {
      draw(cached);
      return;
    }
    draw(cached, { loading: true });
    const result = await Promise.race([
      refresh(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Carga agotada"), { code: "deadline-exceeded" })), timeoutMs);
      })
    ]);
    if (current()) draw(result);
  } catch (error) {
    if (current()) draw(cached, { error: mensajeErrorCarga(error) });
  } finally {
    clearTimeout(timer);
  }
}
