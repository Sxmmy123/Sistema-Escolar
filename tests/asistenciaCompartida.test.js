import assert from "node:assert/strict";
import test from "node:test";
import { attendancePercent, attendanceTotals } from "../src/services/directorData.js";
import { isAttendanceValue, isPunctualValue, normalizarEstadoAsistencia } from "../src/services/calculoAcademico.js";
import { attendanceLabel, attendanceShort, attendanceTone } from "../src/modules/docente/AcademicoDocente.js";

test("Licencia y Permiso tienen el mismo porcentaje, total e identificacion visual", () => {
  const estados = ["presente", "atraso", "permiso", "licencia", " LICENCIA ", "falta"];
  const records = estados.map((estado) => ({ estado }));
  assert.equal(attendancePercent(records), Math.round(5 / 6 * 100));
  assert.deepEqual(attendanceTotals(records), { presente: 1, atraso: 1, permiso: 3, falta: 1 });
  for (const state of estados.slice(2, 5)) {
    assert.equal(normalizarEstadoAsistencia(state), "permiso");
    assert.equal(isAttendanceValue(state), true);
    assert.equal(isPunctualValue(state), true);
    assert.equal(attendanceShort(state), "L");
    assert.equal(attendanceLabel(state), attendanceLabel("permiso"));
    assert.equal(attendanceTone(state), attendanceTone("permiso"));
  }
});

test("la estadistica del director coincide con los estados validos del alumno", () => {
  const records = ["presente", "licencia", "falta", "permiso", "atraso"].map((estado) => ({ estado }));
  const alumnoPercent = Math.round(records.filter((item) => isAttendanceValue(item.estado)).length / records.length * 100);
  assert.equal(attendancePercent(records), alumnoPercent);
  assert.equal(attendancePercent([]), 0);
  assert.equal(isAttendanceValue("falta"), false);
  assert.equal(isAttendanceValue(""), false);
  assert.equal(isPunctualValue("atraso"), false);
});
