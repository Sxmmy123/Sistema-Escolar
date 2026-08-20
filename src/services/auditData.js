import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp
} from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function currentSession() {
  return {
    uid: auth.currentUser?.uid || sessionStorage.getItem("sesionUid") || "",
    usuario: sessionStorage.getItem("sesionUsuario") || auth.currentUser?.email || "-",
    rol: sessionStorage.getItem("sesionRol") || "-"
  };
}

export async function logAudit({ tipo, accion, detalle, datos = {} }) {
  const session = currentSession();
  const now = new Date();

  await addDoc(collection(firestore, "auditoria"), {
    tipo: String(tipo || "sistema"),
    accion: String(accion || "movimiento"),
    detalle: String(detalle || "Movimiento registrado"),
    datos,
    usuarioUid: session.uid,
    usuario: session.usuario,
    rol: session.rol,
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

export async function listAudit({ fecha = todayIso(), tipo = "", buscar = "" } = {}) {
  const snap = await getDocs(query(
    collection(firestore, "auditoria"),
    orderBy("createdAt", "desc"),
    limit(150)
  ));

  const text = String(buscar || "").trim().toLowerCase();
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => !fecha || item.fecha === fecha)
    .filter((item) => !tipo || item.tipo === tipo)
    .filter((item) => {
      if (!text) return true;
      return [item.usuario, item.rol, item.tipo, item.accion, item.detalle, JSON.stringify(item.datos || {})]
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
}
