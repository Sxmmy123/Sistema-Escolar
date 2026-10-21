import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { crearCargaPorRol } from "../src/modules/cargaPorRol.js";

const roles = ["admin", "docente", "director", "alumno"];
const codigoPrincipal = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

function diferida() {
  let resolver;
  const promesa = new Promise((resolve) => { resolver = resolve; });
  return { promesa, resolver };
}

function aplicacion(importadorEspecial = {}) {
  let html = "";
  let autenticar;
  let observar;
  let configuracion = { versionModelo: 2, gestionActivaId: "2026", gestionHabilitada: true };
  const descargados = [];
  const vinculados = [];
  const desmontados = [];
  const errores = [];
  const modulos = Object.fromEntries(roles.map((rol) => [rol, {
    rutas: Object.fromEntries([`/${rol}`, `/${rol}/notas`, `/${rol}/asistencia`, `/${rol}/boleta`].map((ruta) => [ruta, () => `Pantalla ${ruta}`])),
    actualizarIconos() {},
    vincular: (ruta) => vinculados.push(ruta),
    desmontar: () => desmontados.push(rol)
  }]));
  const importadores = Object.fromEntries(roles.map((rol) => [rol, () => {
    descargados.push(rol);
    return importadorEspecial[rol]?.(modulos[rol]) ?? modulos[rol];
  }]));
  const auth = { currentUser: null };
  const clases = { remove() {}, toggle() {}, contains: () => false };
  const contexto = vm.createContext({
    AbortController, console: { error: (...args) => errores.push(args), warn() {} },
    window: { location: { hash: "#/", reload() {} }, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
    document: { body: { classList: clases }, documentElement: { classList: clases }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    sessionStorage: { setItem() {}, clear() {} },
    auth, firestore: {}, VERSION_MODELO: 2,
    crearCargaPorRol: () => crearCargaPorRol(importadores),
    createIcons() {}, LogIn: {}, registerServiceWorker() {}, bindRegistroDocente() {},
    setView: (markup) => { html = markup; },
    LoginView: () => "Pantalla login", bindLogin() {},
    homeForRole: (rol) => rol ? `/${rol}` : "/",
    routeRequiredRole: (ruta) => roles.find((rol) => ruta.startsWith(`/${rol}`)) || "",
    resolveUserRole: async (usuario) => usuario.rol,
    cargarConfiguracion: async () => {},
    configuracionActual: () => configuracion,
    establecerConfiguracion: (valor) => { configuracion = valor; },
    observarConfiguracion: (_, callback) => { observar = callback; return () => {}; },
    gestionDelCalendario: () => "2026",
    gestionAdministrativaDisponible: (config) => config.gestionHabilitada,
    setInterval() {},
    onAuthStateChanged: (_, callback) => { autenticar = callback; },
    signOut: async () => { auth.currentUser = null; await autenticar(null); }
  });
  // Ejecuta el router real sustituyendo solamente sus dependencias externas.
  vm.runInContext(codigoPrincipal.replace(/^import .*;\r?$/gm, ""), contexto);
  return {
    modulos, descargados, vinculados, desmontados, errores,
    html: () => html,
    async sesion(rol, uid = rol) {
      auth.currentUser = rol ? { uid, email: `${rol}@example.test`, rol } : null;
      await autenticar(auth.currentUser);
    },
    render: () => contexto.render(),
    async navegar(ruta) { contexto.window.location.hash = `#${ruta}`; await contexto.render(); },
    fijarRuta: (ruta) => { contexto.window.location.hash = `#${ruta}`; },
    ruta: () => contexto.window.location.hash,
    configurar: (valor) => { configuracion = valor; },
    cambiarAutenticacion: (usuario) => { auth.currentUser = usuario; },
    cambiarGestion: (valor) => observar(valor)
  };
}

test("crear el cargador no descarga ningun rol y rechaza roles desconocidos", async () => {
  let llamadas = 0;
  const carga = crearCargaPorRol({ docente: () => { llamadas++; } });
  assert.equal(carga.obtener("docente"), undefined);
  await assert.rejects(carga.cargar("director"), /Rol no disponible/);
  await assert.rejects(carga.cargar("toString"), /Rol no disponible/);
  assert.equal(llamadas, 0);
});

test("las solicitudes simultaneas y la navegacion reutilizan la descarga del rol", async () => {
  const pendiente = diferida();
  let llamadas = 0;
  const carga = crearCargaPorRol({ docente: () => { llamadas++; return pendiente.promesa; } });
  const primera = carga.cargar("docente");
  assert.strictEqual(primera, carga.cargar("docente"));
  const modulo = { rutas: {} };
  pendiente.resolver(modulo);
  assert.strictEqual(await primera, modulo);
  assert.strictEqual(carga.obtener("docente"), modulo);
  assert.strictEqual(await carga.cargar("docente"), modulo);
  assert.equal(llamadas, 1);
});

test("una descarga fallida se puede reintentar", async () => {
  let llamadas = 0;
  const modulo = {};
  const carga = crearCargaPorRol({ alumno: () => {
    if (++llamadas === 1) throw new Error("Sin conexion");
    return modulo;
  } });
  await assert.rejects(carga.cargar("alumno"), /Sin conexion/);
  assert.equal(carga.obtener("alumno"), undefined);
  assert.strictEqual(await carga.cargar("alumno"), modulo);
  assert.equal(llamadas, 2);
});

test("el login y una URL de rol sin sesion no descargan pantallas privadas", async () => {
  const app = aplicacion();
  await app.sesion(null);
  await app.navegar("/docente/notas");
  await app.render();
  assert.equal(app.ruta(), "#/");
  assert.equal(app.html(), "Pantalla login");
  assert.deepEqual(app.descargados, []);
});

for (const rol of roles) {
  test(`la sesion ${rol} descarga solamente su rol y conserva la navegacion`, async () => {
    const app = aplicacion();
    app.fijarRuta(`/${rol}`);
    await app.sesion(rol);
    await app.render();
    await app.navegar(`/${rol}/notas`);
    await app.navegar(`/${rol}`);
    assert.deepEqual(app.descargados, [rol]);
    assert.equal(app.html(), `Pantalla /${rol}`);
    assert.deepEqual(app.desmontados, []);
    assert.deepEqual(app.errores, []);
  });
}

test("una ruta de otro rol no descarga sus modulos", async () => {
  const app = aplicacion();
  app.fijarRuta("/director/notas");
  await app.sesion("docente");
  await app.render();
  assert.equal(app.ruta(), "#/docente");
  assert.deepEqual(app.descargados, ["docente"]);
});

test("el bloqueo de gestion se conserva antes de descargar las pantallas del docente", async () => {
  const app = aplicacion();
  app.configurar({ gestionActivaId: "2026", versionModelo: 0, gestionHabilitada: false });
  app.fijarRuta("/docente/notas");
  await app.sesion("docente");
  await app.render();
  assert.match(app.html(), /Gestion escolar pendiente/);
  assert.deepEqual(app.descargados, []);
});

test("sin gestion habilitada el admin vuelve al inicio, no al modulo de registro", async () => {
  const app = aplicacion();
  app.configurar({ gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: false });
  app.fijarRuta("/admin/notas");
  await app.sesion("admin");
  await app.render();
  assert.equal(app.ruta(), "#/admin");
  assert.equal(app.html(), "Pantalla /admin");
  assert.deepEqual(app.descargados, ["admin"]);
});

test("una URL desconocida vuelve al inicio del rol, no al login", async () => {
  const app = aplicacion();
  app.fijarRuta("/docente/inexistente");
  await app.sesion("docente");
  await app.render();
  assert.equal(app.ruta(), "#/docente");
  await app.render();
  assert.equal(app.html(), "Pantalla /docente");
  assert.deepEqual(app.descargados, ["docente"]);
});

test("cerrar sesion mientras se descarga un rol no restaura su pantalla", async () => {
  const pendiente = diferida();
  const app = aplicacion({ docente: () => pendiente.promesa });
  app.fijarRuta("/docente");
  await app.sesion("docente");
  const renderPendiente = app.render();
  await app.sesion(null);
  await app.navegar("/");
  pendiente.resolver(app.modulos.docente);
  await renderPendiente;
  assert.equal(app.html(), "Pantalla login");
  assert.deepEqual(app.vinculados, []);
});

test("si Firebase cambia de usuario antes del callback no se monta la descarga anterior", async () => {
  const pendiente = diferida();
  const app = aplicacion({ docente: () => pendiente.promesa });
  app.fijarRuta("/docente");
  await app.sesion("docente");
  const anterior = app.render();
  app.cambiarAutenticacion({ uid: "otro" });
  pendiente.resolver(app.modulos.docente);
  await anterior;
  assert.deepEqual(app.vinculados, []);
});

test("la ultima ruta prevalece cuando cambia durante la descarga", async () => {
  const pendiente = diferida();
  const app = aplicacion({ docente: () => pendiente.promesa });
  app.fijarRuta("/docente");
  await app.sesion("docente");
  const anterior = app.render();
  const actual = app.navegar("/docente/notas");
  pendiente.resolver(app.modulos.docente);
  await Promise.all([anterior, actual]);
  assert.equal(app.html(), "Pantalla /docente/notas");
  assert.deepEqual(app.vinculados, ["/docente/notas"]);
  assert.deepEqual(app.descargados, ["docente"]);
});

test("una sesion nueva no puede ser sustituida por la descarga de otra", async () => {
  const pendiente = diferida();
  const app = aplicacion({ docente: () => pendiente.promesa });
  app.fijarRuta("/docente");
  await app.sesion("docente", "anterior");
  const anterior = app.render();
  app.fijarRuta("/alumno");
  await app.sesion("alumno", "nuevo");
  await app.render();
  pendiente.resolver(app.modulos.docente);
  await anterior;
  assert.equal(app.html(), "Pantalla /alumno");
  assert.ok(app.vinculados.every((ruta) => ruta.startsWith("/alumno")));
});

test("el cambio de gestion invalida la pantalla que se estaba descargando", async () => {
  const pendiente = diferida();
  const app = aplicacion({ docente: () => pendiente.promesa });
  app.fijarRuta("/docente");
  await app.sesion("docente");
  const anterior = app.render();
  app.cambiarGestion({ gestionActivaId: "2027", versionModelo: 2, gestionHabilitada: true });
  pendiente.resolver(app.modulos.docente);
  await anterior;
  assert.match(app.html(), /La gestion escolar cambio/);
  assert.deepEqual(app.vinculados, []);
});

test("el cambio de sesion desmonta los listeners del rol anterior", async () => {
  const app = aplicacion();
  app.fijarRuta("/docente");
  await app.sesion("docente");
  await app.render();
  await app.sesion(null);
  await app.navegar("/");
  assert.deepEqual(app.desmontados, ["docente"]);
});

test("el router muestra reintento sin expulsar al usuario por un error de descarga", async () => {
  let intentos = 0;
  const app = aplicacion({ alumno: (modulo) => {
    if (++intentos === 1) throw new Error("Sin conexion");
    return modulo;
  } });
  app.fijarRuta("/alumno");
  await app.sesion("alumno");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(app.html(), /data-retry-module/);
  await app.render();
  assert.equal(app.html(), "Pantalla /alumno");
  assert.equal(app.ruta(), "#/alumno");
});
