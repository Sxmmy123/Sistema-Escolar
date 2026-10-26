import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { confirmarRestablecimiento, destinoAccionFirebase, errorRestablecimiento, leerAccionCorreo, ocultarCorreo, verificarEnlaceRestablecimiento } from "../src/services/restablecimientoContrasena.js";

const code = "codigo-de-prueba-valido";
const href = `https://example.test/Sistema-Escolar/restablecer.html?mode=resetPassword&oobCode=${code}&apiKey=prueba`;
const settle = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

test("el enlace se lee con URLSearchParams sin usar dominios ni redirecciones del correo", () => {
  assert.deepEqual(leerAccionCorreo(href, "prueba"), { mode: "resetPassword", code });
  assert.deepEqual(leerAccionCorreo(href + "&continueUrl=https://evil.test&authDomain=evil.test", "prueba"), { mode: "resetPassword", code });
  for (const url of ["https://example.test/restablecer.html", href + "&oobCode=otro", href + "&mode=verifyEmail", href + "&apiKey=otro", href.replace(code, "%0Atoken"), href.replace(code, ""), href.replace("apiKey=prueba", "apiKey=otro")]) {
    assert.throws(() => leerAccionCorreo(url, "prueba"));
  }
});

test("otras acciones de correo conservan el manejador seguro de Firebase", () => {
  const action = leerAccionCorreo(href.replace("resetPassword", "verifyEmail"));
  const url = new URL(destinoAccionFirebase(action, { authDomain: "colegio.firebaseapp.com", apiKey: "fija" }));
  assert.equal(url.origin, "https://colegio.firebaseapp.com");
  assert.equal(url.pathname, "/__/auth/action");
  assert.equal(url.searchParams.get("mode"), "verifyEmail");
  assert.equal(url.searchParams.get("apiKey"), "fija");
  assert.equal(url.searchParams.has("continueUrl"), false);
});

test("la validacion consulta Firebase y muestra el correo parcialmente oculto", async () => {
  const auth = {};
  assert.equal(await verificarEnlaceRestablecimiento(auth, code, async (receivedAuth, receivedCode) => {
    assert.strictEqual(receivedAuth, auth); assert.equal(receivedCode, code); return "docente@example.test";
  }), "docente@example.test");
  assert.equal(ocultarCorreo("docente@example.test"), "do***@example.test");
});

test("sin codigo, con contrasena corta o confirmacion distinta no se modifica la cuenta", async () => {
  let writes = 0;
  const confirmar = async () => { writes++; };
  for (const changes of [{ code: "" }, { password: "123" }, { confirmation: "otra" }]) {
    await assert.rejects(confirmarRestablecimiento({ auth: {}, code, password: "Segura123", confirmation: "Segura123", ...changes }, confirmar));
  }
  assert.equal(writes, 0);
});

test("el cambio de clave usa solo el codigo validado y conserva exactamente lo escrito", async () => {
  let received;
  const auth = {};
  await confirmarRestablecimiento({ auth, code, password: " Clave 123 ", confirmation: " Clave 123 " }, async (...args) => { received = args; });
  assert.deepEqual(received, [auth, code, " Clave 123 "]);
});

test("los errores vencidos son terminales y los de red o contrasena permiten reintentar", () => {
  for (const code of ["auth/expired-action-code", "auth/invalid-action-code", "auth/user-disabled"]) assert.equal(errorRestablecimiento({ code }).terminal, true);
  assert.equal(errorRestablecimiento({ code: "auth/weak-password" }).field, true);
  assert.equal(errorRestablecimiento({ code: "auth/network-request-failed" }).terminal, undefined);
  assert.doesNotMatch(errorRestablecimiento({ message: "token secreto" }).message, /secreto/);
});

const viewSource = readFileSync(new URL("../src/modules/login/RestablecerContrasena.js", import.meta.url), "utf8");
function node() {
  const events = new Map();
  return { hidden: true, disabled: false, textContent: "", value: "", type: "password", dataset: {}, attrs: {},
    addEventListener(type, callback) { events.set(type, callback); },
    emit(type) { return events.get(type)?.({ preventDefault() {} }); },
    setAttribute(name, value) { this.attrs[name] = value; }
  };
}
function page(options = {}) {
  const names = ["loading", "form", "success", "error", "retry", "form-status", "save-label", "back", "email", "error-title", "error-message"];
  const nodes = Object.fromEntries(names.map((name) => [name, node()]));
  const password = node(), confirmation = node(), submit = node();
  const toggle = node(); toggle.dataset.resetToggle = "password";
  const form = nodes.form;
  form.elements = { namedItem: (name) => name === "password" ? password : confirmation };
  form.reportValidity = () => password.value.length >= 6 && confirmation.value.length >= 6;
  form.reset = () => { password.value = ""; confirmation.value = ""; };
  form.querySelectorAll = () => [password, confirmation, submit, toggle];
  const root = { querySelector: (selector) => nodes[selector.match(/data-reset-([^\]]+)/)[1]], querySelectorAll: () => [toggle] };
  const context = vm.createContext({
    createIcons() {}, ArrowLeft: {}, Check: {}, CircleCheck: {}, Eye: {}, EyeOff: {}, KeyRound: {}, LoaderCircle: {}, RefreshCw: {}, ShieldCheck: {}, TriangleAlert: {},
    icon: (name) => `<i>${name}</i>`, errorRestablecimiento, ocultarCorreo, verificarEnlaceRestablecimiento, confirmarRestablecimiento
  });
  vm.runInContext(viewSource.slice(viewSource.indexOf("export function bindRestablecerContrasena")).replace("export function", "function"), context);
  const controller = context.bindRestablecerContrasena(root, { auth: {}, code, verificar: async () => "docente@example.test", confirmar: async () => {}, ...options });
  return { nodes, password, confirmation, submit, toggle, controller, form };
}

