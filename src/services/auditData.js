import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  where
} from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";
import { ADMIN_USER } from "../firebase/config.js";
import { fechaEscolarIso } from "./fechaEscolar.js";
import { gestionActual } from "./rutasFirestore.js";

function todayIso() {
  return fechaEscolarIso();
}

export async function logAudit({ tipo, accion, detalle, datos = {} }, clients = {}) {
  const authClient = clients.auth || auth;
  const db = clients.db || firestore;
  const read = clients.read || getDoc;
  const write = clients.write || addDoc;
  const user = authClient.currentUser;
  if (!user?.uid) throw new Error("La auditoria requiere una sesion autenticada.");
  let role = "admin";
  if (user.uid !== ADMIN_USER.uid) {
    const profile = (await read(doc(db, "usuarios", user.uid))).data();
    if (profile?.activo !== true || !["admin", "director", "docente", "alumno"].includes(profile.rol)) {
      throw new Error("La auditoria requiere un perfil activo.");
    }
    role = profile.rol;
  }
  if (authClient.currentUser?.uid !== user.uid) throw new Error("La sesion cambio antes de registrar auditoria.");
  const now = new Date();

  await write(collection(db, "auditoria"), {
    gestionId: gestionActual(),
    tipo: String(tipo || "sistema"),
    accion: String(accion || "movimiento"),
    detalle: String(detalle || "Movimiento registrado"),
    datos,
    usuarioUid: user.uid,
    usuario: user.email || "-",
    rol: role,
    origen: "cliente",
    fecha: todayIso(),
    hora: now.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    createdAt: serverTimestamp()
  });
}

export async function safeAudit(payload) {
  try {
    await logAudit(payload);
  } catch (error) {
    console.warn("No se pudo registrar auditoria", error);
  }
}

export async function listAudit({ fecha = todayIso(), tipo = "", buscar = "", cursor = null, pageSize = 100 } = {}, { db = firestore, read = getDocs } = {}) {
  const size = Math.min(250, Math.max(1, Math.floor(Number(pageSize) || 100)));
  if (fecha && !/^20\d{2}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Selecciona una fecha valida.");
  const filters = [];
  if (fecha) filters.push(where("fecha", "==", fecha));
  if (tipo) filters.push(where("tipo", "==", tipo));
  filters.push(orderBy("createdAt", "desc"));
  if (cursor) filters.push(startAfter(cursor));
  const snap = await read(query(collection(db, "auditoria"), ...filters, limit(size + 1)));
  const docs = snap.docs.slice(0, size);

  const text = String(buscar || "").trim().toLowerCase();
  const items = docs
    .map((item) => ({ ...item.data(), id: item.id }))
    .filter((item) => {
      if (!text) return true;
      return [item.usuario, item.rol, item.tipo, item.accion, item.detalle, JSON.stringify(item.datos || {})]
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  return { items, cursor: docs.at(-1) || cursor, hasMore: snap.docs.length > size, scanned: docs.length };
}
