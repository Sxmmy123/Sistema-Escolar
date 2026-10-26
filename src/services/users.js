import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { deleteUser } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { USERNAME_EMAIL_DOMAIN } from "../firebase/config.js";
import { auth, creatorAuth, firestore } from "../firebase/client.js";

import { coleccionGestion, documentoGestion, gestionActual } from "./rutasFirestore.js";
import { validarAsignacionesDocente } from "./modalidadDocente.js";
import { normalizarCorreoReal } from "./correoCuenta.js";
import { planificarRelevo } from "./relevoDocente.js";
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

export async function authEmailForLogin(login, options = {}) {
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
  } catch (error) {
    if (options.strict) throw error;
    // Si las reglas todavia no permiten leer el mapa, se conserva el correo interno.
  }

  return usernameToAuthEmail(value);
}

export function formatUsername(username) {
  return String(username || "").trim().replace(/\s+/g, "");
}

export async function createSystemUser({ nombre, username, emailRecuperacion, password, rol, asignaciones = {}, reemplazo = null }, clients = { auth, creatorAuth, firestore }) {
  const adminUid = clients.auth.currentUser?.uid;
  if (!adminUid) throw new Error("Ingresa como administrador.");
  const cleanName = String(nombre || "").trim();
  const publicUsername = formatUsername(username);
  const usernameKey = normalizeUsername(username);
  const cleanPassword = String(password || "");
  const cleanRole = String(rol || "").trim().toLowerCase();

  if (!cleanName) throw new Error("Falta el nombre del usuario.");
  if (!publicUsername) throw new Error("Falta el usuario asignado.");
  if (!/^[a-z0-9._-]+$/i.test(publicUsername)) throw new Error("El usuario solo puede tener letras, numeros, punto, guion o guion bajo.");
  if (cleanPassword.length < 6) throw new Error("La contrasena debe tener al menos 6 caracteres.");
  if (!ROLES.has(cleanRole)) throw new Error("Rol no valido.");
  const recoveryEmail = normalizarCorreoReal(emailRecuperacion);
  const year = gestionActual();
  const sourceUid = String(reemplazo?.docenteUid || "").trim();
  let replacementPlan = null;
  if (reemplazo) {
    if (cleanRole !== "docente" || !sourceUid || sourceUid === adminUid) throw new Error("Selecciona el docente que sera reemplazado.");
    const [sourceProfile, sourceAssignment] = await Promise.all([
      getDoc(doc(clients.firestore, "usuarios", sourceUid)),
      getDoc(documentoGestion(clients.firestore, "asignaciones", sourceUid, year))
    ]);
    if (sourceProfile.data()?.rol !== "docente" || !sourceAssignment.exists()) throw new Error("El docente no tiene una asignacion en esta gestion.");
    replacementPlan = planificarRelevo(sourceAssignment.data(), reemplazo.trimestreInicio);
    asignaciones = replacementPlan.cursos;
  }
  const modality = cleanRole === "docente" ? validarAsignacionesDocente(asignaciones) : {};

  const usernameRef = doc(clients.firestore, "indice_accesos", usernameKey);
  const usernameSnap = await getDoc(usernameRef);
  if (usernameSnap.exists()) {
    throw new Error("Ese usuario ya existe. Usa otro nombre de usuario.");
  }

  const authEmail = recoveryEmail;
  let credential;
  try {
    credential = await createUserWithEmailAndPassword(clients.creatorAuth, authEmail, cleanPassword);
  } catch (error) {
    if (error.code === "auth/email-already-in-use") throw new Error("Ese correo ya pertenece a otra cuenta. Usa un correo distinto para esta persona.");
    throw error;
  }
  const uid = credential.user.uid;

  const baseProfile = {
    nombre: cleanName,
    usuario: publicUsername,
    authEmail,
    correoRecuperacion: recoveryEmail,
    rol: cleanRole,
    ...modality,
    activo: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: adminUid
  };

  try {
    await runTransaction(clients.firestore, async (transaction) => {
      if ((await transaction.get(usernameRef)).exists()) throw new Error("Ese usuario ya existe.");
      let plan = null;
      if (replacementPlan) {
        const sourceProfile = await transaction.get(doc(clients.firestore, "usuarios", sourceUid));
        const sourceAssignment = await transaction.get(documentoGestion(clients.firestore, "asignaciones", sourceUid, year));
        if (sourceProfile.data()?.rol !== "docente") throw new Error("El docente anterior ya no esta disponible.");
        plan = planificarRelevo(sourceAssignment.data(), reemplazo.trimestreInicio);
        if (JSON.stringify(plan) !== JSON.stringify(replacementPlan)) throw new Error("La asignacion cambio. Revisa de nuevo el reemplazo.");
      }
      if (clients.auth.currentUser?.uid !== adminUid || gestionActual() !== year) throw new Error("La sesion cambio o se selecciono otra gestion antes de guardar la cuenta.");
      transaction.set(doc(clients.firestore, "usuarios", uid), baseProfile);
      transaction.set(usernameRef, { uid, authEmail });
      if (cleanRole === "docente") transaction.set(documentoGestion(clients.firestore, "asignaciones", uid, year), {
        cursos: asignaciones, ...modality,
        ...(plan ? { trimestres: plan.siguientes, reemplazoDeUid: sourceUid, trimestreInicio: reemplazo.trimestreInicio } : {}),
        updatedAt: serverTimestamp()
      });
      if (plan) transaction.update(documentoGestion(clients.firestore, "asignaciones", sourceUid, year), {
        trimestres: plan.anteriores, reemplazadoPorUid: uid, updatedAt: serverTimestamp()
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

export async function setTeacherActive(uid, active, clients = { auth, firestore }) {
  const adminUid = clients.auth.currentUser?.uid;
  if (!adminUid || !uid || uid === adminUid || typeof active !== "boolean") throw new Error("Selecciona una cuenta docente valida.");
  await runTransaction(clients.firestore, async (transaction) => {
    const ref = doc(clients.firestore, "usuarios", uid);
    const snapshot = await transaction.get(ref);
    if (snapshot.data()?.rol !== "docente") throw new Error("La cuenta no es de un docente.");
    if (clients.auth.currentUser?.uid !== adminUid) throw new Error("La sesion cambio.");
    transaction.update(ref, { activo: active, updatedAt: serverTimestamp() });
  });
}

export async function listUsersByRole(rol) {
  const cleanRole = String(rol || "").trim().toLowerCase();
  if (!ROLES.has(cleanRole)) return [];

  const snap = await getDocs(query(collection(firestore, "usuarios"), where("rol", "==", cleanRole)));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")));
}

export async function listTeachersWithAssignments() {
  const [users, assignments] = await Promise.all([
    listUsersByRole("docente"), getDocs(coleccionGestion(firestore, "asignaciones"))
  ]);
  const byUid = new Map(assignments.docs.map((item) => [item.id, item.data()]));
  return users.map((user) => ({ ...user, asignacion: byUid.get(user.id) || null }));
}
