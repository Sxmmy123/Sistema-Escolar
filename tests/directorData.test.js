import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { collection, query, queryEqual, where } from "firebase/firestore";
import { firestore } from "../src/firebase/client.js";
import { establecerConfiguracion } from "../src/services/rutasFirestore.js";
import { getDirectorStudentAttendanceWarning } from "../src/services/directorData.js";

const warning = (id, data) => ({ id, data: () => data });

test("los alumnos del director no dependen de la consulta de avisos", async () => {
  const source = await readFile(new URL("../src/services/directorData.js", import.meta.url), "utf8");
  const studentLoader = source.slice(source.indexOf("export async function listDirectorStudents"), source.indexOf("function warningTime"));
  assert.match(studentLoader, /return listarAlumnosMatriculados\(courseId, \{ soloActivos: true \}\)/);
  assert.doesNotMatch(studentLoader, /avisos|Promise\.all|getDocs/);
  assert.doesNotMatch(source, /collectionGroup\(/);
});

test("los avisos se consultan solo para el alumno y la gestion con un indice simple", async () => {
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2 });
  let calls = 0;
  const result = await getDirectorStudentAttendanceWarning("alumno-a", "t1", {
    read: async (actual) => {
      calls += 1;
      const expected = query(collection(firestore, "alumnos", "alumno-a", "avisos"), where("gestionId", "==", "2026"));
      assert.equal(queryEqual(actual, expected), true);
      return { docs: [] };
    }
  });
  assert.equal(result, null);
  assert.equal(calls, 1);
});

test("la advertencia seleccionada es la activa mas reciente del trimestre solicitado", async () => {
  const result = await getDirectorStudentAttendanceWarning("alumno-a", "t1", {
    read: async () => ({ docs: [
      warning("anterior", { activa: true, trimestreId: "t1", updatedAt: { seconds: 10 } }),
      warning("otro-trimestre", { activa: true, trimestreId: "t2", updatedAt: { seconds: 90 } }),
      warning("cerrada", { activa: false, trimestreId: "t1", updatedAt: { seconds: 100 } }),
      warning("vigente", { activa: true, trimestreId: "t1", mensaje: "Mensaje vigente", updatedAt: { toMillis: () => 20000 } })
    ] })
  });
  assert.equal(result.id, "vigente");
  assert.equal(result.mensaje, "Mensaje vigente");
});

test("un fallo de avisos no se presenta como ausencia de advertencia", async () => {
  const error = new Error("permission-denied");
  await assert.rejects(getDirectorStudentAttendanceWarning("alumno-a", "t1", {
    read: async () => { throw error; }
  }), (actual) => actual === error);
});

test("sin alumno no se consulta Firestore", async () => {
  await assert.rejects(getDirectorStudentAttendanceWarning("", "t1", {
    read: async () => { assert.fail("No debe consultar avisos sin alumno"); }
  }), /No se encontro el alumno/);
});

test("el modal permite reintentar sin ocultar el calendario ni reabrir una seleccion cerrada", async () => {
  const source = await readFile(new URL("../src/modules/director/DirectorAttendance.js", import.meta.url), "utf8");
  assert.match(source, /El calendario sigue disponible/);
  assert.match(source, /data-retry-attendance-warning/);
  assert.match(source, /request !== studentModalRequest/);
  assert.match(source, /studentModalRequest \+= 1; holder\.innerHTML = ""/);
});
