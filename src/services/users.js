import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { USERNAME_EMAIL_DOMAIN } from "../firebase/config.js";
import { auth, creatorAuth, firestore } from "../firebase/client.js";

const roleCollections = {
  docente: "docentes",
  director: "director",
  admin: "admins"
};

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
    const snap = await getDoc(doc(firestore, "usuarios_por_nombre", key));
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

export async function createSystemUser({ nombre, username, emailRecuperacion, password, rol }) {
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
  if (!roleCollections[cleanRole]) throw new Error("Rol no valido.");

  const usernameRef = doc(firestore, "usuarios_por_nombre", usernameKey);
  const usernameSnap = await getDoc(usernameRef);
  if (usernameSnap.exists()) {
    throw new Error("Ese usuario ya existe. Usa otro nombre de usuario.");
  }

  const authEmail = usernameToAuthEmail(publicUsername);
  const credential = await createUserWithEmailAndPassword(creatorAuth, authEmail, cleanPassword);
  const uid = credential.user.uid;

  await signOut(creatorAuth).catch(() => {});

  const baseProfile = {
    nombre: cleanName,
    usuario: publicUsername,
    authEmail,
    correoRecuperacion: recoveryEmail || null,
    rol: cleanRole,
    activo: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid || null
  };

  await setDoc(doc(firestore, "usuarios", uid), baseProfile);
  await setDoc(doc(firestore, roleCollections[cleanRole], uid), baseProfile);
  await setDoc(usernameRef, {
    uid,
    usuario: publicUsername,
    authEmail,
    rol: cleanRole,
    activo: true,
    createdAt: serverTimestamp()
  });

  return { id: uid, ...baseProfile };
}

export async function listUsersByRole(rol) {
  const cleanRole = String(rol || "").trim().toLowerCase();
  const collectionName = roleCollections[cleanRole];
  if (!collectionName) return [];

  const snap = await getDocs(collection(firestore, collectionName));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")));
}
