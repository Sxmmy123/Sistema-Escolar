export const CACHE_MAX_AGE = 5 * 60 * 1000;
let revision = 0;
const listeners = new Set();
export const revisionCachePrivada = () => revision;
export const alLimpiarCachePrivada = (callback) => { listeners.add(callback); return () => listeners.delete(callback); };
export const cacheVigente = (timestamp, now = Date.now()) => Number.isFinite(timestamp) && timestamp <= now && now - timestamp < CACHE_MAX_AGE;

export function limpiarDatosPrivados(storages) {
  if (!storages) {
    storages = [];
    for (const name of ["localStorage", "sessionStorage"]) { try { storages.push(globalThis[name]); } catch { /* Almacenamiento bloqueado. */ } }
  }
  revision++;
  for (const storage of storages) {
    try {
      const keys = Array.from({ length: storage?.length || 0 }, (_, i) => storage.key(i));
      for (const key of keys) {
        // Los avisos vistos guardan solo identificadores, no expedientes academicos.
        if (key?.startsWith("escolar_v2_") && !key.includes("_director_avisos_vistos_") || /^(sesion|docente)/.test(key || "")) storage.removeItem(key);
      }
    } catch { /* El almacenamiento bloqueado no impide cerrar sesion. */ }
  }
  listeners.forEach((callback) => { try { callback(); } catch { /* Continuar limpiando el resto de modulos. */ } });
}
