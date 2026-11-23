import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";
import { validateInitialPassword } from "../../functions/password-policy.js";
import { cambiarClaveTemporal } from "./claveTemporal.js";

function currentUser(authClient = auth) {
  const user = authClient.currentUser;
  if (!user) throw new Error("No hay usuario autenticado.");
  return user;
}

async function currentProfile(uid) {
  const snap = await getDoc(doc(firestore, "usuarios", uid));
  return snap.exists() ? snap.data() : {};
}

async function reauth(currentPassword, { authClient = auth, reauthenticate = reauthenticateWithCredential } = {}) {
  const user = currentUser(authClient);
  const email = user.email;
  if (!email) throw new Error("La cuenta no tiene correo de autenticacion.");
  const credential = EmailAuthProvider.credential(email, String(currentPassword || ""));
  if (!String(currentPassword || "")) throw new Error("Escribe tu contrasena actual.");
  await reauthenticate(user, credential);
  if (authClient.currentUser?.uid !== user.uid) throw new Error("La sesion cambio. Vuelve a ingresar antes de cambiar tu cuenta.");
  return user;
}

export async function changeOwnPassword({ currentPassword, newPassword, confirmPassword }, { authClient = auth, reauthenticate = reauthenticateWithCredential, update = updatePassword, readProfile = currentProfile, changeTemporary = cambiarClaveTemporal } = {}) {
  const cleanNew = String(newPassword || "");
  try { validateInitialPassword(cleanNew); } catch (error) { throw new Error(error.message.replaceAll("temporal", "nueva")); }
  if (cleanNew !== String(confirmPassword || "")) throw new Error("La confirmacion no coincide.");
  if (cleanNew === currentPassword) throw new Error("Elige una clave diferente de la actual.");

  const user = await reauth(currentPassword, { authClient, reauthenticate });
  const profile = await readProfile(user.uid);
  if (authClient.currentUser?.uid !== user.uid) throw new Error("La sesion cambio.");
  if (profile.passwordChangeRequired === true) {
    await changeTemporary({ currentPassword, newPassword: cleanNew, confirmPassword }, { authClient });
    return { requiresRelogin: true };
  }
  await update(user, cleanNew);
  return true;
}
