import assert from "node:assert/strict";
import test from "node:test";
import { changeOwnPassword } from "../src/services/accountSettings.js";
import { bindAccountSettings } from "../src/ui/accountSettings.js";
import { appShell } from "../src/ui/shell.js";

test("alumno tiene acceso al cambio de clave desde ambos menus y sin formulario de correo", () => {
  for (const route of ["/alumno", "/alumno/boleta"]) {
    const html = appShell("alumno", route, "Panel");
    assert.equal((html.match(/data-action="open-account-settings"/g) || []).length, 2);
    assert.equal((html.match(/data-account-password-form/g) || []).length, 1);
    assert.doesNotMatch(html, /data-account-email-form|Cuenta docente/);
    assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="account-modal-title"/);
    assert.match(html, /name="currentPassword" type="password" autocomplete="current-password"/);
    assert.match(html, /name="newPassword" type="password" autocomplete="new-password" minlength="6"/);
    assert.match(html, /data-account-password-success role="status"/);
    assert.match(html, /data-lucide="circle-check"/);
  }
  const teacher = appShell("docente", "/docente/asistencia", "Asistencia");
  assert.match(teacher, /data-account-email-form/);
  assert.match(teacher, /data-account-password-form/);
});

test("validar longitud y confirmacion no requiere una cuenta ni llama a Firebase", async () => {
  const dependencies = { authClient: { get currentUser() { assert.fail("La validacion debe terminar antes de consultar la sesion"); } } };
  await assert.rejects(changeOwnPassword({ newPassword: "123", confirmPassword: "123" }, dependencies), /6 caracteres/);
  await assert.rejects(changeOwnPassword({ newPassword: "ClaveNueva2026", confirmPassword: "distinta" }, dependencies), /no coincide/);
});

test("cambiar clave verifica la actual y conserva exactamente la nueva, tambien con alias interno", async () => {
  const user = { uid: "alumno-a", email: "990001@usuarios.ue-nueva-bolivia.edu.bo" };
  const calls = [];
  await changeOwnPassword({ currentPassword: "123456", newPassword: "  Nueva2026  ", confirmPassword: "  Nueva2026  " }, {
    authClient: { currentUser: user },
    reauthenticate: async (target, credential) => { assert.strictEqual(target, user); assert.equal(credential.providerId, "password"); calls.push("verificar"); },
    update: async (target, value) => { assert.strictEqual(target, user); assert.equal(value, "  Nueva2026  "); calls.push("cambiar"); }
  });
  assert.deepEqual(calls, ["verificar", "cambiar"]);
});

test("una clave actual incorrecta o un cambio de sesion impiden actualizar la contrasena", async () => {
  const input = { currentPassword: "123456", newPassword: "Nueva2026", confirmPassword: "Nueva2026" };
  const authClient = { currentUser: { uid: "a", email: "a@example.test" } };
  const update = async () => assert.fail("No debe cambiar la clave");
  await assert.rejects(changeOwnPassword(input, { authClient, reauthenticate: async () => { throw Object.assign(new Error("Incorrecta"), { code: "auth/invalid-credential" }); }, update }), { code: "auth/invalid-credential" });
  await assert.rejects(changeOwnPassword(input, { authClient, reauthenticate: async () => { authClient.currentUser = { uid: "b" }; }, update }), /sesion cambio/);
});

function uiFixture(changePassword) {
  const abort = new AbortController();
  const node = () => {
    const events = new Map(), attributes = new Map(), classes = new Set();
    return {
      disabled: false, value: "", type: "password", dataset: {}, isConnected: true,
      classList: { add: (...items) => items.forEach((item) => classes.add(item)), remove: (...items) => items.forEach((item) => classes.delete(item)), contains: (item) => classes.has(item), toggle(item, on) { if (on) classes.add(item); else classes.delete(item); } },
      setAttribute: (name, value) => attributes.set(name, value), getAttribute: (name) => attributes.get(name), removeAttribute: (name) => attributes.delete(name),
      addEventListener(type, handler, { signal }) { events.set(type, handler); signal.addEventListener("abort", () => events.delete(type), { once: true }); },
      emit(type, extra = {}) { return events.get(type)?.({ target: this, preventDefault() {}, ...extra }); },
      getClientRects: () => [{}], querySelector: () => null,
      focus() { root.activeElement = this; }
    };
  };
  const open = node(), close = node(), menu = node(), modal = node(), form = node(), status = node(), submit = node(), success = node(), forms = node();
  const fields = Object.fromEntries(["currentPassword", "newPassword", "confirmPassword"].map((name) => [name, node()]));
  const toggle = node(); toggle.dataset.accountTogglePassword = "account-newPassword";
  form.reset = () => Object.values(fields).forEach((field) => { field.value = ""; });
  const controls = [close, ...Object.values(fields), toggle, submit];
  modal.classList.add("hidden");
  success.classList.add("hidden");
  modal.querySelector = (selector) => selector === "[data-account-status]" ? status : selector === "[data-account-forms]" ? forms : selector === "[data-account-password-success]" ? success : selector === "[data-account-password-form]" ? form : selector === "[data-account-password-form] input" ? fields.currentPassword : selector === "#account-newPassword" ? fields.newPassword : null;
  modal.querySelectorAll = (selector) => selector === "form" ? [form] : selector === "[data-account-toggle-password]" ? [toggle] : selector === "[data-action='close-account-settings']" ? [close] : controls;
  const root = { body: { style: { overflow: "auto" } }, activeElement: open, querySelector: (selector) => selector === "[data-account-modal]" ? modal : menu, querySelectorAll: () => [open] };
  let menuCloses = 0;
  const authClient = { currentUser: { uid: "alumno-a" } };
  const dispose = bindAccountSettings({ root, signal: abort.signal, authClient, changePassword, beforeOpen: () => { menuCloses++; } });
  return { root, open, close, menu, modal, form, status, submit, fields, toggle, success, forms, authClient, abort, dispose, menuCloses: () => menuCloses };
}

