import { getDocsFromServer, limit, query, runTransaction, where } from "firebase/firestore";
import { coleccionGestion, documentoGestion } from "./rutasFirestore.js";

const CAMPOS_ACADEMICOS = {
  cursoId: "curso", materiaId: "materia", trimestreId: "trimestre", fecha: "fecha",
  tipo: "tipo de actividad", maximo: "puntaje maximo", calificable: "habilitacion de puntaje"
};

function valorCampo(actividad, campo) {
  if (campo === "maximo") return Number(actividad.maximo ?? 100);
  if (campo === "calificable") return actividad.calificable === true;
  if (campo === "trimestreId") return actividad.trimestreId || "t1";
  if (campo === "tipo") return actividad.tipo || "tarea";
  return actividad[campo] || "";
}

export function validarCambioActividad(actual, siguiente, tieneCalificaciones) {
  if (!tieneCalificaciones) return;
  const cambios = Object.keys(CAMPOS_ACADEMICOS)
    .filter((campo) => valorCampo(actual, campo) !== valorCampo(siguiente, campo));
  if (cambios.length) {
    throw new Error(`Esta actividad ya tiene calificaciones. No se puede cambiar: ${cambios.map((campo) => CAMPOS_ACADEMICOS[campo]).join(", ")}. Puede corregir el titulo o los materiales.`);
  }
}

export function validarEliminacionActividad(tieneCalificaciones) {
  if (tieneCalificaciones) {
    throw new Error("No se puede eliminar una actividad con calificaciones. Sus notas deben conservarse.");
  }
}

async function tieneNotas(db, id, actividad, gestionId) {
  if (actividad.tieneCalificaciones === true) return true;
  const notas = await getDocsFromServer(query(
    coleccionGestion(db, "calificaciones", gestionId), where("actividadId", "==", id), limit(1)
  ));
  return !notas.empty;
}

export async function actualizarActividadProtegida({ db, id, datos, siguiente }) {
  const ref = documentoGestion(db, "actividades", id);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("La actividad ya no existe. Actualice la agenda.");
    const actual = snapshot.data();
    // Cada nueva nota bloquea este documento en el mismo lote: una revision concurrente reintenta la transaccion.
    const tieneCalificaciones = await tieneNotas(db, id, actual, ref.parent.parent.id);
    validarCambioActividad(actual, siguiente, tieneCalificaciones);
    transaction.update(ref, { ...datos, ...(tieneCalificaciones ? { tieneCalificaciones: true } : {}) });
    return { ...actual, ...siguiente, id, ...(tieneCalificaciones ? { tieneCalificaciones: true } : {}) };
  });
}

export async function eliminarActividadProtegida({ db, id }) {
  const ref = documentoGestion(db, "actividades", id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    validarEliminacionActividad(await tieneNotas(db, id, snapshot.data(), ref.parent.parent.id));
    transaction.delete(ref);
  });
}
