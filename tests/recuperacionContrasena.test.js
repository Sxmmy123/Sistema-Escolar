import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { normalizarCorreoReal, esCorreoInterno } from "../src/services/correoCuenta.js";
import { createSystemUser } from "../src/services/users.js";
import { MENSAJE_RECUPERACION, solicitarRecuperacion } from "../src/services/recuperacionContrasena.js";

const realEmail = "persona@example.test";
function mockRecovery(email = realEmail, error = null) {
  const calls = [];
  const dependencies = {
    auth: {}, resolver: async (value) => { calls.push(["resolver", value]); return email; },
    enviar: async (auth, target) => { calls.push(["enviar", target]); if (error) throw error; }
  };
  return { calls, dependencies };
}

test("el correo del personal es obligatorio, se normaliza y rechaza los alias internos", () => {
  assert.equal(normalizarCorreoReal(" PERSONA@EXAMPLE.TEST "), realEmail);
  for (const value of ["", "correo", "a@@b.com", "a b@c.com", "a@b", `${"a".repeat(255)}@example.test`, "alumno@usuarios.ue-nueva-bolivia.edu.bo"]) {
    assert.throws(() => normalizarCorreoReal(value));
  }
  assert.equal(esCorreoInterno("Alumno@USUARIOS.UE-NUEVA-BOLIVIA.EDU.BO"), true);
  assert.equal(esCorreoInterno(realEmail), false);
});

test("crear cualquier cuenta del personal sin correo falla antes de consultar o escribir datos", async () => {
  for (const rol of ["docente", "director", "admin"]) {
    await assert.rejects(createSystemUser({ nombre: "Prueba", username: "prueba", password: "Temporal123", rol }, { auth: { currentUser: { uid: "admin" } } }), /correo electronico es obligatorio/);
  }
});

test("recuperar resuelve el usuario y envia solo al correo asociado, en espanol", async () => {
  const fixture = mockRecovery();
  assert.equal(await solicitarRecuperacion(" Docente004 ", fixture.dependencies), MENSAJE_RECUPERACION);
  assert.deepEqual(fixture.calls, [["resolver", "Docente004"], ["enviar", realEmail]]);
  assert.equal(fixture.dependencies.auth.languageCode, "es");
});

test("un correo escrito directamente se normaliza sin exponer datos de la cuenta", async () => {
  const fixture = mockRecovery("PERSONA@EXAMPLE.TEST");
  assert.equal(await solicitarRecuperacion("PERSONA@EXAMPLE.TEST", fixture.dependencies), MENSAJE_RECUPERACION);
  assert.equal(fixture.calls[1][1], realEmail);
});

test("cuentas sin correo real y usuarios inexistentes conservan una respuesta generica", async () => {
  const internal = mockRecovery("usuario@usuarios.ue-nueva-bolivia.edu.bo");
  assert.equal(await solicitarRecuperacion("usuario", internal.dependencies), MENSAJE_RECUPERACION);
  assert.equal(internal.calls.length, 1);
  const missing = mockRecovery(realEmail, { code: "auth/user-not-found" });
  assert.equal(await solicitarRecuperacion(realEmail, missing.dependencies), MENSAJE_RECUPERACION);
});

test("una entrada invalida nunca solicita un correo", async () => {
  const fixture = mockRecovery();
  for (const value of ["", " ", "bad@@mail.com", "a b@c.com", "usuario con espacios", "<script>"]) {
    await assert.rejects(solicitarRecuperacion(value, fixture.dependencies));
  }
  assert.deepEqual(fixture.calls, []);
});

test("los fallos de red y limite permiten reintentar sin filtrar mensajes internos", async () => {
  for (const [code, message] of [["auth/network-request-failed", /No hay conexion/], ["auth/too-many-requests", /Demasiados intentos/], ["auth/internal-error", /mas tarde/]]) {
    const fixture = mockRecovery(realEmail, { code, message: "informacion privada" });
    await assert.rejects(solicitarRecuperacion(realEmail, fixture.dependencies), (error) => message.test(error.message) && !error.message.includes("privada"));
  }
  const fixture = mockRecovery();
  fixture.dependencies.resolver = async () => { throw { code: "unavailable" }; };
  await assert.rejects(solicitarRecuperacion("docente", fixture.dependencies), /No hay conexion/);
  assert.deepEqual(fixture.calls, []);
});

