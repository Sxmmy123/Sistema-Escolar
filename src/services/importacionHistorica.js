import { runTransaction } from "firebase/firestore";

const MAX_WRITES = 450;

export function comprobarConflictosHistoricos(groups, existing) {
  const ids = new Set();
  for (const item of groups.flat()) {
    const key = `${item.collection}/${item.id}`;
    if (ids.has(key)) throw new Error("La carga contiene identificadores repetidos. Revisa los alumnos y actividades antes de importar.");
    ids.add(key);
    const saved = existing.get(key);
    if (saved && !item.matches(saved)) {
      throw new Error(`Hay un registro diferente en ${item.label}. No se sobrescribio ningun dato. Revisa el conflicto antes de importar.`);
    }
  }
}

export async function guardarImportacionHistorica({ groups, existing, reference, db, current, transact = runTransaction, onProgress = () => {} }) {
  comprobarConflictosHistoricos(groups, existing);
  const chunks = [];
  // Una actividad y sus notas se confirman juntas, nunca en lotes separados.
  for (const group of groups) {
    if (group.length > MAX_WRITES) throw new Error("Una actividad supera 449 notas. Divide esa actividad antes de importar.");
    if (!chunks.length || chunks.at(-1).length + group.length > MAX_WRITES) chunks.push([]);
    chunks.at(-1).push(...group);
  }
  const progress = { confirmed: 0, created: 0, preserved: 0, total: groups.flat().length };
  for (const chunk of chunks) {
    try {
      if (!current()) throw new Error("La sesion, la gestion o la pantalla cambiaron.");
      const result = await transact(db, async (transaction) => {
        const snapshots = await Promise.all(chunk.map((item) => transaction.get(reference(item))));
        if (!current()) throw new Error("La sesion, la gestion o la pantalla cambiaron.");
        let created = 0, preserved = 0;
        snapshots.forEach((snapshot, index) => {
          const item = chunk[index];
          if (snapshot.exists()) {
            if (!item.matches(snapshot.data())) throw new Error(`El registro de ${item.label} cambio mientras se importaba.`);
            preserved++;
          } else {
            transaction.set(reference(item), item.data);
            created++;
          }
        });
        return { created, preserved };
      });
      progress.created += result.created;
      progress.preserved += result.preserved;
      progress.confirmed += chunk.length;
      onProgress({ ...progress });
    } catch (cause) {
      const error = new Error(`Importacion interrumpida: ${progress.confirmed} de ${progress.total} registros confirmados (${progress.created} nuevos, ${progress.preserved} conservados). ${cause.message || "No se pudo confirmar el lote."} Reintenta la misma carga: los registros ya existentes no se duplican ni se reemplazan.`, { cause });
      error.code = "importacion/interrumpida";
      error.progress = { ...progress };
      throw error;
    }
  }
  return progress;
}
