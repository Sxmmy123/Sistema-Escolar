import { randomUUID } from "node:crypto";

export async function withPasswordOperation(db, uid, operation) {
  const ref = db.doc(`operaciones_clave/${uid}`), id = randomUUID(), now = Date.now();
  await db.runTransaction(async tx => {
    const previous = (await tx.get(ref)).data();
    if (previous?.expiresAt > now) throw Object.assign(new Error("Hay otro cambio de clave en curso. Espera dos minutos e intenta nuevamente."), { code: "password-operation-busy" });
    tx.set(ref, { id, expiresAt: now + 120000 });
  });
  try { return await operation(); }
  finally {
    try { await db.runTransaction(async tx => { if ((await tx.get(ref)).data()?.id === id) tx.delete(ref); }); }
    catch { /* El bloqueo vence aunque el proceso pierda conexion al finalizar. */ }
  }
}