test("solo se habilita el formulario despues de validar el enlace", async () => {
  const pending = deferred();
  let writes = 0;
  const fixture = page({ verificar: () => pending.promise, confirmar: async () => { writes++; } });
  assert.equal(fixture.nodes.loading.hidden, false);
  fixture.password.value = fixture.confirmation.value = "Clave123";
  await fixture.form.emit("submit");
  assert.equal(writes, 0);
  pending.resolve("docente@example.test"); await settle();
  assert.equal(fixture.form.hidden, false);
  assert.equal(fixture.nodes.email.textContent, "do***@example.test");
});

test("enlace vencido no permite escribir, mientras un fallo de red ofrece reintento", async () => {
  const expired = page({ verificar: async () => { throw { code: "auth/expired-action-code" }; } });
  await settle();
  assert.equal(expired.form.hidden, true); assert.equal(expired.nodes.retry.hidden, true);
  let attempts = 0;
  const network = page({ verificar: async () => { if (++attempts === 1) throw { code: "auth/network-request-failed" }; return "docente@example.test"; } });
  await settle();
  assert.equal(network.nodes.retry.hidden, false);
  await network.nodes.retry.emit("click");
  assert.equal(network.form.hidden, false);
});

test("guardar dos veces produce una sola operacion, limpia claves y muestra el exito", async () => {
  const pending = deferred(); let writes = 0;
  const fixture = page({ confirmar: () => { writes++; return pending.promise; } });
  await settle(); fixture.password.value = fixture.confirmation.value = "Clave123";
  const first = fixture.form.emit("submit"); await fixture.form.emit("submit");
  assert.equal(writes, 1); assert.equal(fixture.submit.disabled, true);
  pending.resolve(); await first;
  assert.equal(fixture.nodes.success.hidden, false);
  assert.equal(fixture.password.value, ""); assert.equal(fixture.confirmation.value, "");
  assert.equal(fixture.nodes.back.hidden, true);
});

test("una clave rechazada permite corregirla, y un codigo consumido cierra el formulario", async () => {
  let attempts = 0;
  const fixture = page({ confirmar: async () => { throw { code: ++attempts === 1 ? "auth/weak-password" : "auth/invalid-action-code" }; } });
  await settle(); fixture.password.value = fixture.confirmation.value = "Clave123";
  await fixture.form.emit("submit");
  assert.equal(fixture.form.hidden, false); assert.equal(fixture.nodes["form-status"].hidden, false);
  await fixture.form.emit("submit");
  assert.equal(fixture.form.hidden, true); assert.equal(fixture.password.value, "");
});

test("mostrar la clave no cambia sus valores y desmontar descarta respuestas pendientes", async () => {
  const pending = deferred(); const fixture = page({ verificar: () => pending.promise });
  fixture.password.value = "Clave123";
  fixture.toggle.emit("click"); assert.equal(fixture.password.type, "text"); assert.equal(fixture.password.value, "Clave123");
  fixture.toggle.emit("click"); assert.equal(fixture.password.type, "password");
  fixture.controller.desmontar(); pending.resolve("docente@example.test"); await settle();
  assert.equal(fixture.form.hidden, true); assert.equal(fixture.password.value, "");
});

test("el service worker no almacena la pagina ni los enlaces con codigo de recuperacion", async () => {
  const source = readFileSync(new URL("../public/service-worker.js", import.meta.url), "utf8");
  const callbacks = new Map(); const requests = [];
  const context = vm.createContext({ URL,
    self: { location: { origin: "https://example.test" }, addEventListener: (name, fn) => callbacks.set(name, fn) },
    fetch: async (request, options) => { requests.push({ request, options }); return "red"; },
    caches: { open() { throw new Error("No debe cachear"); } }
  });
  vm.runInContext(source, context);
  for (const url of [href, "https://example.test/Sistema-Escolar/restablecer.html", "https://example.test/?oobCode=privado"]) {
    let response;
    callbacks.get("fetch")({ request: { url, method: "GET", mode: "navigate" }, respondWith(value) { response = value; } });
    assert.equal(await response, "red");
    assert.equal(requests.at(-1).options.cache, "no-store");
  }
});

test("la pagina retira el codigo del historial y carga aun si CacheStorage esta bloqueado", async () => {
  const source = readFileSync(new URL("../src/restablecer.js", import.meta.url), "utf8").replace(/^import .*;\r?$/gm, "").replaceAll("import.meta.env.BASE_URL", '"./"');
  let cleanPath; let input; let redirect;
  const location = { href, pathname: "/Sistema-Escolar/restablecer.html", replace(value) { redirect = value; } };
  const root = { innerHTML: "" };
  const context = vm.createContext({
    URL, leerAccionCorreo, destinoAccionFirebase, firebaseConfig: { apiKey: "prueba", authDomain: "colegio.firebaseapp.com" }, authRecuperacion: {},
    window: { location, caches: {}, history: { replaceState(_, __, path) { cleanPath = path; } }, addEventListener() {} },
    caches: { keys: async () => { throw new Error("Almacenamiento bloqueado"); } },
    document: { getElementById: () => root }, RestablecerContrasenaView: () => "pagina",
    bindRestablecerContrasena(_, value) { input = value; return { desmontar() {} }; }
  });
  vm.runInContext(source, context); await settle();
  assert.equal(cleanPath, "/Sistema-Escolar/restablecer.html");
  assert.equal(input.code, code); assert.equal(root.innerHTML, "pagina"); assert.equal(redirect, undefined);
});
