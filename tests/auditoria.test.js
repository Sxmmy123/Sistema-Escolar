import assert from "node:assert/strict";
import test from "node:test";
import { logAudit } from "../src/services/auditData.js";
import { ADMIN_USER } from "../src/firebase/config.js";
const payload = { tipo: "asistencia", accion: "registrar", detalle: "Movimiento", usuarioUid: "otro", rol: "admin" };
function fixture(profile = { rol: "docente", activo: true }) {
  const writes = [], auth = { currentUser: { uid: "docente-real", email: "docente@example.test" } };
  return { writes, auth, read: async () => ({ data: () => profile }), write: async (_ref, value) => { writes.push(value); } };
}
test("auditoria ignora roles y nombres manipulados en el navegador y en la solicitud", async () => {
  const clients = fixture();
  globalThis.sessionStorage = { getItem: () => "admin-falso" };
  try {
    await logAudit(payload, clients);
    assert.equal(clients.writes[0].usuarioUid, "docente-real");
    assert.equal(clients.writes[0].usuario, "docente@example.test");
    assert.equal(clients.writes[0].rol, "docente");
    assert.equal(clients.writes[0].origen, "cliente");
  } finally { delete globalThis.sessionStorage; }
});
test("auditoria rechaza perfiles inexistentes, inactivos, desconocidos y sesion cerrada", async () => {
  for (const profile of [undefined, { rol: "docente", activo: false }, { rol: "otro", activo: true }]) {
    const clients = fixture(null); clients.read = async () => ({ data: () => profile });
    await assert.rejects(logAudit(payload, clients), /perfil activo/);
    assert.equal(clients.writes.length, 0);
  }
  const clients = fixture(); clients.auth.currentUser = null;
  await assert.rejects(logAudit(payload, clients), /sesion autenticada/);
  assert.equal(clients.writes.length, 0);
});
test("una respuesta de perfil tardia no atribuye el movimiento a otra sesion", async () => {
  const clients = fixture();
  clients.read = async () => { clients.auth.currentUser = { uid: "otra-sesion" }; return { data: () => ({ rol: "docente", activo: true }) }; };
  await assert.rejects(logAudit(payload, clients), /sesion cambio/);
  assert.equal(clients.writes.length, 0);
});
test("el administrador principal conserva el acceso de arranque sin inventar un perfil", async () => {
  const clients = fixture(); clients.auth.currentUser = { uid: ADMIN_USER.uid, email: ADMIN_USER.email };
  clients.read = () => assert.fail("No requiere perfil para el administrador principal");
  await logAudit(payload, clients);
  assert.equal(clients.writes[0].rol, "admin");
  assert.equal(clients.writes[0].usuarioUid, ADMIN_USER.uid);
});
