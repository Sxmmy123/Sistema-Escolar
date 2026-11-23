import { verifyPasswordResetCode } from "firebase/auth";
import { validateInitialPassword } from "../../functions/password-policy.js";
import { solicitarAccesoEscolar } from "./accesoEscolar.js";

function invalidLink() {
  const error = new Error("El enlace no es valido.");
  error.code = "restablecimiento/enlace-invalido";
  return error;
}

export function leerAccionCorreo(href, expectedApiKey = "") {
  const url = new URL(href);
  const params = url.searchParams;
  const mode = params.get("mode") || "";
  const code = params.get("oobCode") || "";
  if (params.getAll("mode").length !== 1 || params.getAll("oobCode").length !== 1 ||
      !/^[a-zA-Z]{1,64}$/.test(mode) || !code || code.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(code) ||
      params.getAll("apiKey").length > 1 || (expectedApiKey && params.has("apiKey") && params.get("apiKey") !== expectedApiKey)) {
    throw invalidLink();
  }
  return { mode, code };
}

export function destinoAccionFirebase(action, config) {
  const url = new URL(`https://${config.authDomain}/__/auth/action`);
  url.searchParams.set("mode", action.mode);
  url.searchParams.set("oobCode", action.code);
  url.searchParams.set("apiKey", config.apiKey);
  url.searchParams.set("lang", "es");
  return url.href;
}

export function ocultarCorreo(email) {
  const [name, domain] = String(email || "").split("@");
  return name && domain ? `${name.slice(0, 2)}***@${domain}` : "Tu cuenta";
}

export async function verificarEnlaceRestablecimiento(auth, code, verificar = verifyPasswordResetCode) {
  if (!code) throw invalidLink();
  return verificar(auth, code);
}

async function confirmarEnServidor(auth, code, password) {
  const result = await solicitarAccesoEscolar({ accion: "restablecer", code, password }, { firebaseApp: auth.app });
  if (result?.ok !== true) throw new Error("No se pudo confirmar el restablecimiento.");
  return result;
}

export async function confirmarRestablecimiento({ auth, code, password, confirmation }, confirmar = confirmarEnServidor) {
  if (!code) throw invalidLink();
  const value = String(password || "");
  try { validateInitialPassword(value); }
  catch (issue) {
    const error = new Error(issue.message.replaceAll("temporal", "nueva"));
    error.code = "restablecimiento/contrasena-invalida";
    throw error;
  }
  if (value !== String(confirmation || "")) {
    const error = new Error("Las contrasenas no coinciden.");
    error.code = "restablecimiento/confirmacion-distinta";
    throw error;
  }
  return confirmar(auth, code, value);
}

export function errorRestablecimiento(error) {
  const code = String(error?.code || "").replace(/^functions\//, "");
  if (["auth/expired-action-code", "auth/invalid-action-code", "auth/user-disabled", "auth/user-not-found", "not-found", "restablecimiento/enlace-invalido"].includes(code)) {
    return { terminal: true, title: "Enlace no disponible", message: "Este enlace no es valido, vencio o ya fue utilizado. Solicita uno nuevo desde Olvide mi contrasena en el ingreso." };
  }
  if (code === "aborted") return { terminal: true, title: "Contrasena actualizada", message: "Tu nueva clave ya fue guardada, pero falta confirmar el perfil. Ingresa con ella y, si vuelve a pedir un cambio, solicita ayuda a administracion. No vuelvas a usar este enlace." };
  if (["auth/weak-password", "auth/password-does-not-meet-requirements", "invalid-argument"].includes(code)) {
    return { field: true, message: "La contrasena no cumple los requisitos de seguridad de la cuenta. Usa una clave mas larga con letras, numeros y simbolos." };
  }
  if (code.startsWith("restablecimiento/contrasena-") || code === "restablecimiento/confirmacion-distinta") return { field: true, message: error.message };
  if (["auth/network-request-failed", "unavailable"].includes(code)) return { title: "Revisa tu conexion", message: "No se pudo confirmar la operacion. Revisa internet y vuelve a intentar." };
  if (["auth/too-many-requests", "resource-exhausted"].includes(code)) return { title: "Espera un momento", message: "Hay demasiados intentos o un cambio de clave en curso. Espera antes de volver a intentar." };
  return { title: "No se pudo completar", message: "No se pudo confirmar la operacion. Vuelve a intentar en un momento." };
}
