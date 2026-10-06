import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";

function currentUser() {
  const user = auth.currentUser;
  if (!user) throw new Error("No hay usuario autenticado.");
  return user;
}

async function currentProfile(uid) {
  const snap = await getDoc(doc(firestore, "usuarios", uid));
  return snap.exists() ? snap.data() : {};
}

async function reauth(currentPassword) {
  const user = currentUser();
  const email = user.email;
  if (!email) throw new Error("La cuenta no tiene correo de autenticacion.");
  const credential = EmailAuthProvider.credential(email, String(currentPassword || ""));
  await reauthenticateWithCredential(user, credential);
  return user;
}

async function updateProfileEmail(uid, profile, email) {
  const username = String(profile.usuario || "").trim();
  if (!profile.rol) throw new Error("Primero prepara la gestion desde el panel del administrador.");
  const payload = {
    authEmail: email,
    correoRecuperacion: email,
    updatedAt: serverTimestamp()
  };

  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "usuarios", uid), payload);
  if (username && !username.includes("@")) {
    batch.update(doc(firestore, "indice_accesos", username.toLowerCase()), { authEmail: email });
  }
  await batch.commit();
}

export async function setRecoveryEmail({ email, currentPassword }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Escribe un correo valido.");

  const user = await reauth(currentPassword);
  const profile = await currentProfile(user.uid);
  if (!profile.rol) throw new Error("Primero prepara la gestion desde el panel del administrador.");
  const previousEmail = user.email;
  await updateEmail(user, cleanEmail);
  try {
    await updateProfileEmail(user.uid, profile, cleanEmail);
  } catch (error) {
    try { await updateEmail(user, previousEmail); }
    catch { throw new Error("El correo cambio en Authentication pero no en el perfil. Administracion debe corregir el indice de acceso."); }
    throw error;
  }
  sessionStorage.setItem("sesionUsuario", cleanEmail);
  return cleanEmail;
}

export async function changeOwnPassword({ currentPassword, newPassword, confirmPassword }) {
  const cleanNew = String(newPassword || "");
  if (cleanNew.length < 6) throw new Error("La nueva contrasena debe tener al menos 6 caracteres.");
  if (cleanNew !== String(confirmPassword || "")) throw new Error("La confirmacion no coincide.");

  const user = await reauth(currentPassword);
  await updatePassword(user, cleanNew);
  return true;
}
