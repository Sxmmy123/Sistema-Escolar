import assert from "node:assert/strict";
import test from "node:test";
import { registrarAlumnosConAcceso } from "../src/services/registroAlumnos.js";
import { studentPasswordForNewAccess } from "../src/services/identidadAlumno.js";

const course = { id: "cuarto_a" };

test("registro de nombre y CI prepara el acceso nuevo con la clave predeterminada", async () => {
  const student = { id: "nuevo", nombre: "ALUMNO PRUEBA", ci: "9900001" };
  const llamadas = [];
  const result = await registrarAlumnosConAcceso(course, "ALUMNO PRUEBA\t9900001", {
    importar: async (selected, text) => { llamadas.push(["registro", selected.id, text]); return [student]; },
    crearAcceso: async (pupil, selected) => {
      llamadas.push(["acceso", pupil.id, selected.id]);
      return { created: true, password: studentPasswordForNewAccess() };
    }
  });
  assert.deepEqual(llamadas.map((item) => item[0]), ["registro", "acceso"]);
  assert.equal(result.creados, 1);
  assert.deepEqual(result.pendientes, []);
  assert.equal("password" in result.students[0], false);
});

test("una cuenta existente no vuelve a crearse ni cambia su contrasena", async () => {
  const student = { id: "existente", nombre: "ALUMNO PRUEBA", ci: "9900001", authUid: "uid-existente" };
  const result = await registrarAlumnosConAcceso(course, "ALUMNO PRUEBA\t9900001", {
    importar: async () => [student],
    crearAcceso: async () => assert.fail("No debe tocar una cuenta existente")
  });
  assert.equal(result.existentes, 1);
  assert.equal(result.creados, 0);
});

test("un error de Auth se informa sin borrar alumnos ni impedir los otros accesos", async () => {
  const students = [{ id: "a", nombre: "ALUMNO A", ci: "9900001" }, { id: "b", nombre: "ALUMNO B", ci: "9900002" }];
  const progress = [];
  const result = await registrarAlumnosConAcceso(course, "ALUMNO A\t9900001\nALUMNO B\t9900002", {
    importar: async () => students,
    crearAcceso: async (student) => {
      if (student.id === "a") throw new Error("Cuota excedida");
      return { created: true };
    },
    onProgress: (current, total) => progress.push([current, total])
  });
  assert.equal(result.students.length, 2);
  assert.equal(result.creados, 1);
  assert.deepEqual(result.pendientes, [{ alumnoId: "a", nombre: "ALUMNO A", error: "Cuota excedida" }]);
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
});

test("sin nombre y CI validos no escribe alumnos ni crea accesos", async () => {
  for (const raw of ["", "ALUMNO SIN CI", "ALUMNO\tCI/INVALIDO", "ALUMNO\t9900001\nOTRO\t9900001"]) {
    await assert.rejects(registrarAlumnosConAcceso(course, raw, {
      importar: async () => assert.fail("No debe importar"),
      crearAcceso: async () => assert.fail("No debe crear acceso")
    }));
  }
});

test("si falla el registro no comienza a crear cuentas", async () => {
  await assert.rejects(registrarAlumnosConAcceso(course, "ALUMNO PRUEBA\t9900001", {
    importar: async () => { throw new Error("Gestion no habilitada"); },
    crearAcceso: async () => assert.fail("No debe crear acceso")
  }), /Gestion no habilitada/);
});
