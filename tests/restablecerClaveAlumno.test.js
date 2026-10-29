import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { MAIN_ADMIN_UID, resetStudentPassword } from "../functions/student-password-core.js";
import { adminDevPlugin } from "../functions/dev-admin.js";
import { resetStudentPasswordAsAdmin, generateTemporaryStudentPassword } from "../src/services/adminStudentPassword.js";
import { bindStudentPasswordReset, studentPasswordResetMarkup } from "../src/modules/admin/RestablecerClaveAlumno.js";

const now = 1800000000000;
const input = { alumnoId: "alumno-a", expectedUid: "auth-alumno-a", temporaryPassword: "TemporalNueva2026" };
function backendFixture({ uid = "administrador", profile = { rol: "admin", activo: true } } = {}) {
  const documents = new Map([
    [`usuarios/${uid}`, profile], ["alumnos/alumno-a", { nombre: "Alumno A", ci: "990001", authUid: "auth-alumno-a", activo: true }],
    ["usuarios/auth-alumno-a", { rol: "alumno", alumnoId: "alumno-a", activo: true }],
    ["gestiones/2026/calificaciones/nota-a", { alumnoId: "alumno-a", nota: 85 }],
    ["gestiones/2026/asistencias/asistencia-a", { alumnoId: "alumno-a", estado: "presente" }]
  ]);
  const updates = [];
  const dependencies = { now, db: { doc: (path) => ({ get: async () => ({ data: () => documents.get(path) }) }) }, auth: { updateUser: async (target, patch) => { updates.push({ target, patch }); return { uid: target }; } } };
  const request = { auth: { uid, token: { auth_time: now / 1000 } }, data: { ...input } };
  return { documents, updates, dependencies, request, run: () => resetStudentPassword(request, dependencies) };
}

test("restablecer requiere administrador activo y nunca acepta docente, director o alumno", async () => {
  for (const rol of ["docente", "director", "alumno", "otro"]) {
    const fixture = backendFixture({ profile: { rol, activo: true } });
    await assert.rejects(fixture.run, { code: "permission-denied" }); assert.equal(fixture.updates.length, 0);
  }
  const inactive = backendFixture({ profile: { rol: "admin", activo: false } });
  await assert.rejects(inactive.run, { code: "permission-denied" });
  const anonymous = backendFixture(); anonymous.request.auth = null;
  await assert.rejects(anonymous.run, { code: "unauthenticated" });
});

test("la confirmacion administrativa reciente es obligatoria", async () => {
  for (const authTime of [undefined, now / 1000 - 301, now / 1000 + 61]) {
    const fixture = backendFixture(); fixture.request.auth.token.auth_time = authTime;
    await assert.rejects(fixture.run, { code: "failed-precondition" }); assert.equal(fixture.updates.length, 0);
  }
});

test("no permite apuntar a otra cuenta ni restablecer docentes o administradores", async () => {
  const stale = backendFixture(); stale.request.data.expectedUid = "otra-cuenta";
  await assert.rejects(stale.run, { code: "failed-precondition" }); assert.equal(stale.updates.length, 0);
  for (const profile of [{ rol: "docente", alumnoId: "alumno-a" }, { rol: "admin", alumnoId: "alumno-a" }, { rol: "alumno", alumnoId: "otro-alumno" }, undefined]) {
    const fixture = backendFixture(); fixture.documents.set("usuarios/auth-alumno-a", profile);
    await assert.rejects(fixture.run, { code: "permission-denied" }); assert.equal(fixture.updates.length, 0);
  }
  const missing = backendFixture(); missing.documents.delete("alumnos/alumno-a");
  await assert.rejects(missing.run, { code: "failed-precondition" }); assert.equal(missing.updates.length, 0);
});

test("valida identificadores, campos y longitud de clave antes de cambiar Authentication", async () => {
  for (const patch of [{ alumnoId: "otra/ruta" }, { temporaryPassword: "123" }, { temporaryPassword: "a".repeat(129) }, { expectedUid: "" }, { uid: "otra-cuenta" }]) {
    const fixture = backendFixture(); Object.assign(fixture.request.data, patch);
    await assert.rejects(fixture.run, { code: "invalid-argument" }); assert.equal(fixture.updates.length, 0);
  }
});

