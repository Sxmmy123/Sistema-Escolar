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

export const STUDENT_INITIAL_PASSWORD = "123456";

export function generateStudentPin(random = globalThis.crypto) {
  if (!random?.getRandomValues) throw new Error("El navegador no permite generar contrasenas aleatorias.");
  const values = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / 1000000) * 1000000;
  do { random.getRandomValues(values); } while (values[0] >= limit);
  return String(values[0] % 1000000).padStart(6, "0");
}

export function initialStudentPassword(ci, mode = "ci") {
  if (mode === "random") return generateStudentPin();
  if (mode === "default") return STUDENT_INITIAL_PASSWORD;
  return String(ci || "").trim().replace(/\s+/g, "") || STUDENT_INITIAL_PASSWORD;
}

export function studentPasswordForNewAccess(password = "") {
  if (password === "") return STUDENT_INITIAL_PASSWORD;
  if (typeof password !== "string" || password.length < 6) {
    throw new Error("La contrasena temporal debe tener al menos 6 caracteres.");
  }
  return password;
}
