import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";

const roleCollections = {
  docente: "docentes",
  director: "director",
  admin: "admins"
};

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
  const role = String(profile.rol || sessionStorage.getItem("sesionRol") || "").toLowerCase();
  const username = String(profile.usuario || sessionStorage.getItem("sesionUsuario") || "").trim();
  const payload = {
    authEmail: email,
    correoRecuperacion: email,
    updatedAt: serverTimestamp()
  };

  await setDoc(doc(firestore, "usuarios", uid), payload, { merge: true });

  const roleCollection = roleCollections[role];
  if (roleCollection) {
    await setDoc(doc(firestore, roleCollection, uid), payload, { merge: true });
  }

  if (username && !username.includes("@")) {
    await setDoc(doc(firestore, "usuarios_por_nombre", username.toLowerCase()), {
      authEmail: email,
      correoRecuperacion: email,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
}

export async function setRecoveryEmail({ email, currentPassword }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Escribe un correo valido.");

  const user = await reauth(currentPassword);
  const profile = await currentProfile(user.uid);
  await updateEmail(user, cleanEmail);
  await updateProfileEmail(user.uid, profile, cleanEmail);
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
