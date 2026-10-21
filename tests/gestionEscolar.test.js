import assert from "node:assert/strict";
import test from "node:test";
import { gestionDelCalendario } from "../src/services/fechaEscolar.js";
import { estadoGestionEscolar, renderGestionEscolar } from "../src/modules/admin/GestionEscolarAdmin.js";

const actual2026 = new Date("2026-10-06T16:00:00Z");
const actual2027 = new Date("2027-01-10T16:00:00Z");
const configurada = { gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: true };

test("la bienvenida inicial solo permite iniciar el ano del calendario", () => {
  const html = renderGestionEscolar({ gestionActivaId: "2025", versionModelo: 0 }, [], actual2026);
  assert.match(html, /Bienvenido al sistema/);
  assert.match(html, /data-iniciar-gestion="2026"/);
  assert.match(html, /type="radio".*data-confirmar-ano value="2026"/);
  assert.match(html, /data-iniciar-gestion="2026" disabled/);
  assert.doesNotMatch(html, /type="number"|<select|Cambiar gestion|Preparar gestion/);
});

test("una gestion configurada del ano actual solo muestra el ano, sin editor ni nueva bienvenida", () => {
  const html = renderGestionEscolar(configurada, ["2026"], actual2026);
  assert.match(html, /Gestion 2026/);
  assert.doesNotMatch(html, /Bienvenido|data-iniciar-gestion|<input|<select|Cambiar gestion/);
  assert.equal(estadoGestionEscolar(configurada, actual2026).nuevoAno, false);
});

test("un nuevo ano ofrece iniciarlo sin cambiar automaticamente la gestion guardada", () => {
  const estado = estadoGestionEscolar(configurada, actual2027, ["2026"]);
  assert.equal(estado.activa, "2026");
  assert.equal(estado.calendario, "2027");
  assert.equal(estado.nuevoAno, true);
  const html = renderGestionEscolar(configurada, ["2026"], actual2027);
  assert.match(html, /La gestion activa sigue siendo 2026/);
  assert.match(html, /data-iniciar-gestion="2027"/);
  assert.doesNotMatch(html, /<input/);
});

test("el selector contiene solo anos ya registrados y nunca anos futuros", () => {
  const html = renderGestionEscolar({ gestionActivaId: "2027", versionModelo: 2, gestionHabilitada: true }, ["2026", "2027", "2028", "2026", "otro"], actual2027);
  assert.match(html, /data-seleccionar-gestion/);
  assert.match(html, /<option value="2027" selected/);
  assert.match(html, /<option value="2026"/);
  assert.doesNotMatch(html, /2028|value="otro"|data-iniciar-gestion/);
});

test("volver a una gestion anterior ofrece activar el ano actual que ya existe", () => {
  const html = renderGestionEscolar(configurada, ["2026", "2027"], actual2027);
  assert.match(html, /data-iniciar-gestion="2027"/);
  assert.match(html, /Activar 2027/);
  assert.doesNotMatch(html, /Iniciar 2027/);
});

test("el cambio de ano usa la hora boliviana y no adelanta la gestion por el reloj UTC", () => {
  const antes = new Date("2027-01-01T03:59:59Z");
  const despues = new Date("2027-01-01T04:00:00Z");
  assert.equal(gestionDelCalendario(antes), "2026");
  assert.equal(gestionDelCalendario(despues), "2027");
  assert.equal(estadoGestionEscolar(configurada, antes).nuevoAno, false);
  assert.equal(estadoGestionEscolar(configurada, despues).nuevoAno, true);
});
