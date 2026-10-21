import { claveCache } from "./rutasFirestore.js";

const seenInMemory = new Map();

export function directorAlertKey(item) {
  const details = item.kind === "attendance"
    ? [...(item.dates || [])].sort()
    : (item.subjects || []).map((subject) => [subject.id, subject.score]).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([item.kind, item.courseId, item.trimesterId, item.studentId, item.value, item.threshold, details]);
}

export function unseenDirectorAlerts(items, seenKeys = []) {
  const seen = new Set(seenKeys);
  return items.filter((item) => !seen.has(directorAlertKey(item)));
}

export function readDirectorSeenKeys(uid, trimesterId, storage) {
  const key = claveCache("director_avisos_vistos", uid, trimesterId);
  const memory = [...(seenInMemory.get(key) || [])];
  try {
    const stored = JSON.parse((storage || globalThis.localStorage)?.getItem(key) || "[]");
    return [...new Set([...(Array.isArray(stored) ? stored.filter((item) => typeof item === "string") : []), ...memory])];
  } catch {
    return memory;
  }
}

export function markDirectorAlertViewed(uid, item, storage) {
  if (!uid || !item.studentId || !["attendance", "grade"].includes(item.kind) || !["t1", "t2", "t3"].includes(item.trimesterId)) return;
  const key = claveCache("director_avisos_vistos", uid, item.trimesterId);
  const seen = new Set([...readDirectorSeenKeys(uid, item.trimesterId, storage), directorAlertKey(item)]);
  seenInMemory.set(key, seen);
  try {
    (storage || globalThis.localStorage)?.setItem(key, JSON.stringify([...seen]));
  } catch {
    // Sigue oculto durante esta sesion si el navegador bloquea el almacenamiento.
  }
}
