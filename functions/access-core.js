import { createHash } from "node:crypto";
import { MAIN_ADMIN_UID } from "./student-password-core.js";
import { validateInitialPassword } from "./password-policy.js";
export class SchoolAccessError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const invalid = () => new SchoolAccessError("unauthenticated", "Usuario o contrasena incorrectos.");
const internalDomain = "usuarios.ue-nueva-bolivia.edu.bo";

export async function schoolAccess(input, { db, verifyPassword, sendReset, takeLimit }) {
  const login = String(input?.login || "").trim().toLowerCase();
  const action = input?.accion;
  if (!["ingresar", "recuperar"].includes(action) || !login || login.length > 254 || Object.keys(input).some((key) => !["accion", "login", "password"].includes(key))) throw new SchoolAccessError("invalid-argument", "Escribe un usuario o correo valido.");
  const isEmail = login.includes("@");
  const key = isEmail ? login : login.replace(/\s+/g, "");
  if (isEmail ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login) : key.length > 128 || !/^[a-z0-9._-]+$/.test(key)) throw new SchoolAccessError("invalid-argument", "Escribe un usuario o correo valido.");
  if (action === "ingresar" && (typeof input.password !== "string" || !input.password || input.password.length > 128)) throw invalid();
  await takeLimit(key, action);
  const index = isEmail ? null : (await db.doc(`indice_accesos/${key}`).get()).data();
  const email = isEmail ? login : index?.authEmail || `${key}@${internalDomain}`;
  if (action === "recuperar") {
    if (!email.endsWith(`@${internalDomain}`)) await sendReset(email);
    return { ok: true };
  }
  const verified = await verifyPassword(email, input.password);
  if (!verified?.uid || index?.uid && index.uid !== verified.uid) throw invalid();
  const profile = (await db.doc(`usuarios/${verified.uid}`).get()).data();
  if (verified.uid !== MAIN_ADMIN_UID && (profile?.activo !== true || !["admin", "director", "docente", "alumno"].includes(profile.rol))) throw invalid();
  if (profile?.rol === "alumno") {
    if (!profile.alumnoId || profile.alumnoId.includes("/")) throw invalid();
    const student = (await db.doc(`alumnos/${profile.alumnoId}`).get()).data();
    if (student?.authUid !== verified.uid || student.activo === false) throw invalid();
  }
  let weak = false;
  try { validateInitialPassword(input.password, profile?.usuario || key); } catch { weak = true; }
  if (weak && profile && profile.passwordChangeRequired !== true) {
    await db.doc(`usuarios/${verified.uid}`).update({ passwordChangeRequired: true });
  }
  // Solo una clave correcta permite resolver el correo; no se devuelve ningun token administrativo.
  return { email: verified.email || email };
}

export function createAccessLimiter(db, ip, { now = Date.now } = {}) {
  return async (login, action) => {
    const time = now(), window = 10 * 60 * 1000;
    const identities = [`ip:${action}:${ip || "sin-ip"}`, `usuario:${action}:${login}`];
    const refs = identities.map((value) => db.doc(`limites_acceso/${createHash("sha256").update(value).digest("hex")}`));
    await db.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const limits = ["recuperar", "restablecer"].includes(action) ? [30, 5] : [100, 10];
      const values = snapshots.map((snapshot) => {
        const old = snapshot.data() || {};
        return time >= old.inicio && time - old.inicio < window ? old : { inicio: time, cantidad: 0 };
      });
      if (values.some((value, index) => value.cantidad >= limits[index])) throw new SchoolAccessError("resource-exhausted", "Demasiados intentos. Espera diez minutos e intenta nuevamente.");
      refs.forEach((ref, index) => transaction.set(ref, { inicio: values[index].inicio, cantidad: values[index].cantidad + 1 }));
    });
  };
}

export function firebasePasswordGateway(apiKey, fetcher = fetch) {
  const post = async (method, body) => {
    let response;
    try { response = await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Firebase-Locale": "es" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }); }
    catch { throw new SchoolAccessError("unavailable", "No se pudo conectar con el servicio de acceso."); }
    const result = await response.json();
    if (!response.ok) {
      const code = result?.error?.message || "";
      if (code.includes("TOO_MANY")) throw new SchoolAccessError("resource-exhausted", "Demasiados intentos. Espera un momento.");
      if (method === "resetPassword") {
        if (["INVALID_OOB_CODE", "EXPIRED_OOB_CODE", "EMAIL_NOT_FOUND", "USER_DISABLED"].includes(code)) throw new SchoolAccessError("not-found", "El enlace no es valido, vencio o ya fue utilizado.");
        if (code.startsWith("WEAK_PASSWORD") || code.startsWith("PASSWORD_DOES_NOT_MEET_REQUIREMENTS")) throw new SchoolAccessError("invalid-argument", "La nueva contrasena no cumple los requisitos de seguridad.");
      }
      if (["EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS", "USER_DISABLED"].includes(code)) {
        if (method === "sendOobCode") return {};
        throw invalid();
      }
      throw new SchoolAccessError("unavailable", "El servicio de acceso no esta disponible. Intenta mas tarde.");
    }
    return result;
  };
  return {
    verifyPassword: async (email, password) => { const result = await post("signInWithPassword", { email, password, returnSecureToken: true }); return { uid: result.localId, email: result.email }; },
    sendReset: async (email) => { await post("sendOobCode", { requestType: "PASSWORD_RESET", email }); },
    verifyReset: async code => { const result = await post("resetPassword", { oobCode: code }); return { email: result.email, requestType: result.requestType }; },
    confirmReset: async (code, password) => { await post("resetPassword", { oobCode: code, newPassword: password }); }
  };
}
