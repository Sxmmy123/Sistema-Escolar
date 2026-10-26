import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";

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

export async function confirmarRestablecimiento({ auth, code, password, confirmation }, confirmar = confirmPasswordReset) {
  if (!code) throw invalidLink();
  const value = String(password || "");
  if (value.length < 6) {
    const error = new Error("La contrasena debe tener al menos 6 caracteres.");
    error.code = "restablecimiento/contrasena-corta";
    throw error;
  }
  if (value !== String(confirmation || "")) {
    const error = new Error("Las contrasenas no coinciden.");
    error.code = "restablecimiento/confirmacion-distinta";
    throw error;
  }
  await confirmar(auth, code, value);
}

export function errorRestablecimiento(error) {
  const code = String(error?.code || "");
  if (["auth/expired-action-code", "auth/invalid-action-code", "auth/user-disabled", "auth/user-not-found", "restablecimiento/enlace-invalido"].includes(code)) {
    return { terminal: true, title: "Enlace no disponible", message: "Este enlace no es valido, vencio o ya fue utilizado. Solicita uno nuevo desde Olvide mi contrasena en el ingreso." };
  }
  if (["auth/weak-password", "auth/password-does-not-meet-requirements"].includes(code)) {
    return { field: true, message: "La contrasena no cumple los requisitos de seguridad de la cuenta. Usa una clave mas larga con letras, numeros y simbolos." };
  }
  if (code.startsWith("restablecimiento/contrasena-") || code === "restablecimiento/confirmacion-distinta") return { field: true, message: error.message };
  if (code === "auth/network-request-failed") return { title: "Revisa tu conexion", message: "No se pudo confirmar la operacion. Revisa internet y vuelve a intentar." };
  if (code === "auth/too-many-requests") return { title: "Espera un momento", message: "Hay demasiados intentos. Espera antes de volver a intentar." };
  return { title: "No se pudo completar", message: "No se pudo confirmar la operacion. Vuelve a intentar en un momento." };
}