test("solo cambia password en el UID vinculado y no guarda claves en Firestore ni en la respuesta", async () => {
  for (const uid of ["administrador", MAIN_ADMIN_UID]) {
    const fixture = backendFixture({ uid });
    if (uid === MAIN_ADMIN_UID) fixture.documents.delete(`usuarios/${uid}`);
    const before = structuredClone([...fixture.documents]);
    assert.deepEqual(await fixture.run(), { alumnoId: input.alumnoId, uid: input.expectedUid });
    assert.deepEqual(fixture.updates, [{ target: input.expectedUid, patch: { password: input.temporaryPassword } }]);
    assert.deepEqual([...fixture.documents], before);
  }
});

test("el error de Firebase se informa sin fingir exito ni exponer el contenido de la solicitud", async () => {
  for (const [code, expected] of [["auth/user-not-found", "failed-precondition"], ["auth/invalid-password", "invalid-argument"], ["auth/insufficient-permission", "unavailable"]]) {
    const fixture = backendFixture(); fixture.dependencies.auth.updateUser = async () => { throw Object.assign(new Error(input.temporaryPassword), { code }); };
    await assert.rejects(fixture.run, (error) => error.code === expected && !error.message.includes(input.temporaryPassword));
  }
});

test("el cliente confirma la clave administrativa antes de enviar solo la clave temporal y el alumno", async () => {
  const calls = [], user = { uid: "admin", email: "admin@example.test", getIdToken: async (force) => { assert.equal(force, true); calls.push("token"); return "token-validado"; } };
  const result = await resetStudentPasswordAsAdmin({ student: { id: input.alumnoId, authUid: input.expectedUid }, temporaryPassword: input.temporaryPassword, adminPassword: "ClaveAdmin" }, {
    authClient: { currentUser: user },
    reauthenticate: async (target) => { assert.equal(target, user); calls.push("confirmar"); },
    call: async (payload, token) => { assert.deepEqual(payload, input); assert.equal(token, "token-validado"); calls.push("restablecer"); return { uid: input.expectedUid, alumnoId: input.alumnoId }; }
  });
  assert.deepEqual(calls, ["confirmar", "token", "restablecer"]); assert.equal(result.uid, input.expectedUid);
});

test("una clave administrativa incorrecta o el cambio de sesion no envian el restablecimiento", async () => {
  const user = { uid: "admin", email: "admin@example.test" }, authClient = { currentUser: user };
  const values = { student: { id: input.alumnoId, authUid: input.expectedUid }, temporaryPassword: input.temporaryPassword, adminPassword: "Incorrecta" };
  const call = async () => assert.fail("No debe llegar al servidor");
  await assert.rejects(resetStudentPasswordAsAdmin(values, { authClient, call, reauthenticate: async () => { throw Object.assign(new Error("Incorrecta"), { code: "auth/invalid-credential" }); } }), { code: "auth/invalid-credential" });
  await assert.rejects(resetStudentPasswordAsAdmin(values, { authClient, call, reauthenticate: async () => { authClient.currentUser = { uid: "otro" }; } }), /sesion cambio/);
});

test("las claves propuestas usan el generador criptografico y el modal escapa los nombres", () => {
  const passwords = new Set(Array.from({ length: 50 }, generateTemporaryStudentPassword));
  assert.equal(passwords.size, 50);
  for (const password of passwords) assert.match(password, /^[A-Za-z2-9]{12}$/);
  const html = studentPasswordResetMarkup({ nombre: '<img src=x onerror="1">', ci: "990001" }, "Cuarto A");
  assert.doesNotMatch(html, /<img/); assert.match(html, /&lt;img/); assert.match(html, /Confirmar restablecimiento/);
  assert.match(html, /autocomplete="current-password"/);
});

