import { doc, getDocs, query, where, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";
import { asegurarRegistroDocente, coleccionGestion, documentoGestion, gestionActual } from "./rutasFirestore.js";
import { cursoInicial } from "./modeloInicial.js";
import { exigirTrimestreDocente } from "./relevoDocente.js";
import { validarActividadInicial, validarCriteriosActividad, dimensionesActividad, opcionesActividad, idAvanceInicial } from "./modeloActividadesInicial.js";

function check(context, course, term, authClient, writable = true) {
  if (authClient.currentUser?.uid !== context.uid || gestionActual() !== context.gestionId) throw new Error("La sesion cambio.");
  cursoInicial(context, course);
  if (writable) { asegurarRegistroDocente(); exigirTrimestreDocente(context, term); }
}
export async function listarActividadesInicial(context, course, term, { db = firestore, authClient = auth } = {}) {
  check(context, course, term, authClient, false);
  const result = await getDocs(query(coleccionGestion(db, "actividades_inicial"), where("docenteUid", "==", context.uid), where("cursoId", "==", course), where("trimestreId", "==", term)));
  check(context, course, term, authClient, false);
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}
export async function modificarActividadInicial(context, input, { db = firestore, authClient = auth } = {}) {
  check(context, input.cursoId, input.trimestreId, authClient);
  const id = input.id || `${context.uid}_${doc(coleccionGestion(db, "actividades_inicial")).id}`;
  if (!id.startsWith(`${context.uid}_`) || id.includes("/")) throw new Error("Actividad no valida.");
  const ref = documentoGestion(db, "actividades_inicial", id);
  let result;
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref), previous = snapshot.data();
    if (previous && (previous.docenteUid !== context.uid || previous.cursoId !== input.cursoId || previous.trimestreId !== input.trimestreId)) throw new Error("La actividad no pertenece a esta asignacion.");
    if (previous && input.accion === "crear") { result = { id, ...previous }; return; }
    let payload;
    if (!previous) {
      if (input.accion !== "crear") throw new Error("La actividad ya no existe.");
      payload = { ...validarActividadInicial(input), docenteUid: context.uid, cursoId: input.cursoId, trimestreId: input.trimestreId, prioritaria: input.prioritaria === true, orden: `${String(Date.now()).padStart(13, "0")}_${id}`, estado: "pendiente", criterios: input.criterios ? validarCriteriosActividad(input.criterios) : {}, tieneRegistros: false, createdAt: serverTimestamp() };
    } else {
      payload = { ...previous };
      if (input.accion === "prioridad") { if (previous.estado !== "pendiente") throw new Error("Solo puedes priorizar actividades pendientes."); payload.prioritaria = !previous.prioritaria; }
      else if (input.accion === "eliminar") { payload.estado = "eliminada"; payload.prioritaria = false; }
      else if (input.accion === "restaurar") { if (previous.estado !== "eliminada") throw new Error("La actividad no esta eliminada."); payload.estado = "pendiente"; }
      else if (input.accion === "finalizar") { if (previous.estado !== "pendiente") throw new Error("La actividad no esta pendiente."); payload.estado = "finalizada"; payload.prioritaria = false; }
      else if (input.accion === "reabrir") { if (previous.estado !== "finalizada") throw new Error("La actividad no esta finalizada."); payload.estado = "pendiente"; }
      else if (input.accion === "criterios") {
        if (previous.estado === "eliminada") throw new Error("Restaura la actividad antes de editar sus criterios.");
        payload.criterios = validarCriteriosActividad(input.criterios);
      } else throw new Error("Operacion no disponible.");
    }
    payload.updatedAt = serverTimestamp(); tx.set(ref, payload);
    result = { id, ...payload, createdAt: previous?.createdAt || Timestamp.now(), updatedAt: Timestamp.now() };
  });
  check(context, input.cursoId, input.trimestreId, authClient);
  return result;
}
export async function moverActividadInicial(context, activity, neighbor, { db = firestore, authClient = auth } = {}) {
  check(context, activity.cursoId, activity.trimestreId, authClient);
  check(context, neighbor.cursoId, activity.trimestreId, authClient);
  const refs = [activity, neighbor].map((item) => documentoGestion(db, "actividades_inicial", item.id));
  let result;
  await runTransaction(db, async (tx) => {
    const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
    const rows = snapshots.map((item) => item.data());
    if (rows.some((item, index) => !item || item.docenteUid !== context.uid || item.cursoId !== [activity, neighbor][index].cursoId || item.trimestreId !== activity.trimestreId || item.estado === "eliminada" || item.orden !== [activity, neighbor][index].orden)) throw new Error("El orden cambio. Actualiza la lista antes de moverla.");
    result = rows.map((row, index) => ({ id: refs[index].id, ...row, orden: rows[1 - index].orden, updatedAt: Timestamp.now() }));
    refs.forEach((ref, index) => tx.update(ref, { orden: result[index].orden, updatedAt: serverTimestamp() }));
  });
  check(context, activity.cursoId, activity.trimestreId, authClient); return result;
}
export async function guardarAvanceInicial(context, activity, studentId, entries, { db = firestore, authClient = auth, cursoAlumnoId = activity.cursoId } = {}) {
  check(context, activity.cursoId, activity.trimestreId, authClient);
  check(context, cursoAlumnoId, activity.trimestreId, authClient);
  if (!studentId || studentId.includes("/")) throw new Error("Selecciona un estudiante.");
  const changes = Object.entries(entries);
  if (!changes.length || changes.some(([dimension, entry]) => !dimensionesActividad.includes(dimension) || !opcionesActividad.includes(entry.valoracion) || String(entry.descripcion || "").length > 1000)) throw new Error("Selecciona una valoracion valida.");
  const ref = documentoGestion(db, "actividades_inicial", activity.id);
  let result;
  await runTransaction(db, async (tx) => {
    const current = (await tx.get(ref)).data();
    if (!current || current.docenteUid !== context.uid || current.cursoId !== activity.cursoId || current.trimestreId !== activity.trimestreId || current.estado !== "pendiente") throw new Error("La actividad ya no esta disponible para registrar avances.");
    const criteria = validarCriteriosActividad(current.criterios);
    if (JSON.stringify(validarCriteriosActividad(activity.criterios)) !== JSON.stringify(criteria)) {
      const error = new Error("Los criterios cambiaron en otra sesion. La actividad se actualizo; selecciona la valoracion con los criterios actuales.");
      error.code = "initial/criteria-changed";
      throw error;
    }
    const refs = changes.map(([dimension]) => documentoGestion(db, "registros_inicial", idAvanceInicial(context.uid, activity.id, studentId, dimension)));
    const previous = await Promise.all(refs.map((item) => tx.get(item)));
    const rows = changes.map(([dimension, entry], index) => ({
      tipo: "actividad", actividadId: activity.id, actividadTitulo: current.titulo, alumnoId: studentId, cursoId: cursoAlumnoId, trimestreId: current.trimestreId, materiaId: current.materiaId, docenteUid: context.uid,
      dimension, criterio: criteria[dimension].criterio, valoracion: entry.valoracion, opinion: criteria[dimension].opciones[entry.valoracion], descripcion: String(entry.descripcion || "").trim(),
      createdAt: previous[index].data()?.createdAt || serverTimestamp(), updatedAt: serverTimestamp()
    }));
    rows.forEach((row, index) => tx.set(refs[index], row));
    tx.update(ref, { tieneRegistros: true, updatedAt: serverTimestamp() });
    result = { activity: { id: activity.id, ...current, tieneRegistros: true, updatedAt: Timestamp.now() }, records: rows.map((row, index) => ({ id: refs[index].id, ...row, createdAt: previous[index].data()?.createdAt || Timestamp.now(), updatedAt: Timestamp.now() })) };
  });
  check(context, activity.cursoId, activity.trimestreId, authClient); return result;
}
