import assert from "node:assert/strict";
import test from "node:test";
import { actividadPendienteRegularizacion, revisionDisponibleParaRegularizar } from "../src/services/revisionActividad.js";

const today = "2026-09-25";
const activity = { fecha: today, regularizacionDesde: today };

test("una actividad abierta sigue pendiente de calificar, no de regularizar", () => {
  for (const estadoRevision of ["sin_iniciar", "en_proceso"]) {
    assert.equal(revisionDisponibleParaRegularizar({ ...activity, estadoRevision }, today), false);
    assert.equal(actividadPendienteRegularizacion({ ...activity, estadoRevision }, null, today), false);
  }
});

test("al cerrar la revision se muestran solo alumnos sin nota positiva", () => {
  const closed = { ...activity, estadoRevision: "cerrada" };
  assert.equal(actividadPendienteRegularizacion(closed, null, today), true);
  assert.equal(actividadPendienteRegularizacion(closed, { valor: 0 }, today), true);
  assert.equal(actividadPendienteRegularizacion(closed, { valor: 80 }, today), false);
});

test("la fecha de disponibilidad impide mostrar pendientes antes de tiempo", () => {
  const closed = { ...activity, estadoRevision: "cerrada", regularizacionDesde: "2026-09-26" };
  assert.equal(revisionDisponibleParaRegularizar(closed, today), false);
  assert.equal(actividadPendienteRegularizacion({ ...closed, regularizacionDesde: today, fecha: "2026-09-26" }, null, today), false);
});