test("el servidor local rechaza origen ajeno, red externa y peticiones sin sesion", async () => {
  let handler;
  adminDevPlugin({}, { projectId: "demo-sistema-seguridad" }).configureServer({ middlewares: { use: (_path, callback) => { handler = callback; } } });
  async function request(changes = {}) {
    const req = Readable.from([JSON.stringify(input)]);
    Object.assign(req, { method: "POST", url: "/", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:5192", origin: "http://127.0.0.1:5192", authorization: "Bearer token" }, ...changes });
    const response = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await handler(req, response); return response;
  }
  assert.equal((await request({ method: "GET" })).statusCode, 405);
  assert.equal((await request({ socket: { remoteAddress: "192.168.1.2" } })).statusCode, 403);
  assert.equal((await request({ headers: { host: "127.0.0.1:5192", origin: "https://sitio-ajeno.test", authorization: "Bearer token" } })).statusCode, 403);
  assert.equal((await request({ headers: { host: "127.0.0.1:5192", origin: "http://127.0.0.1:5192" } })).statusCode, 401);
});

function dialogFixture(resetPassword) {
  const nodes = new Map();
  const node = () => ({ value: "", type: "password", hidden: false, disabled: false, dataset: {}, handlers: new Map(), focused: false,
    addEventListener(type, callback) { this.handlers.set(type, callback); },
    emit(type) { return this.handlers.get(type)?.({ preventDefault() {}, currentTarget: this }); },
    setAttribute() {}, removeAttribute() {}, focus() { this.focused = true; }
  });
  for (const key of ["form", "temporary", "admin-password", "result", "success", "status", "close", "generate", "toggle", "copy", "success-label", "submit"]) nodes.set(`[data-reset-${key}]`, node());
  const inputs = ["temporary", "admin-password", "result"].map((key) => nodes.get(`[data-reset-${key}]`));
  const controls = [...inputs, ...["close", "generate", "toggle", "copy", "submit"].map((key) => nodes.get(`[data-reset-${key}]`))];
  let closed = false, session = true;
  const dialog = { ...node(), isConnected: true, querySelector: (selector) => nodes.get(selector), querySelectorAll: (selector) => selector === "input" ? inputs : selector === "[data-reset-close]" ? [nodes.get(selector)] : controls };
  const binding = bindStudentPasswordReset(dialog, { student: { id: input.alumnoId, authUid: input.expectedUid }, isSessionActive: () => session, resetPassword, generatePassword: () => input.temporaryPassword, onClose: () => { closed = true; } });
  const get = (key) => nodes.get(`[data-reset-${key}]`);
  return { dialog, get, binding, closed: () => closed, endSession: () => { session = false; } };
}

test("cancelar no restablece y borra todas las claves del modal", () => {
  const fixture = dialogFixture(async () => assert.fail("No debe cambiar la clave"));
  fixture.get("admin-password").value = "ClaveAdmin"; fixture.get("close").emit("click");
  assert.equal(fixture.closed(), true); assert.equal(fixture.get("temporary").value, ""); assert.equal(fixture.get("admin-password").value, "");
});

test("el modal evita doble envio y solo muestra la clave temporal despues del exito", async () => {
  let finish, calls = 0;
  const fixture = dialogFixture(async (values) => { calls++; assert.equal(values.adminPassword, "ClaveAdmin"); await new Promise((resolve) => { finish = resolve; }); });
  fixture.get("admin-password").value = "ClaveAdmin";
  const operation = fixture.get("form").emit("submit"); await fixture.get("form").emit("submit");
  assert.equal(calls, 1); assert.equal(fixture.get("submit").disabled, true); assert.equal(fixture.get("admin-password").value, "");
  fixture.get("close").emit("click"); assert.equal(fixture.closed(), false);
  finish(); await operation;
  assert.equal(fixture.get("form").hidden, true); assert.equal(fixture.get("success").hidden, false);
  assert.equal(fixture.get("result").value, input.temporaryPassword);
  await fixture.get("form").emit("submit"); assert.equal(calls, 1);
  fixture.binding.close(); assert.equal(fixture.get("result").value, "");
});

test("un fallo conserva el formulario para reintentar y una salida descarta respuestas tardias", async () => {
  const failure = dialogFixture(async () => { throw Object.assign(new Error("Firebase"), { code: "auth/invalid-credential" }); });
  failure.get("admin-password").value = "Incorrecta"; await failure.get("form").emit("submit");
  assert.match(failure.get("status").textContent, /no es correcta/); assert.equal(failure.closed(), false); failure.binding.close();
  let finish;
  const late = dialogFixture(async () => { await new Promise((resolve) => { finish = resolve; }); });
  late.get("admin-password").value = "ClaveAdmin"; const operation = late.get("form").emit("submit");
  late.endSession(); late.binding.close(); finish(); await operation;
  assert.equal(late.get("result").value, "");
});
