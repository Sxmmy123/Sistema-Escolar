import assert from "node:assert/strict";
import test from "node:test";
import { validarCambioActividad, validarEliminacionActividad } from "../src/services/proteccionActividad.js";
import { refreshTeacherBulletinSnapshot } from "../src/services/teacherData.js";

const actividad = {
  cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t2", fecha: "2026-09-22",
  tipo: "tarea", maximo: 100, titulo: "Ejercicios"
};

test("con notas no se modifica la identidad, fecha ni escala de una actividad", () => {
  for (const cambio of [
    { cursoId: "quinto_a" }, { materiaId: "lenguaje" }, { trimestreId: "t3" },
    { fecha: "2026-09-23" }, { tipo: "examen" }, { maximo: 20 }, { calificable: true }
  ]) assert.throws(() => validarCambioActividad(actividad, { ...actividad, ...cambio }, true), /ya tiene calificaciones/);
});

test("el titulo y los materiales se pueden corregir sin alterar las notas", () => {
  assert.doesNotThrow(() => validarCambioActividad(actividad, {
    ...actividad, titulo: "Ejercicios corregidos", materiales: [{ cantidad: 1, material: "Regla" }]
  }, true));
  assert.doesNotThrow(() => validarCambioActividad(actividad, { ...actividad, maximo: "100", calificable: false }, true));
});

test("las actividades sin notas siguen siendo editables y eliminables", () => {
  assert.doesNotThrow(() => validarCambioActividad(actividad, { ...actividad, cursoId: "quinto_a", maximo: 20 }, false));
  assert.doesNotThrow(() => validarEliminacionActividad(false));
  assert.throws(() => validarEliminacionActividad(true), /no se puede eliminar/i);
});

test("actualizar boletin carga los alumnos una sola vez para los tres trimestres", async () => {
  const alumnos = [{ id: "alumno-a", nombre: "Alumno A" }];
  let lecturasAlumnos = 0;
  const trimestres = [];
  const resultados = await refreshTeacherBulletinSnapshot({ uid: "docente-a" }, { id: "cuarto_a" }, {
    loadStudents: async (cursoId) => {
      assert.equal(cursoId, "cuarto_a");
      lecturasAlumnos += 1;
      return alumnos;
    },
    refreshSnapshot: async (context, course, trimestreId, options) => {
      assert.equal(context.uid, "docente-a");
      assert.equal(course.id, "cuarto_a");
      assert.equal(options.students, alumnos);
      trimestres.push(trimestreId);
      return { students: options.students };
    }
  });
  assert.equal(lecturasAlumnos, 1);
  assert.deepEqual(trimestres, ["t1", "t2", "t3"]);
  assert.equal(resultados.length, 3);
});

test("un curso vacio y un error de carga no provocan consultas de trimestres extra", async () => {
  let consultas = 0;
  const loaders = {
    loadStudents: async () => { throw new Error("Sin conexion"); },
    refreshSnapshot: async () => { consultas += 1; }
  };
  assert.deepEqual(await refreshTeacherBulletinSnapshot({}, null, loaders), []);
  await assert.rejects(refreshTeacherBulletinSnapshot({}, { id: "cuarto_a" }, loaders), /Sin conexion/);
  assert.equal(consultas, 0);
});
