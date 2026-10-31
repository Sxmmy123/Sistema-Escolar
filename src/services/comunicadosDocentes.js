import {
  addDoc,
  doc,
  getDoc,
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

export function communicationAudience(item) {
  return item?.destinatarioUid ? item.destinatarioNombre || "Docente seleccionado" : "Todos los docentes";
}

export function communicationForTeacher(item, uid) {
  return Boolean(uid && (item.destinatariosRol?.includes("docente") || item.destinatarioUid === uid));
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
  const uid = auth.currentUser?.uid;
  if (!uid) { onError?.(new Error("Inicia sesion para consultar los comunicados.")); return () => {}; }
  const source = coleccionGestion(firestore, COLLECTION);
  const queries = [query(source, where("destinatariosRol", "array-contains", "docente")), query(source, where("destinatarioUid", "==", uid))];
  const groups = new Map(), stops = [];
  let closed = false;
  const stop = () => { closed = true; stops.forEach((unsubscribe) => unsubscribe()); };
  // Two audience queries retain legacy broadcasts without downloading another teacher's notices.
  queries.forEach((request, index) => {
    if (closed) return;
    const unsubscribe = onSnapshot(request, (snapshot) => {
      if (closed) return;
      if (auth.currentUser?.uid !== uid) { stop(); return; }
      groups.set(index, rows(snapshot));
      if (groups.size === queries.length) {
        const merged = [...new Map([...groups.values()].flat().map((item) => [item.id, item])).values()];
        onChange(activeCommunications(merged.filter((item) => communicationForTeacher(item, uid))));
      }
    }, (error) => {
      if (closed) return;
      const sameSession = auth.currentUser?.uid === uid;
      stop(); if (sameSession) onError?.(error);
    });
    stops.push(unsubscribe);
    if (closed) unsubscribe();
  });
  return stop;
}

export async function createCommunication({ titulo, motivo, fechaEvento, horaEvento, alcance = "todos", destinatarioUid = "" }) {
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
  if (!["todos", "docente"].includes(alcance)) throw new Error("Selecciona a quien enviar el comunicado.");
  let recipient = "", recipientName = "";
  if (alcance === "docente") {
    recipient = String(destinatarioUid || "").trim();
    if (!recipient || recipient.includes("/") || recipient.length > 128) throw new Error("Selecciona un docente.");
    const profile = await getDoc(doc(firestore, "usuarios", recipient));
    const teacher = profile.data();
    if (!profile.exists() || teacher.rol !== "docente" || teacher.activo !== true) throw new Error("El docente seleccionado ya no esta activo. Actualiza la lista.");
    recipientName = String(teacher.nombre || "Docente").trim().slice(0, 160) || "Docente";
  }
  if (auth.currentUser?.uid !== uid) throw new Error("La sesion cambio. Vuelve a ingresar.");

  const ref = await addDoc(coleccionGestion(firestore, COLLECTION), {
    destinatariosRol: recipient ? [] : ["docente"],
    destinatarioUid: recipient,
    destinatarioNombre: recipientName,
    titulo: title,
    motivo: message,
    fechaEvento: date,
    horaEvento: time,
    activo: true,
    creadoPorUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await safeAudit({ tipo: "comunicados", accion: "publicar", detalle: `Publico comunicado para ${recipient ? recipientName : "todos los docentes"}: ${title}`, datos: { comunicadoId: ref.id, fechaEvento: date, destinatarioUid: recipient } });
  return ref.id;
}

export async function cancelCommunication(item) {
  if (!item?.id) throw new Error("No se encontro el comunicado.");
  await updateDoc(documentoGestion(firestore, COLLECTION, item.id), { activo: false, updatedAt: serverTimestamp() });
  await safeAudit({ tipo: "comunicados", accion: "cancelar", detalle: `Cancelo comunicado: ${item.titulo || item.id}`, datos: { comunicadoId: item.id } });
}
