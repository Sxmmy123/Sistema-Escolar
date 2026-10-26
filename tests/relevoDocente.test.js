import test from "node:test";
import assert from "node:assert/strict";
import { exigirTrimestreDocente, planificarRelevo, puedeRegistrarTrimestre, trimestresDeAsignacion } from "../src/services/relevoDocente.js";
import { validarRegistroInicial } from "../src/services/modeloInicial.js";
import { findCourse } from "../src/data/catalog.js";

const assignment = { cursos: { cuarto_a: { materias: ["matematica", "ciencias_naturales"] } } };

test("las asignaciones existentes mantienen sus tres trimestres sin migraciones", () => {
  assert.deepEqual(trimestresDeAsignacion(assignment), ["t1", "t2", "t3"]);
  assert.equal(puedeRegistrarTrimestre(assignment, "t4"), false);
  assert.deepEqual(trimestresDeAsignacion({ trimestres: [] }), []);
  assert.deepEqual(trimestresDeAsignacion({ trimestres: "t1" }), []);
  assert.deepEqual(trimestresDeAsignacion({ trimestres: ["t2", "invalido"] }), []);
});

test("relevo en segundo trimestre conserva primero y hereda cursos y materias sin modificar el origen", () => {
  const before = structuredClone(assignment);
  const plan = planificarRelevo(assignment, "t2");
  assert.deepEqual(plan.anteriores, ["t1"]);
  assert.deepEqual(plan.siguientes, ["t2", "t3"]);
  assert.deepEqual(plan.cursos, assignment.cursos);
  assert.equal(plan.modality.modalidadEvaluacion, "cuantitativa");
  assert.deepEqual(assignment, before);
});

test("un segundo relevo en tercero permite la cadena A primero, B segundo, C tercero", () => {
  const plan = planificarRelevo({ ...assignment, trimestres: ["t2", "t3"], reemplazoDeUid: "a" }, "t3");
  assert.deepEqual(plan.anteriores, ["t2"]);
  assert.deepEqual(plan.siguientes, ["t3"]);
  assert.throws(() => planificarRelevo({ ...assignment, reemplazadoPorUid: "b" }, "t3"), /ya tiene un reemplazo/);
  assert.throws(() => planificarRelevo({ ...assignment, trimestres: ["t2", "t3"] }, "t2"), /separar/);
});

test("se rechazan trimestres faltantes y no se mezclan modalidades al reemplazar", () => {
  for (const term of ["", "t1", "t4", null]) assert.throws(() => planificarRelevo(assignment, term));
  assert.throws(() => planificarRelevo({ cursos: { inicial: { materias: [] }, cuarto_a: { materias: ["matematica"] } } }, "t2"), /combinar/);
});

test("Inicial y Preinicial conservan ambos cursos cualitativos al reemplazar", () => {
  const plan = planificarRelevo({ cursos: { inicial: { materias: [] }, preinicial: { materias: [] } } }, "t3");
  assert.equal(plan.modality.modalidadEvaluacion, "cualitativa");
  assert.deepEqual(Object.keys(plan.cursos), ["inicial", "preinicial"]);
  assert.deepEqual(plan.anteriores, ["t1", "t2"]);
  assert.deepEqual(plan.siguientes, ["t3"]);
});

test("un reemplazo no puede registrar en el trimestre anterior aunque modifique el formulario", () => {
  const context = { gestionId: "2026", courses: [findCourse("inicial")], trimestres: ["t2", "t3"] };
  const record = { cursoId: "inicial", trimestreId: "t1", tipo: "diario", fecha: "2026-03-10", alumnoId: "a", estado: "apoyo" };
  assert.throws(() => exigirTrimestreDocente(context, "t1"), /consulta/);
  assert.throws(() => validarRegistroInicial(context, record), /consulta/);
  assert.equal(validarRegistroInicial(context, { ...record, trimestreId: "t2" }).trimestreId, "t2");
});
