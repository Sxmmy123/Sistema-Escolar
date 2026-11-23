import { SchoolAccessError } from "./access-core.js";
import { validateInitialPassword } from "./password-policy.js";
import { withPasswordOperation } from "./password-operation.js";

export async function resetPasswordWithCode(input, { db, auth, verifyReset, confirmReset, takeLimit }) {
  if (!input || input.accion !== "restablecer" || Object.keys(input).some(key => !["accion", "code", "password"].includes(key)) ||
      typeof input.code !== "string" || !input.code || input.code.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(input.code)) {
    throw new SchoolAccessError("invalid-argument", "El enlace no es valido.");
  }
  try { validateInitialPassword(input.password); }
  catch (error) { throw new SchoolAccessError("invalid-argument", error.message.replaceAll("temporal", "nueva")); }
  await takeLimit(input.code, "restablecer");
  const action = await verifyReset(input.code);
  if (action?.requestType !== "PASSWORD_RESET" || typeof action.email !== "string" || !action.email) {
    throw new SchoolAccessError("not-found", "El enlace no es valido, vencio o ya fue utilizado.");
  }
  let user;
  try { user = await auth.getUserByEmail(action.email); }
  catch (error) {
    if (error.code === "auth/user-not-found") throw new SchoolAccessError("not-found", "El enlace ya no esta disponible.");
    throw new SchoolAccessError("unavailable", "No se pudo comprobar la cuenta. Intenta nuevamente.");
  }
  if (user.disabled) throw new SchoolAccessError("not-found", "El enlace ya no esta disponible.");
  const ref = db.doc(`usuarios/${user.uid}`);
  return withPasswordOperation(db, user.uid, async () => {
    const profile = (await ref.get()).data(), version = profile?.passwordChangeVersion || "";
    try { validateInitialPassword(input.password, profile?.usuario); }
    catch (error) { throw new SchoolAccessError("invalid-argument", error.message.replaceAll("temporal", "nueva")); }
    // Firebase valida y consume el codigo; el bloqueo evita pisar un reset administrativo.
    await confirmReset(input.code, input.password);
    if (profile) {
      try {
        await db.runTransaction(async tx => {
          const latest = (await tx.get(ref)).data();
          if (!latest || (latest.passwordChangeVersion || "") !== version) throw new Error("changed");
          if (latest.passwordChangeRequired === true) tx.update(ref, { passwordChangeRequired: false });
        });
      } catch {
        throw new SchoolAccessError("aborted", "La contrasena cambio, pero no se completo la confirmacion del perfil.");
      }
    }
    return { ok: true };
  }).catch(error => {
    if (error.code === "password-operation-busy") throw new SchoolAccessError("resource-exhausted", error.message);
    throw error;
  });
}
