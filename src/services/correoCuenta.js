import { USERNAME_EMAIL_DOMAIN } from "../firebase/config.js";

export function esCorreoInterno(value) {
  return String(value || "").trim().toLowerCase().split("@").at(-1) === USERNAME_EMAIL_DOMAIN;
}

export function normalizarCorreoReal(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) throw new Error("El correo electronico es obligatorio.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Escribe un correo electronico valido.");
  if (esCorreoInterno(email)) throw new Error("Usa un correo real al que la persona tenga acceso, no un correo interno del sistema.");
  return email;
}
