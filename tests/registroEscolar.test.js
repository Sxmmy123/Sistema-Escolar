import assert from "node:assert/strict";
import test from "node:test";
import { estadoRegistroEscolar, fechaVisibleEscolar, validarFechaGestion } from "../src/services/registroEscolar.js";
import { asegurarRegistroDocente, establecerConfiguracion } from "../src/services/rutasFirestore.js";
import { estadoMenuLateral } from "../src/ui/menuLateral.js";
import { renderGestionEscolar } from "../src/modules/admin/GestionEscolarAdmin.js";
import { importHistoricalAttendance, importHistoricalGrades } from "../src/services/adminData.js";
import { saveActivity, saveAttendance, saveGrade, saveInternalActivity, saveTeacherTrimesterPreference, updateActivity, deleteActivity, finalizeActivityReview } from "../src/services/teacherData.js";

const ahora = new Date("2026-10-07T16:00:00Z");
const habilitada = { gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: true };

test("solo el ano actual habilitado permite registrar; los anteriores quedan para consulta", () => {
  assert.equal(estadoRegistroEscolar(habilitada, ahora).habilitada, true);
  for (const cambio of [{ gestionHabilitada: false }, { versionModelo: 0 }, { gestionActivaId: "2025" }, { gestionActivaId: "2027" }]) {
    assert.equal(estadoRegistroEscolar({ ...habilitada, ...cambio }, ahora).habilitada, false);
  }
  assert.equal(estadoRegistroEscolar({}, ahora).habilitada, false);
  assert.equal(estadoRegistroEscolar(habilitada, new Date("2027-01-01T03:59:59Z")).habilitada, true);
  assert.equal(estadoRegistroEscolar(habilitada, new Date("2027-01-01T04:00:00Z")).habilitada, false);
});

test("las fechas deben existir y pertenecer a la gestion; el almacenamiento sigue usando ISO completo", () => {
  assert.equal(validarFechaGestion("2026-10-12", "2026"), "2026-10-12");
  assert.equal(validarFechaGestion("", "2026", { opcional: true }), "");
  assert.throws(() => validarFechaGestion("2027-01-01", "2026"), /no pertenece/);
  for (const fecha of ["", "2026-02-29", "2026-04-31", "2026-13-01", "12/10/2026"]) assert.throws(() => validarFechaGestion(fecha, "2026"), /no es valida/);
  assert.equal(validarFechaGestion("2028-02-29", "2028"), "2028-02-29");
});

test("la fecha visible tiene dia de semana, dia y mes, sin repetir el ano", () => {
  const visible = fechaVisibleEscolar("2026-10-12");
  assert.match(visible, /Lunes.*12.*octubre/);
  assert.doesNotMatch(visible, /2026/);
});

test("ninguna escritura academica del docente llega a Firebase sin gestion habilitada", async () => {
  establecerConfiguracion({ ...habilitada, gestionHabilitada: false });
  assert.throws(() => asegurarRegistroDocente(ahora), /Solo consulta/);
  for (const guardar of [saveAttendance, saveActivity, saveInternalActivity, updateActivity, deleteActivity, saveGrade, finalizeActivityReview, saveTeacherTrimesterPreference]) {
    await assert.rejects(guardar({}), (error) => error.code === "gestion/no-habilitada");
  }
});

test("una carga historica rechaza fechas de otro ano antes de hacer consultas o escrituras", async () => {
  establecerConfiguracion(habilitada);
  await assert.rejects(importHistoricalAttendance({ course: { id: "cuarto_a" }, trimestreId: "t2", rows: [{ fecha: "2027-01-01" }] }), /no pertenece/);
  await assert.rejects(importHistoricalGrades({ course: { id: "cuarto_a" }, materiaId: "matematica", trimestreId: "t2", activities: [{ fecha: "2027-01-01" }], rows: [{}] }), /no pertenece/);
});

test("el administrador puede habilitar una gestion cuyo documento anual falta", () => {
  const html = renderGestionEscolar({ ...habilitada, gestionHabilitada: false }, ["2026"], ahora);
  assert.match(html, /Habilitar ano escolar/);
  assert.match(html, /data-iniciar-gestion="2026"/);
  assert.doesNotMatch(html, /type="number"/);
});

test("el sidebar de escritorio compartido nunca queda inert; el menu movil si se oculta", () => {
  assert.deepEqual(estadoMenuLateral(false, false), { abierto: false, oculto: false, contenidoBloqueado: false });
  assert.equal(estadoMenuLateral(false, true).oculto, false);
  assert.deepEqual(estadoMenuLateral(true, false), { abierto: false, oculto: true, contenidoBloqueado: false });
  assert.deepEqual(estadoMenuLateral(true, true), { abierto: true, oculto: false, contenidoBloqueado: true });
  assert.equal(estadoMenuLateral(false, false, true).oculto, true);
});
