import { validateInitialPassword } from "../../functions/password-policy.js";

export function normalizeStudentAccessKey(value) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

export function normalizeStudentSex(value) {
  const text = String(value || "").trim();
  const key = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (["m", "masculino", "hombre", "varon"].includes(key)) return "M";
  if (["f", "femenino", "mujer"].includes(key)) return "F";
  return text.toUpperCase();
}

export function studentIdFromProfile(profile = {}) {
  if (profile.rol !== "alumno" || profile.activo !== true || !profile.alumnoId) {
    throw new Error("El acceso del alumno no tiene un perfil activo y vinculado. Consulta con administracion.");
  }
  return String(profile.alumnoId);
}

export function generateStudentPassword(random = globalThis.crypto) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  if (!random?.getRandomValues) throw new Error("El navegador no permite generar contrasenas seguras.");
  const values = new Uint8Array(16);
  random.getRandomValues(values);
  return [...values].map((value) => alphabet[value % alphabet.length]).join("");
}

export function initialStudentPassword(ci, mode = "secure") {
  return mode === "manual" ? "" : generateStudentPassword();
}

export function studentPasswordForNewAccess(password = "", ci = "") {
  return password === "" ? generateStudentPassword() : validateInitialPassword(password, ci);
}
