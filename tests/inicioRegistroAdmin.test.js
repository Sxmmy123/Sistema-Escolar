import assert from "node:assert/strict";
import test from "node:test";
import { gestionAdministrativaDisponible } from "../src/services/registroEscolar.js";
import { establecerConfiguracion } from "../src/services/rutasFirestore.js";
import { AdminDashboard } from "../src/modules/admin/AdminDashboard.js";
import { PASOS_REGISTRO, programarGuiaRegistro, tieneGuiaRegistro, completarGuiaRegistro, renderGuiaRegistroAdmin, bindGuiaRegistroAdmin } from "../src/modules/admin/InicioRegistroAdmin.js";

const configurada = { gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: true };

function memoria() {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: (key) => items.delete(key) };
}

test("el registro administrativo requiere un modelo preparado y documento anual habilitado", () => {
  assert.equal(gestionAdministrativaDisponible({}), false);
  assert.equal(gestionAdministrativaDisponible({ ...configurada, versionModelo: 0 }), false);
  assert.equal(gestionAdministrativaDisponible({ ...configurada, gestionHabilitada: false }), false);
  assert.equal(gestionAdministrativaDisponible(configurada), true);
  assert.equal(gestionAdministrativaDisponible({ ...configurada, gestionActivaId: "2025" }), true);
});

test("antes de confirmar el ano no hay enlaces de registro ni contadores que cargar", () => {
  for (const config of [{ ...configurada, versionModelo: 0 }, { ...configurada, gestionHabilitada: false }]) {
    establecerConfiguracion(config);
    const html = AdminDashboard();
    assert.match(html, /aria-disabled="true"/);
    assert.match(html, /data-confirmar-ano/);
    assert.doesNotMatch(html, /href="#\/admin\/(alumnos|docentes|horarios|director|auditoria|carga-historica)"/);
    assert.doesNotMatch(html, /data-admin-count|data-admin-guide/);
  }
});

test("confirmar la gestion desbloquea los accesos y respeta el orden de configuracion", () => {
  establecerConfiguracion(configurada);
  const html = AdminDashboard();
  assert.doesNotMatch(html, /aria-disabled="true"|data-confirmar-ano/);
  assert.match(html, /href="#\/admin\/alumnos"/);
  assert.match(html, /data-admin-count/);
  assert.deepEqual(PASOS_REGISTRO.map((paso) => paso.titulo), ["Alumnos", "Docentes", "Horarios", "Director"]);
  const guia = renderGuiaRegistroAdmin("2026");
  assert.match(guia, /Gestion 2026 habilitada/);
  assert.match(guia, /Empezar a registrar/);
  assert.ok(guia.indexOf("Alumnos") < guia.indexOf("Docentes"));
  assert.ok(guia.indexOf("Docentes") < guia.indexOf("Horarios"));
  assert.ok(guia.indexOf("Horarios") < guia.indexOf("Director"));
  assert.equal(renderGuiaRegistroAdmin('<script>'), "");
});

test("la guia sobrevive la recarga pero no se repite tras comenzar", () => {
  const storage = memoria();
  assert.equal(tieneGuiaRegistro("admin", "2026", storage), false);
  assert.equal(programarGuiaRegistro("admin", "2026", storage), true);
  assert.equal(tieneGuiaRegistro("admin", "2026", storage), true);
  completarGuiaRegistro("admin", "2026", storage);
  assert.equal(tieneGuiaRegistro("admin", "2026", storage), false);
  programarGuiaRegistro("admin", "2027", storage);
  assert.equal(tieneGuiaRegistro("admin", "2027", storage), true);
});

test("la guia pendiente pertenece exclusivamente a su administrador y gestion", () => {
  const storage = memoria();
  programarGuiaRegistro("admin", "2026", storage);
  assert.equal(tieneGuiaRegistro("otro", "2026", storage), false);
  assert.equal(tieneGuiaRegistro("admin", "2027", storage), false);
  completarGuiaRegistro("otro", "2026", storage);
  assert.equal(tieneGuiaRegistro("admin", "2026", storage), true);
  assert.equal(programarGuiaRegistro("", "2026", storage), false);
  assert.equal(programarGuiaRegistro("admin", "invalida", storage), false);
});

test("un fallo del almacenamiento de la guia no bloquea los modulos", () => {
  const storage = { getItem() { throw new Error("Bloqueado"); }, setItem() { throw new Error("Bloqueado"); } };
  assert.equal(programarGuiaRegistro("admin", "2026", storage), false);
  assert.equal(tieneGuiaRegistro("admin", "2026", storage), false);
  assert.doesNotThrow(() => completarGuiaRegistro("admin", "2026", storage));
});

test("empezar abre Alumnos y cerrar o Escape da por terminada la guia", (t) => {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, "document");
  t.after(() => {
    if (anterior) Object.defineProperty(globalThis, "document", anterior);
    else delete globalThis.document;
  });
  for (const accion of ["empezar", "cerrar", "escape"]) {
    const storage = memoria();
    programarGuiaRegistro("admin", "2026", storage);
    const eventos = new Map();
    const acciones = new Map();
    let destino = "";
    const dialog = {
      open: false,
      showModal() { this.open = true; },
      close() { this.open = false; eventos.get("close")?.(); },
      addEventListener(name, fn) { eventos.set(name, fn); },
      querySelector(name) { return { addEventListener: (_, fn) => acciones.set(name, fn) }; }
    };
    globalThis.document = { querySelector: () => dialog };
    const opciones = { uid: "admin", configuracion: configurada, storage, navegar: () => { destino = "alumnos"; } };
    assert.equal(bindGuiaRegistroAdmin(opciones), true);
    assert.equal(dialog.open, true);
    assert.equal(bindGuiaRegistroAdmin(opciones), false);
    if (accion === "escape") dialog.close();
    else acciones.get(accion === "empezar" ? "[data-empezar-registro]" : "[data-cerrar-guia]")();
    assert.equal(dialog.open, false);
    assert.equal(destino, accion === "empezar" ? "alumnos" : "");
    assert.equal(tieneGuiaRegistro("admin", "2026", storage), false);
    assert.equal(bindGuiaRegistroAdmin(opciones), false);
  }
});
