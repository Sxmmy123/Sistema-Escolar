import { doc, getDocs, query, where, setDoc, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";
import { asegurarRegistroDocente, coleccionGestion, documentoGestion, gestionActual } from "./rutasFirestore.js";
import { cursoInicial, idRegistroInicial, validarRegistroInicial, validarSeguimientoInicial, validarEdicionBitacoraInicial } from "./modeloInicial.js";

export const nuevoIdRegistroInicial = (uid) => `${uid}_${doc(coleccionGestion(firestore, "registros_inicial")).id}`;

function comprobarSesion(context, authClient) {
  if (!context?.uid || authClient.currentUser?.uid !== context.uid || gestionActual() !== context.gestionId) throw new Error("La sesion cambio. Vuelve a abrir el modulo.");
}
export async function listarRegistrosInicial(context, courseId, termId, { db = firestore, authClient = auth } = {}) {
  comprobarSesion(context, authClient);
  cursoInicial(context, courseId);
  const snapshot = await getDocs(query(coleccionGestion(db, "registros_inicial"), where("cursoId", "==", courseId), where("trimestreId", "==", termId), where("docenteUid", "==", context.uid)));
  comprobarSesion(context, authClient);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}
export async function guardarRegistroInicial(context, input, { db = firestore, authClient = auth } = {}) {
  comprobarSesion(context, authClient);
  asegurarRegistroDocente();
  if (["observacion", "bitacora", "informe"].includes(input.tipo)) {
    const data = validarSeguimientoInicial(context, input);
    const id = data.tipo === "informe" ? `${context.uid}_informe_${data.cursoId}_${data.trimestreId}_${data.alumnoId}` : input.id;
    if (typeof id !== "string" || !id.startsWith(`${context.uid}_`) || id.includes("/") || id.length > 500) throw new Error("El identificador del registro no es valido.");
    const reference = documentoGestion(db, "registros_inicial", id);
    let result;
    await runTransaction(db, async (transaction) => {
      const previous = await transaction.get(reference);
      if (previous.exists() && data.tipo !== "informe") {
        result = { id, ...previous.data() };
        return;
      }
      const payload = { ...data, docenteUid: context.uid, createdAt: previous.data()?.createdAt || serverTimestamp(), updatedAt: serverTimestamp() };
      transaction.set(reference, payload);
      result = { id, ...payload, createdAt: previous.data()?.createdAt || Timestamp.now(), updatedAt: Timestamp.now() };
    });
    comprobarSesion(context, authClient);
    return result;
  }
  const data = validarRegistroInicial(context, input);
  const id = idRegistroInicial(context.uid, data);
  const payload = { ...data, docenteUid: context.uid, updatedAt: serverTimestamp() };
  await setDoc(documentoGestion(db, "registros_inicial", id), payload);
  comprobarSesion(context, authClient);
  return { id, ...payload };
}

export async function editarBitacoraInicial(context, input, { db = firestore, authClient = auth } = {}) {
  comprobarSesion(context, authClient); asegurarRegistroDocente();
  if (typeof input.id !== "string" || !input.id.startsWith(`${context.uid}_`) || input.id.includes("/") || input.id.length > 500) throw new Error("El identificador de la observacion no es valido.");
  const reference = documentoGestion(db, "registros_inicial", input.id);
  let result;
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference), previous = snapshot.exists() ? snapshot.data() : null;
    const valid = validarEdicionBitacoraInicial(context, input, previous);
    transaction.update(reference, { descripcion: valid.descripcion, updatedAt: serverTimestamp() });
    result = { id: input.id, ...previous, descripcion: valid.descripcion, updatedAt: Timestamp.now() };
  });
  comprobarSesion(context, authClient);
  return result;
}