const loginSource = readFileSync(new URL("../src/modules/login/LoginView.js", import.meta.url), "utf8");
function element(value = "", hidden = false) {
  const events = new Map();
  const classes = new Set(hidden ? ["hidden"] : []);
  return {
    value, disabled: false, textContent: "", className: "",
    classList: { add: (value) => classes.add(value), remove: (value) => classes.delete(value), contains: (value) => classes.has(value) },
    addEventListener: (type, handler) => events.set(type, handler),
    emit: (type) => events.get(type)?.({ preventDefault() {} }),
    focus() {}
  };
}
function loginFixture(request = async () => MENSAJE_RECUPERACION) {
  const login = element();
  const recovery = element("", true);
  const username = element("Docente004");
  const password = element("no debe conservarse");
  const target = element();
  const open = element();
  const close = element();
  const submit = element();
  const status = element();
  login.elements = { namedItem: (name) => name === "login" ? username : password };
  recovery.elements = { namedItem: () => target };
  recovery.reportValidity = () => Boolean(target.value);
  login.querySelector = () => open;
  recovery.querySelector = (selector) => selector === "[data-close-recovery]" ? close : selector === "[data-recovery-status]" ? status : submit;
  const context = vm.createContext({
    document: { querySelector: (selector) => selector === "[data-login-form]" ? login : recovery },
    createIcons() {}, ArrowLeft: {}, Mail: {}, solicitarRecuperacion: request
  });
  vm.runInContext(loginSource.slice(loginSource.indexOf("export function bindLogin()")).replace("export function", "function"), context);
  context.bindLogin();
  return { login, recovery, username, password, target, open, close, submit, status };
}

test("abrir y cerrar recuperacion conserva el usuario y limpia la contrasena", () => {
  const fixture = loginFixture();
  fixture.open.emit("click");
  assert.equal(fixture.target.value, "Docente004");
  assert.equal(fixture.password.value, "");
  assert.equal(fixture.login.classList.contains("hidden"), true);
  fixture.target.value = realEmail;
  fixture.close.emit("click");
  assert.equal(fixture.username.value, realEmail);
  assert.equal(fixture.recovery.classList.contains("hidden"), true);
});

test("doble envio solicita un unico enlace y restaura controles al terminar", async () => {
  let complete;
  let calls = 0;
  const promise = new Promise((resolve) => { complete = resolve; });
  const fixture = loginFixture(() => { calls++; return promise; });
  fixture.open.emit("click");
  const first = fixture.recovery.emit("submit");
  await fixture.recovery.emit("submit");
  assert.equal(calls, 1);
  assert.equal(fixture.submit.disabled, true);
  complete(MENSAJE_RECUPERACION);
  await first;
  assert.equal(fixture.status.textContent, MENSAJE_RECUPERACION);
  assert.equal(fixture.submit.disabled, false);
  assert.equal(fixture.target.disabled, false);
});

test("un error de recuperacion aparece en pantalla y permite reintentar", async () => {
  const fixture = loginFixture(async () => { throw new Error("Sin conexion"); });
  fixture.open.emit("click");
  await fixture.recovery.emit("submit");
  assert.equal(fixture.status.textContent, "Sin conexion");
  assert.equal(fixture.submit.disabled, false);
  assert.match(fixture.status.className, /text-red-800/);
});

test("un formulario vacio no solicita enlaces", async () => {
  let calls = 0;
  const fixture = loginFixture(async () => { calls++; });
  fixture.open.emit("click");
  fixture.target.value = " ";
  await fixture.recovery.emit("submit");
  assert.equal(calls, 0);
});
