import {
  addDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";
import { safeAudit } from "./auditData.js";
import { fechaEscolarIso } from "./fechaEscolar.js";
import { coleccionGestion, documentoGestion } from "./rutasFirestore.js";

const COLLECTION = "comunicados";

export function localDateIso(date = new Date()) {
  return fechaEscolarIso(date);
}

export function activeCommunications(items, today = localDateIso()) {
  return items
    .filter((item) => item.activo !== false && String(item.fechaEvento || "") >= today)
    .sort((a, b) => `${a.fechaEvento}T${a.horaEvento}`.localeCompare(`${b.fechaEvento}T${b.horaEvento}`));
}

function rows(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function activeQuery() {
  return query(coleccionGestion(firestore, COLLECTION), where("fechaEvento", ">=", localDateIso()));
}

export async function listActiveCommunications() {
  return activeCommunications(rows(await getDocs(activeQuery())));
}

export function watchActiveCommunications(onChange, onError) {
  return onSnapshot(activeQuery(), (snapshot) => onChange(activeCommunications(rows(snapshot))), onError);
}

export async function createCommunication({ titulo, motivo, fechaEvento, horaEvento }) {
  const title = String(titulo || "").trim().slice(0, 100);
  const message = String(motivo || "").trim().slice(0, 500);
  const date = String(fechaEvento || "");
  const time = String(horaEvento || "");
  const uid = auth.currentUser?.uid || "";
  if (!uid) throw new Error("Inicia sesion para publicar el comunicado.");
  if (!title || !message) throw new Error("Completa el titulo y el motivo.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < localDateIso()) {
    throw new Error("Selecciona una fecha de hoy en adelante.");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Selecciona una hora valida.");

  const ref = await addDoc(coleccionGestion(firestore, COLLECTION), {
    destinatariosRol: ["docente"],
    titulo: title,
    motivo: message,
    fechaEvento: date,
    horaEvento: time,
    activo: true,
    creadoPorUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await safeAudit({ tipo: "comunicados", accion: "publicar", detalle: `Publico comunicado para docentes: ${title}`, datos: { comunicadoId: ref.id, fechaEvento: date } });
  return ref.id;
}

export async function cancelCommunication(item) {
  if (!item?.id) throw new Error("No se encontro el comunicado.");
  await updateDoc(documentoGestion(firestore, COLLECTION, item.id), { activo: false, updatedAt: serverTimestamp() });
  await safeAudit({ tipo: "comunicados", accion: "cancelar", detalle: `Cancelo comunicado: ${item.titulo || item.id}`, datos: { comunicadoId: item.id } });
}
