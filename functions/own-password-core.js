import { validateInitialPassword } from "./password-policy.js";
import { SchoolAccessError } from "./access-core.js";
import { withPasswordOperation } from "./password-operation.js";

export async function changeTemporaryPassword(request, { db, auth, verifyPassword, takeLimit }) {
  const uid = request.auth?.uid, input = request.data;
  if (!uid) throw new SchoolAccessError("unauthenticated", "Inicia sesion para cambiar tu clave.");
  if (!input || Object.keys(input).some(key => !["currentPassword", "newPassword"].includes(key)) || typeof input.currentPassword !== "string" || !input.currentPassword || input.currentPassword.length > 128) throw new SchoolAccessError("invalid-argument", "Escribe tu clave actual y una nueva.");
  const ref = db.doc(`usuarios/${uid}`), profile = (await ref.get()).data();
  const version = profile?.passwordChangeVersion || "";
  if (!profile || profile.activo === false || profile.passwordChangeRequired !== true) throw new SchoolAccessError("failed-precondition", "No hay un cambio temporal pendiente para esta cuenta.");
  try { validateInitialPassword(input.newPassword, profile.usuario); }
  catch (error) { throw new SchoolAccessError("invalid-argument", error.message.replaceAll("temporal", "nueva")); }
  if (input.newPassword === input.currentPassword) throw new SchoolAccessError("invalid-argument", "Elige una clave diferente de la temporal.");
  await takeLimit(uid, "cambiar");
  const user = await auth.getUser(uid);
  if (user.disabled || !user.email) throw new SchoolAccessError("permission-denied", "La cuenta no esta habilitada.");
  return withPasswordOperation(db, uid, async () => {
    const verified = await verifyPassword(user.email, input.currentPassword);
    if (verified.uid !== uid) throw new SchoolAccessError("unauthenticated", "La clave actual no es correcta.");
    // Si coincide con un restablecimiento nuevo, no se quita su marca pendiente.
    if (((await ref.get()).data()?.passwordChangeVersion || "") !== version) throw new SchoolAccessError("failed-precondition", "Administracion actualizo tu acceso. Vuelve a ingresar.");
    try { await auth.updateUser(uid, { password: input.newPassword }); }
    catch { throw new SchoolAccessError("unavailable", "No se pudo cambiar la clave. Intenta nuevamente."); }
    try {
      await db.runTransaction(async tx => {
        const latest = (await tx.get(ref)).data();
        if (!latest || (latest.passwordChangeVersion || "") !== version) throw new Error("changed");
        tx.update(ref, { passwordChangeRequired: false });
      });
    } catch { throw new SchoolAccessError("unavailable", "La clave cambio, pero no se completo la confirmacion. Vuelve a ingresar con tu nueva clave para completar el proceso."); }
    return { ok: true };
  }).catch(error => {
    if (error.code === "password-operation-busy") throw new SchoolAccessError("failed-precondition", error.message);
    throw error;
  });
}
