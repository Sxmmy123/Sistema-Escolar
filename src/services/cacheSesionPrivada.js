import { alLimpiarCachePrivada, cacheVigente } from "./cachePrivada.js";

export function crearCacheSesionPrivada({ storage = () => sessionStorage } = {}) {
  const memory = new Map();
  const remove = (key) => {
    memory.delete(key);
    try { storage().removeItem(key); } catch { /* El almacenamiento puede estar bloqueado. */ }
  };
  alLimpiarCachePrivada(() => memory.clear());
  return {
    remove,
    read(key, valid = () => true) {
      let entry = memory.get(key);
      try {
        const raw = storage().getItem(key);
        if (raw) {
          const stored = JSON.parse(raw);
          if (!entry || (stored.updatedAt ?? stored.cachedAt) > (entry.updatedAt ?? entry.cachedAt)) entry = stored;
        }
      } catch { /* La copia en memoria permite seguir usando los datos descargados. */ }
      if (!entry || !cacheVigente(entry.updatedAt ?? entry.cachedAt) || !valid(entry)) {
        remove(key);
        return null;
      }
      return entry;
    },
    write(key, entry) {
      memory.delete(key);
      memory.set(key, entry);
      if (memory.size > 32) memory.delete(memory.keys().next().value);
      try { storage().setItem(key, JSON.stringify(entry)); } catch { /* Memoria con la misma caducidad y limpieza de sesion. */ }
    }
  };
}
