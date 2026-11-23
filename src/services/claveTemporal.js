import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "../firebase/client.js";
import { validateInitialPassword } from "../../functions/password-policy.js";

export async function cambiarClaveTemporal(input, { authClient = auth, call } = {}) {
  try { validateInitialPassword(input.newPassword); }
  catch (error) { throw new Error(error.message.replaceAll("temporal", "nueva")); }
  if (input.newPassword !== input.confirmPassword) throw new Error("La confirmacion no coincide.");
  if (!input.currentPassword || input.currentPassword === input.newPassword) throw new Error("Escribe la clave actual y elige una diferente.");
  const user = authClient.currentUser;
  if (!user) throw new Error("Vuelve a ingresar.");
  const payload = { currentPassword: input.currentPassword, newPassword: input.newPassword };
  let result;
  if (call) result = await call(payload);
  else if (import.meta.env?.DEV) {
    const response = await fetch("/api/cambiar-clave-temporal", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify(payload), cache: "no-store" });
    result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo completar el cambio.");
  } else result = (await httpsCallable(getFunctions(app, "us-central1"), "cambiarClaveTemporal")(payload)).data;
  if (authClient.currentUser?.uid !== user.uid) throw new Error("La sesion cambio.");
  if (result?.ok !== true) throw new Error("No se pudo confirmar el cambio.");
  return true;
}
