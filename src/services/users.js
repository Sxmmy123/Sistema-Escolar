import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { deleteUser } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { USERNAME_EMAIL_DOMAIN } from "../firebase/config.js";
import { auth, creatorAuth, firestore } from "../firebase/client.js";

import { documentoGestion } from "./rutasFirestore.js";
const ROLES = new Set(["docente", "director", "admin"]);

export function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function usernameToAuthEmail(username) {
  const key = normalizeUsername(username);
  return `${key}@${USERNAME_EMAIL_DOMAIN}`;
}

export async function authEmailForLogin(login) {
  const value = String(login || "").trim();
  if (value.includes("@")) return value.toLowerCase();

  const key = normalizeUsername(value);
  if (!key) return usernameToAuthEmail(value);

  try {
    const snap = await getDoc(doc(firestore, "indice_accesos", key));
    if (snap.exists()) {
      const data = snap.data() || {};
      if (data.authEmail) return String(data.authEmail).toLowerCase();
    }
  } catch {
    // Si las reglas todavia no permiten leer el mapa, se conserva el correo interno.
  }

  return usernameToAuthEmail(value);
}

export function formatUsername(username) {
  return String(username || "").trim().replace(/\s+/g, "");
}

export async function createSystemUser({ nombre, username, emailRecuperacion, password, rol, asignaciones = {} }, clients = { auth, creatorAuth, firestore }) {
  const adminUid = clients.auth.currentUser?.uid;
  if (!adminUid) throw new Error("Ingresa como administrador.");
  const cleanName = String(nombre || "").trim();
  const publicUsername = formatUsername(username);
  const usernameKey = normalizeUsername(username);
  const recoveryEmail = String(emailRecuperacion || "").trim().toLowerCase();
  const cleanPassword = String(password || "");
  const cleanRole = String(rol || "").trim().toLowerCase();

  if (!cleanName) throw new Error("Falta el nombre del usuario.");
  if (!publicUsername) throw new Error("Falta el usuario asignado.");
  if (!/^[a-z0-9._-]+$/i.test(publicUsername)) throw new Error("El usuario solo puede tener letras, numeros, punto, guion o guion bajo.");
  if (cleanPassword.length < 6) throw new Error("La contrasena debe tener al menos 6 caracteres.");
  if (!ROLES.has(cleanRole)) throw new Error("Rol no valido.");

  const usernameRef = doc(clients.firestore, "indice_accesos", usernameKey);
  const usernameSnap = await getDoc(usernameRef);
  if (usernameSnap.exists()) {
    throw new Error("Ese usuario ya existe. Usa otro nombre de usuario.");
  }

  const authEmail = usernameToAuthEmail(publicUsername);
  const credential = await createUserWithEmailAndPassword(clients.creatorAuth, authEmail, cleanPassword);
  const uid = credential.user.uid;

  const baseProfile = {
    nombre: cleanName,
    usuario: publicUsername,
    authEmail,
    correoRecuperacion: recoveryEmail || null,
    rol: cleanRole,
    activo: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: adminUid
  };

  try {
    await runTransaction(clients.firestore, async (transaction) => {
      if ((await transaction.get(usernameRef)).exists()) throw new Error("Ese usuario ya existe.");
      if (clients.auth.currentUser?.uid !== adminUid) throw new Error("La sesion cambio antes de guardar la cuenta.");
      transaction.set(doc(clients.firestore, "usuarios", uid), baseProfile);
      transaction.set(usernameRef, { uid, authEmail });
      if (cleanRole === "docente") transaction.set(documentoGestion(clients.firestore, "asignaciones", uid), {
        cursos: asignaciones, updatedAt: serverTimestamp()
      });
    });
    return { id: uid, ...baseProfile };
  } catch (error) {
    try { await deleteUser(credential.user); }
    catch { throw new Error("No se guardo el perfil y no se pudo revertir Authentication. Revisa esa cuenta antes de reintentar."); }
    throw error;
  } finally {
    await signOut(clients.creatorAuth).catch(() => {});
  }
}

export async function listUsersByRole(rol) {
  const cleanRole = String(rol || "").trim().toLowerCase();
  if (!ROLES.has(cleanRole)) return [];

  const snap = await getDocs(query(collection(firestore, "usuarios"), where("rol", "==", cleanRole)));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")));
}
