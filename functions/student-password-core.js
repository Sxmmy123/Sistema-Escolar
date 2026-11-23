import { validateInitialPassword, passwordChangeBlocksAccess } from "./password-policy.js";
import { randomUUID } from "node:crypto";
import { withPasswordOperation } from "./password-operation.js";

export const MAIN_ADMIN_UID = "6GJAf3WiBaVBXypSDDR1xKLalnq2";

export class StudentPasswordError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const fail = (code, message) => { throw new StudentPasswordError(code, message); };
const validId = (value) => typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\/\u0000-\u001f]/.test(value);

export async function resetStudentPassword(request, { db, auth, now = Date.now() }) {
  const actor = request.auth;
  if (!actor?.uid) fail("unauthenticated", "Inicia sesion como administrador.");
  const administrator = (await db.doc(`usuarios/${actor.uid}`).get()).data();
  if (administrator?.passwordChangeRequired === true && passwordChangeBlocksAccess(administrator, (await db.doc("configuracion/sistema").get()).data())) fail("permission-denied", "Cambia primero tu contrasena temporal.");
  if (actor.uid !== MAIN_ADMIN_UID && (administrator?.rol !== "admin" || administrator.activo !== true)) {
    fail("permission-denied", "Solo administracion puede restablecer contrasenas de alumnos.");
  }
  const authenticatedAt = Number(actor.token?.auth_time);
  if (!Number.isFinite(authenticatedAt) || now / 1000 - authenticatedAt > 300 || authenticatedAt > now / 1000 + 60) {
    fail("failed-precondition", "Confirma tu contrasena de administrador e intenta nuevamente.");
  }
  const input = request.data;
  if (!input || !validId(input.alumnoId) || !validId(input.expectedUid) || Object.keys(input).some((key) => !["alumnoId", "expectedUid", "temporaryPassword"].includes(key))) {
    fail("invalid-argument", "Selecciona un alumno con acceso creado.");
  }
  try { validateInitialPassword(input.temporaryPassword); }
  catch (error) { fail("invalid-argument", error.message); }
  const student = (await db.doc(`alumnos/${input.alumnoId}`).get()).data();
  try { validateInitialPassword(input.temporaryPassword, student?.ci || student?.usuario); }
  catch (error) { fail("invalid-argument", error.message); }
  if (!student?.authUid) fail("failed-precondition", "El alumno aun no tiene una cuenta de acceso.");
  if (student.authUid !== input.expectedUid) fail("failed-precondition", "El acceso del alumno cambio. Actualiza la lista antes de continuar.");
  const uid = student.authUid;
  const profile = (await db.doc(`usuarios/${uid}`).get()).data();
  if (uid === MAIN_ADMIN_UID || uid === actor.uid || profile?.rol !== "alumno" || profile.alumnoId !== input.alumnoId) {
    fail("permission-denied", "La cuenta no corresponde a este alumno. No se modifico ninguna clave.");
  }
  try {
    await withPasswordOperation(db, uid, async () => {
      await db.doc(`usuarios/${uid}`).update({ passwordChangeRequired: true, passwordChangeVersion: randomUUID() });
      await auth.updateUser(uid, { password: input.temporaryPassword });
    });
  } catch (error) {
    if (error.code === "password-operation-busy") fail("failed-precondition", error.message);
    if (error.code === "auth/user-not-found") fail("failed-precondition", "La cuenta no existe en Authentication. Revisa su acceso.");
    if (["auth/invalid-password", "auth/password-does-not-meet-requirements"].includes(error.code)) fail("invalid-argument", "La clave temporal no cumple los requisitos de Firebase.");
    fail("unavailable", "No se pudo confirmar el restablecimiento. Revisa la conexion antes de reintentar.");
  }
  return { alumnoId: input.alumnoId, uid };
}
