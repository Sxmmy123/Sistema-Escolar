import assert from "node:assert/strict";
import test from "node:test";
import { bindAccessConfirmation } from "../src/modules/admin/AccesosAlumnos.js";

function confirmationFixture() {
  const element = () => {
    const classes = new Set();
    return {
      disabled: false, textContent: "", focused: false, handlers: {},
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
      addEventListener(type, handler) { this.handlers[type] = handler; },
      focus() { this.focused = true; }
    };
  };
  const panel = element(), message = element(), confirm = element(), cancel = element();
  const prepare = element(), download = element(), pending = element(), existing = element();
  panel.classList.add("hidden");
  existing.disabled = true;
  const controls = new Map([
    ["[data-access-confirmation]", panel], ["[data-access-confirm-message]", message],
    ["[data-access-confirm]", confirm], ["[data-access-cancel-confirm]", cancel],
    ["[data-prepare-access]", prepare], ["[data-download-access]", download]
  ]);
  const dialog = { isConnected: true, querySelector: (selector) => controls.get(selector), querySelectorAll: () => [pending, existing] };
  return { dialog, panel, message, confirm, cancel, prepare, download, pending, existing, confirmation: bindAccessConfirmation(dialog) };
}

test("crear accesos espera una confirmacion interna y cancelar conserva la seleccion", async () => {
  const ui = confirmationFixture();
  const result = ui.confirmation.request("Crear 16 cuentas?");
  assert.equal(ui.confirmation.isOpen(), true);
  assert.equal(ui.message.textContent, "Crear 16 cuentas?");
  assert.equal(ui.panel.classList.contains("hidden"), false);
  assert.equal(ui.pending.disabled, true);
  assert.equal(ui.cancel.focused, true);
  ui.cancel.handlers.click();
  assert.equal(await result, false);
  assert.equal(ui.pending.disabled, false);
  assert.equal(ui.existing.disabled, true);
  assert.equal(ui.panel.classList.contains("hidden"), true);
  assert.equal(ui.prepare.focused, true);
});

test("confirmar resuelve una sola vez y no permite otra creacion mientras se confirma", async () => {
  const ui = confirmationFixture();
  const first = ui.confirmation.request("Crear cuentas?");
  assert.equal(await ui.confirmation.request("Otra creacion?"), false);
  ui.confirm.handlers.click();
  ui.cancel.handlers.click();
  assert.equal(await first, true);
  assert.equal(ui.confirmation.isOpen(), false);
  assert.equal(ui.download.classList.contains("hidden"), false);
});

test("cancelar al cerrar sesion no autoriza cuentas ni descarta credenciales", async () => {
  const ui = confirmationFixture();
  const result = ui.confirmation.request("Cerrar sin descargar?", "Cerrar sin descargar");
  assert.equal(ui.confirm.textContent, "Cerrar sin descargar");
  ui.dialog.isConnected = false;
  ui.confirmation.cancel();
  assert.equal(await result, false);
  assert.equal(ui.prepare.focused, false);
  assert.equal(await ui.confirmation.request("Crear cuentas?"), false);
});