async function withFormData(run) {
  const previous = globalThis.FormData;
  globalThis.FormData = class { constructor(form) { this.fields = form.fields; } get(name) { return this.fields[name].value; } };
  try { await run(); } finally { globalThis.FormData = previous; }
}

test("guardar dos veces cambia una sola vez, bloquea controles y limpia las claves al terminar", async () => withFormData(async () => {
  let finish, calls = 0;
  const ui = uiFixture(async () => { calls++; await new Promise((resolve) => { finish = resolve; }); });
  ui.form.fields = ui.fields;
  ui.open.emit("click"); assert.equal(ui.menuCloses(), 1); assert.strictEqual(ui.root.activeElement, ui.fields.currentPassword);
  for (const field of Object.values(ui.fields)) field.value = "123456";
  const first = ui.form.emit("submit"); await ui.form.emit("submit");
  assert.equal(calls, 1); assert.equal(ui.submit.disabled, true);
  ui.close.emit("click"); assert.equal(ui.modal.classList.contains("hidden"), false);
  finish(); await first;
  assert.equal(ui.submit.disabled, false); assert.equal(ui.success.classList.contains("hidden"), false);
  assert.ok(Object.values(ui.fields).every((field) => field.value === ""));
  ui.close.emit("click"); assert.equal(ui.root.body.style.overflow, "auto"); ui.dispose();
}));

test("un error permite corregir y reintentar; cerrar oculta y limpia todos los campos", async () => withFormData(async () => {
  let fail = true;
  const ui = uiFixture(async () => { if (fail) throw Object.assign(new Error("Firebase"), { code: "auth/invalid-credential" }); });
  ui.open.closest = () => ({});
  ui.form.fields = ui.fields; ui.open.emit("click"); ui.fields.currentPassword.value = "incorrecta";
  await ui.form.emit("submit"); assert.match(ui.status.textContent, /actual no es correcta/); assert.equal(ui.submit.disabled, false);
  ui.toggle.emit("click"); assert.equal(ui.fields.newPassword.type, "text");
  ui.modal.emit("keydown", { key: "Escape" });
  assert.equal(ui.modal.classList.contains("hidden"), true); assert.equal(ui.fields.currentPassword.value, ""); assert.equal(ui.fields.newPassword.type, "password");
  assert.strictEqual(ui.root.activeElement, ui.menu);
  ui.open.emit("click"); fail = false; await ui.form.emit("submit"); assert.equal(ui.success.classList.contains("hidden"), false);
  ui.abort.abort(); assert.equal(ui.root.body.style.overflow, "auto");
}));

test("el acierto aparece solo al guardar y cierra el modal tras 1,2 segundos", async (t) => withFormData(async () => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const ui = uiFixture(async () => { calls++; });
  ui.form.fields = ui.fields; ui.open.emit("click");
  await ui.form.emit("submit");
  assert.equal(ui.success.classList.contains("hidden"), false);
  assert.equal(ui.forms.classList.contains("hidden"), true);
  assert.strictEqual(ui.root.activeElement, ui.success);
  await ui.form.emit("submit"); assert.equal(calls, 1);
  t.mock.timers.tick(1199); assert.equal(ui.modal.classList.contains("hidden"), false);
  t.mock.timers.tick(1); assert.equal(ui.modal.classList.contains("hidden"), true);
  assert.equal(ui.root.body.style.overflow, "auto");
  assert.strictEqual(ui.root.activeElement, ui.open);
  ui.open.emit("click");
  assert.equal(ui.success.classList.contains("hidden"), true);
  assert.equal(ui.forms.classList.contains("hidden"), false);
  ui.dispose();
}));

test("un cierre anterior no cierra un modal reabierto ni actua despues de salir", async (t) => withFormData(async () => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ui = uiFixture(async () => {});
  ui.form.fields = ui.fields; ui.open.emit("click"); await ui.form.emit("submit");
  ui.close.emit("click"); ui.open.emit("click");
  t.mock.timers.tick(1200); assert.equal(ui.modal.classList.contains("hidden"), false);
  await ui.form.emit("submit"); ui.dispose();
  ui.root.activeElement = ui.menu;
  t.mock.timers.tick(1200); assert.strictEqual(ui.root.activeElement, ui.menu);
  assert.equal(ui.root.body.style.overflow, "auto");
}));

test("el error no muestra acierto ni cierra automaticamente", async (t) => withFormData(async () => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ui = uiFixture(async () => { throw Object.assign(new Error("Firebase"), { code: "auth/network-request-failed" }); });
  ui.form.fields = ui.fields; ui.open.emit("click"); await ui.form.emit("submit");
  t.mock.timers.tick(5000);
  assert.equal(ui.success.classList.contains("hidden"), true);
  assert.equal(ui.forms.classList.contains("hidden"), false);
  assert.equal(ui.modal.classList.contains("hidden"), false);
  assert.match(ui.status.textContent, /No hay conexion/);
  ui.dispose();
}));
