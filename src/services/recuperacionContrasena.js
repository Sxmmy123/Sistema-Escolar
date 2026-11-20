import { solicitarAccesoEscolar } from "./accesoEscolar.js";
import { esCorreoInterno, normalizarCorreoReal } from "./correoCuenta.js";

export const MENSAJE_RECUPERACION = "Si la cuenta tiene un correo real asociado, recibiras un enlace para restablecer tu contrasena. Revisa tambien la carpeta de spam.";

export async function solicitarRecuperacion(login, dependencies) {
  const value = String(login || "").trim();
  if (!value) throw new Error("Escribe tu usuario o correo electronico.");
  if (value.includes("@")) {
    if (!esCorreoInterno(value)) normalizarCorreoReal(value);
  } else if (!/^[a-z0-9._-]+$/i.test(value)) {
    throw new Error("Escribe un usuario o correo valido.");
  }
  try {
    if (!dependencies) {
      await solicitarAccesoEscolar({ accion: "recuperar", login: value });
      return MENSAJE_RECUPERACION;
    }
    const email = await dependencies.resolver(value);
    // Internal aliases have no inbox. Keep the same public response to avoid exposing accounts.
    if (!esCorreoInterno(email)) {
      const target = normalizarCorreoReal(email);
      dependencies.auth.languageCode = "es";
      await dependencies.enviar(dependencies.auth, target);
    }
    return MENSAJE_RECUPERACION;
  } catch (error) {
    if (error.code === "auth/user-not-found") return MENSAJE_RECUPERACION;
    if (["auth/too-many-requests", "resource-exhausted", "functions/resource-exhausted"].includes(error.code)) throw new Error("Demasiados intentos. Espera un momento antes de volver a solicitar el enlace.");
    if (["auth/network-request-failed", "unavailable", "functions/unavailable"].includes(error.code)) throw new Error("No hay conexion. Revisa internet e intenta nuevamente.");
    throw new Error("No se pudo solicitar la recuperacion. Intenta nuevamente mas tarde.");
  }
}
