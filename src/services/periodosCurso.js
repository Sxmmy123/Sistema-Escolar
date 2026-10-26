import { collection, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { documentoGestion } from "./rutasFirestore.js";

export function periodosCurso(db, courseId, year) {
  return collection(documentoGestion(db, "cursos", courseId, year), "trimestres");
}

export function crearGuardadoConPeriodo({ transaction = runTransaction, save = setDoc, timestamp = serverTimestamp } = {}) {
  const known = new Map();
  return async function guardar({ db, uid, year, courseId, termId, kind, sourceRef, periodRef, payload, merge = false }) {
    if (!["actividad", "asistencia"].includes(kind) || !["t1", "t2", "t3"].includes(termId)) throw new Error("Periodo del curso no valido.");
    const key = [uid, year, courseId, termId, kind].join("/");
    const dateKey = `${kind}Fecha`, idKey = `${kind}Id`;
    const knownDate = known.get(key);
    if (knownDate && knownDate <= payload.fecha) return save(sourceRef, payload, { merge });
    let firstDate;
    try {
      firstDate = await transaction(db, async (tx) => {
        const snapshot = await tx.get(periodRef);
        const previous = snapshot.exists() ? snapshot.data()[dateKey] : "";
        tx.set(sourceRef, payload, { merge });
        if (!previous || payload.fecha < previous) tx.set(periodRef, { [dateKey]: payload.fecha, [idKey]: sourceRef.id, updatedAt: timestamp() }, { merge: true });
        return previous && previous <= payload.fecha ? previous : payload.fecha;
      });
    } catch (error) {
      // Un despliegue de reglas pendiente no debe impedir registrar asistencia o actividades.
      if (error.code !== "permission-denied") throw error;
      return save(sourceRef, payload, { merge });
    }
    if (known.size > 200) known.clear();
    known.set(key, firstDate);
  };
}

export const guardarConPeriodoCurso = crearGuardadoConPeriodo();
