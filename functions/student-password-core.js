export const MAIN_ADMIN_UID = "6GJAf3WiBaVBXypSDDR1xKLalnq2";

export class StudentPasswordError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const fail = (code, message) => { throw new StudentPasswordError(code, message); };
const validId = (value) => typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\/\u0000-\u001f]/.test(value);

export async function resetStudentPassword(request, { db, auth, now = Date.now() }) {
  const actor = request.auth;
  if (!actor?.uid) fail("unauthenticated", "Inicia sesion como administrador.");
  const administrator = actor.uid === MAIN_ADMIN_UID ? null : (await db.doc(`usuarios/${actor.uid}`).get()).data();
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
  if (typeof input.temporaryPassword !== "string" || input.temporaryPassword.length < 6 || input.temporaryPassword.length > 128) {
    fail("invalid-argument", "La clave temporal debe tener entre 6 y 128 caracteres.");
  }
  const student = (await db.doc(`alumnos/${input.alumnoId}`).get()).data();
  if (!student?.authUid) fail("failed-precondition", "El alumno aun no tiene una cuenta de acceso.");
  if (student.authUid !== input.expectedUid) fail("failed-precondition", "El acceso del alumno cambio. Actualiza la lista antes de continuar.");
  const uid = student.authUid;
  const profile = (await db.doc(`usuarios/${uid}`).get()).data();
  if (uid === MAIN_ADMIN_UID || uid === actor.uid || profile?.rol !== "alumno" || profile.alumnoId !== input.alumnoId) {
    fail("permission-denied", "La cuenta no corresponde a este alumno. No se modifico ninguna clave.");
  }
  try {
    await auth.updateUser(uid, { password: input.temporaryPassword });
  } catch (error) {
    if (error.code === "auth/user-not-found") fail("failed-precondition", "La cuenta no existe en Authentication. Revisa su acceso.");
    if (["auth/invalid-password", "auth/password-does-not-meet-requirements"].includes(error.code)) fail("invalid-argument", "La clave temporal no cumple los requisitos de Firebase.");
    fail("unavailable", "No se pudo confirmar el restablecimiento. Revisa la conexion antes de reintentar.");
  }
  return { alumnoId: input.alumnoId, uid };
}
