import test from "node:test";
import assert from "node:assert/strict";
import { changeTemporaryPassword } from "../functions/own-password-core.js";
import { schoolAccess } from "../functions/access-core.js";
import { cambiarClaveTemporal } from "../src/services/claveTemporal.js";
import { readFileSync } from "node:fs";
import { passwordChangeBlocksAccess } from "../functions/password-policy.js";
import { recordatorioClaveMarkup } from "../src/ui/claveTemporal.js";
import { validarAccesoInicial } from "../functions/informe-core.js";

function fixture() {
  const records = new Map([["usuarios/uid", { rol: "alumno", activo: true, usuario: "990001", passwordChangeRequired: true, passwordChangeVersion: "v1" }]]);
  const writes = [], passwords = [];
  const db = { doc: path => ({ path, get: async () => ({ data: () => records.get(path) }), update: async patch => { writes.push(patch); records.set(path, { ...records.get(path), ...patch }); } }), runTransaction: async callback => callback({ get: ref => ref.get(), update: (ref, patch) => ref.update(patch), set: (ref, data) => records.set(ref.path, data), delete: ref => records.delete(ref.path) }) };
  const dependencies = { db, auth: { getUser: async () => ({ uid: "uid", email: "test@example.test" }), updateUser: async (uid, patch) => passwords.push({ uid, patch }) }, takeLimit: async () => {}, verifyPassword: async (_, password) => { if (password !== "123456") throw new Error("incorrecta"); return { uid: "uid" }; } };
  const request = { auth: { uid: "uid" }, data: { currentPassword: "123456", newPassword: "PersonalSegura2026" } };
  return { records, writes, passwords, dependencies, request, run: () => changeTemporaryPassword(request, dependencies) };
}

test("solo cambia la cuenta autenticada y quita la marca sin guardar claves", async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { ok: true });
  assert.deepEqual(f.passwords, [{ uid: "uid", patch: { password: "PersonalSegura2026" } }]);
  assert.equal(f.records.get("usuarios/uid").passwordChangeRequired, false);
  assert.ok(!JSON.stringify([...f.records]).includes("PersonalSegura2026"));
});
test("requiere sesion, clave actual, cuenta habilitada y clave nueva segura y diferente", async () => {
  for (const patch of [{ uid: "otro" }, { newPassword: "123456" }, { newPassword: "123456789012" }, { currentPassword: "incorrecta" }]) {
    const f = fixture(); Object.assign(f.request.data, patch);
    await assert.rejects(f.run); assert.equal(f.passwords.length, 0);
  }
  const anonymous = fixture(); anonymous.request.auth = null;
  await assert.rejects(anonymous.run, { code: "unauthenticated" });
  const inactive = fixture(); inactive.records.get("usuarios/uid").activo = false;
  await assert.rejects(inactive.run); assert.equal(inactive.passwords.length, 0);
  const same = fixture(); same.request.data.currentPassword = same.request.data.newPassword;
  await assert.rejects(same.run, /diferente/);
});
test("si cambia el restablecimiento concurrente no se quita su nueva marca", async () => {
  const f = fixture();
  f.dependencies.auth.updateUser = async () => { f.records.get("usuarios/uid").passwordChangeVersion = "v2"; };
  await assert.rejects(f.run, /clave cambio/);
  assert.equal(f.records.get("usuarios/uid").passwordChangeRequired, true);
});
test("un fallo de Authentication no confirma el cambio ni limpia la marca", async () => {
  const f = fixture(); f.dependencies.auth.updateUser = async () => { throw new Error("secreto"); };
  await assert.rejects(f.run, /No se pudo cambiar/);
  assert.equal(f.records.get("usuarios/uid").passwordChangeRequired, true);
});
test("un restablecimiento en curso bloquea otro cambio antes de tocar Authentication", async () => {
  const f = fixture(); f.records.set("operaciones_clave/uid", { id: "otro", expiresAt: Date.now() + 60000 });
  await assert.rejects(f.run, { code: "failed-precondition" });
  assert.equal(f.passwords.length, 0);
});
test("ingresar con una clave debil marca el perfil pero no la cambia ni la almacena", async () => {
  const f = fixture(); const profile = f.records.get("usuarios/uid"); profile.rol = "docente"; profile.passwordChangeRequired = false;
  await schoolAccess({ accion: "ingresar", login: "test@example.test", password: "123456" }, f.dependencies);
  assert.equal(profile.passwordChangeRequired, false);
  assert.equal(f.records.get("usuarios/uid").passwordChangeRequired, true);
  assert.equal(f.passwords.length, 0);
  assert.ok(!JSON.stringify(f.writes).includes("123456"));
});
test("el cliente valida confirmacion y sesion y no admite un falso exito", async () => {
  const input = { currentPassword: "123456", newPassword: "PersonalSegura2026", confirmPassword: "PersonalSegura2026" }, authClient = { currentUser: { uid: "uid" } };
  await assert.rejects(cambiarClaveTemporal({ ...input, confirmPassword: "otra" }, { authClient }), /no coincide/);
  await assert.rejects(cambiarClaveTemporal(input, { authClient, call: async () => ({}) }), /confirmar/);
  await assert.rejects(cambiarClaveTemporal(input, { authClient, call: async () => { authClient.currentUser = { uid: "otro" }; return { ok: true }; } }), /sesion cambio/);
});
test("la compilacion no configura una clave Gemini en variables VITE ni ofrece modo directo", () => {
  for (const file of ["../.github/workflows/deploy.yml", "../src/services/informeInicialIA.js"]) assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /VITE_GEMINI_API_KEY|geminiDirecto/);
});

test("solo el modo demostracion explicito permite posponer sin borrar la marca pendiente", () => {
  const profile = { passwordChangeRequired: true };
  for (const config of [{}, { modoDemostracion: false }, { modoDemostracion: "true" }]) assert.equal(passwordChangeBlocksAccess(profile, config), true);
  assert.equal(passwordChangeBlocksAccess(profile, { modoDemostracion: true }), false);
  assert.equal(profile.passwordChangeRequired, true);
  assert.equal(passwordChangeBlocksAccess({ passwordChangeRequired: false }), false);
  assert.match(recordatorioClaveMarkup(), /Ahora no/);
  assert.match(recordatorioClaveMarkup(), /Cambiar ahora/);
});

test("Gemini permite la clave pendiente solo en demostracion y conserva el curso y rol asignados", () => {
  const args = { uid: "docente", profile: { rol: "docente", activo: true, passwordChangeRequired: true }, input: { gestionId: "2026", cursoId: "inicial", trimestreId: "t1" }, year: "2026", config: { versionModelo: 2, gestionHabilitada: true, gestionActivaId: "2026" }, assignment: { cursos: { inicial: { materias: [] } } } };
  assert.throws(() => validarAccesoInicial(args), /permission-denied/);
  args.config.modoDemostracion = true;
  assert.doesNotThrow(() => validarAccesoInicial(args));
  assert.throws(() => validarAccesoInicial({ ...args, profile: { ...args.profile, rol: "alumno" } }), /permission-denied/);
  assert.throws(() => validarAccesoInicial({ ...args, assignment: { cursos: { preinicial: { materias: [] } } } }), /permission-denied/);
});
