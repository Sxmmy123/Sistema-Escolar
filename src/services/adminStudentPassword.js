import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "../firebase/client.js";

export function generateTemporaryStudentPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function callReset(payload, token) {
  if (import.meta.env?.DEV) {
    const response = await fetch("/api/admin/alumnos/restablecer-clave", { method: "POST", headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo restablecer la clave.");
    return result;
  }
  return (await httpsCallable(getFunctions(app, "us-central1"), "restablecerClaveAlumno", { timeout: 30000 })(payload)).data;
}

export async function resetStudentPasswordAsAdmin({ student, temporaryPassword, adminPassword }, { authClient = auth, reauthenticate = reauthenticateWithCredential, call = callReset, isCurrent = () => true } = {}) {
  if (!student?.id || !student.authUid) throw new Error("Este alumno aun no tiene acceso creado.");
  if (typeof temporaryPassword !== "string" || temporaryPassword.length < 6 || temporaryPassword.length > 128) throw new Error("La clave temporal debe tener entre 6 y 128 caracteres.");
  if (!adminPassword) throw new Error("Confirma tu contrasena de administrador.");
  const user = authClient.currentUser;
  if (!user?.email || !isCurrent()) throw new Error("La sesion cambio. Vuelve a ingresar.");
  await reauthenticate(user, EmailAuthProvider.credential(user.email, adminPassword));
  if (authClient.currentUser?.uid !== user.uid || !isCurrent()) throw new Error("La sesion cambio. No se envio el restablecimiento.");
  const token = await user.getIdToken(true);
  if (authClient.currentUser?.uid !== user.uid || !isCurrent()) throw new Error("La sesion cambio. No se envio el restablecimiento.");
  const payload = { alumnoId: student.id, expectedUid: student.authUid, temporaryPassword };
  try {
    const result = await call(payload, token);
    if (result?.uid !== student.authUid || result.alumnoId !== student.id) throw new Error("No se pudo confirmar a que alumno se aplico el cambio. Actualiza la lista.");
    return result;
  } catch (error) {
    if (error.code === "functions/not-found") throw new Error("Falta publicar la funcion protegida de restablecimiento en Firebase.");
    throw error;
  }
}
