import assert from "node:assert/strict";
import test from "node:test";
import { COURSES, INITIAL_COURSES, PRIMARY_COURSES, INITIAL_PERIODS, PRIMARY_PERIODS, findCourse, periodsForCourse } from "../src/data/catalog.js";
import { modalidadDeCursos, modalidadDeContexto, validarAsignacionesDocente } from "../src/services/modalidadDocente.js";
import { crearEntradaDocente } from "../src/modules/docente/cargaDocente.js";
import { createSystemUser } from "../src/services/users.js";
import { calculateCourseTerm } from "../src/services/calculoAcademico.js";
import { importHistoricalGrades } from "../src/services/adminData.js";
import { saveGrade, finalizeActivityReview } from "../src/services/teacherData.js";
import { establecerConfiguracion } from "../src/services/rutasFirestore.js";
import { gestionDelCalendario } from "../src/services/fechaEscolar.js";

const qualitative = { nivelDocente: "inicial", modalidadEvaluacion: "cualitativa" };
const quantitative = { nivelDocente: "primaria", modalidadEvaluacion: "cuantitativa" };
const context = (ids, profile = {}) => ({ courses: ids.map(findCourse), profile });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function modules() {
  const loaded = [];
  const prepared = [];
  const primary = { rutas: { "/docente": () => "Primaria", "/docente/notas": () => "Notas" } };
  const initial = { rutas: { "/docente": () => "Inicial" }, preparar: (value) => prepared.push(value) };
  return { loaded, prepared, primary, initial, imports: {
    primaria: () => { loaded.push("primaria"); return primary; },
    inicial: () => { loaded.push("inicial"); return initial; }
  } };
}

test("Inicial y Preinicial son cursos independientes y conservan su propio horario", () => {
  assert.equal(COURSES.length, 8);
  assert.deepEqual(INITIAL_COURSES.map((course) => course.id), ["preinicial", "inicial"]);
  assert.equal(PRIMARY_COURSES.length, 6);
  for (const course of INITIAL_COURSES) {
    assert.equal(course.modalidadEvaluacion, "cualitativa");
    assert.strictEqual(periodsForCourse(course.id), INITIAL_PERIODS);
  }
  assert.strictEqual(periodsForCourse("cuarto_a"), PRIMARY_PERIODS);
});

test("los IDs anteriores o desconocidos nunca se convierten en otro curso", () => {
  for (const id of ["preinicial_inicial", "inexistente"]) {
    assert.equal(findCourse(id).id, id);
    assert.equal(findCourse(id).requiereRevision, true);
    assert.throws(() => modalidadDeCursos([id]), /anterior o desconocido/);
  }
});

test("un docente puede tener ambos cursos cualitativos o varios de Primaria, nunca mezclados", () => {
  assert.deepEqual(validarAsignacionesDocente({ inicial: { materias: [] }, preinicial: { materias: [] } }), qualitative);
  assert.deepEqual(validarAsignacionesDocente({ cuarto_a: { materias: ["matematica"] }, quinto_a: { materias: ["musica"] } }), quantitative);
  for (const ids of [["inicial", "cuarto_a"], ["cuarto_a", "preinicial"]]) {
    assert.throws(() => modalidadDeCursos(ids), /no puede combinar/);
  }
});

test("las asignaciones requieren cursos validos y no asignan materias numericas a Inicial", () => {
  for (const value of [null, [], {}, { cuarto_a: { materias: [] } }, { cuarto_a: { materias: ["inventada"] } }, { inicial: { materias: ["matematica"] } }]) {
    assert.throws(() => validarAsignacionesDocente(value));
  }
});

test("el alta rechaza una mezcla antes de consultar Firestore o crear Authentication", async () => {
  const clients = { auth: { currentUser: { uid: "admin" } } };
  await assert.rejects(createSystemUser({ nombre: "Prueba", username: "prueba", emailRecuperacion: "prueba@example.test", password: "Temporal123", rol: "docente", asignaciones: { inicial: { materias: [] }, cuarto_a: { materias: ["matematica"] } } }, clients), /no puede combinar/);
});

test("las cuentas antiguas de Primaria siguen funcionando sin metadata nueva", () => {
  assert.deepEqual(modalidadDeContexto(context(["cuarto_a"])), quantitative);
  assert.deepEqual(modalidadDeContexto(context(["preinicial"])), qualitative);
  assert.deepEqual(modalidadDeContexto(context([], qualitative)), qualitative);
  assert.throws(() => modalidadDeContexto(context(["inicial"], quantitative)), /no coincide/);
  assert.throws(() => modalidadDeContexto(context(["inicial"], { modalidadEvaluacion: "cuantitativa" })), /no coincide/);
  assert.throws(() => modalidadDeContexto(context([], { nivelDocente: "inventado" })), /no es valido/);
});

test("un docente cualitativo descarga solo su entrada y no expone rutas numericas", async () => {
  const fixture = modules();
  const entry = crearEntradaDocente(async () => context(["inicial", "preinicial"]), fixture.imports);
  assert.deepEqual(fixture.loaded, []);
  assert.equal(await entry.preparar(), true);
  assert.deepEqual(fixture.loaded, ["inicial"]);
  assert.deepEqual(Object.keys(entry.rutas), ["/docente"]);
  assert.equal(fixture.prepared[0].modalidadEvaluacion, "cualitativa");
  await entry.preparar();
  assert.deepEqual(fixture.loaded, ["inicial"]);
});

test("Primaria conserva sus rutas y no descarga el panel cualitativo", async () => {
  const fixture = modules();
  const entry = crearEntradaDocente(async () => context(["cuarto_a"]), fixture.imports);
  await entry.preparar();
  assert.deepEqual(fixture.loaded, ["primaria"]);
  assert.strictEqual(entry.rutas, fixture.primary.rutas);
});

test("una asignacion anterior o mezclada abre revision administrativa, no notas de Primaria", async () => {
  for (const ids of [["preinicial_inicial"], ["inicial", "cuarto_a"]]) {
    const fixture = modules();
    const entry = crearEntradaDocente(async () => context(ids), fixture.imports);
    await entry.preparar();
    assert.deepEqual(fixture.loaded, ["inicial"]);
    assert.match(fixture.prepared[0].errorModalidad, /Administracion|no puede combinar/);
  }
});

test("cerrar sesion durante la carga de contexto no descarga ni monta pantallas", async () => {
  const pending = deferred();
  const fixture = modules();
  const entry = crearEntradaDocente(() => pending.promise, fixture.imports);
  const loading = entry.preparar();
  entry.desmontar();
  pending.resolve(context(["inicial"]));
  assert.equal(await loading, false);
  assert.deepEqual(fixture.loaded, []);
  assert.deepEqual(entry.rutas, {});
});

test("una descarga de Primaria pendiente no sustituye una nueva cuenta cualitativa", async () => {
  const pending = deferred();
  const fixture = modules();
  let value = context(["cuarto_a"]);
  const entry = crearEntradaDocente(async () => value, { ...fixture.imports, primaria: () => pending.promise });
  const first = entry.preparar();
  await new Promise((resolve) => setImmediate(resolve));
  entry.desmontar();
  value = context(["inicial"]);
  await entry.preparar();
  pending.resolve(fixture.primary);
  assert.equal(await first, false);
  assert.strictEqual(entry.rutas, fixture.initial.rutas);
});

test("una descarga fallida se reintenta sin cambiar la modalidad", async () => {
  const fixture = modules();
  let attempts = 0;
  const entry = crearEntradaDocente(async () => context(["inicial"]), { ...fixture.imports, inicial: () => {
    if (++attempts === 1) throw new Error("Sin conexion");
    return fixture.initial;
  } });
  await assert.rejects(entry.preparar(), /Sin conexion/);
  assert.equal(await entry.preparar(), true);
  assert.equal(attempts, 2);
});

test("Inicial no participa de promedios, reprobados ni pendientes cuantitativos", () => {
  for (const courseId of ["inicial", "preinicial"]) {
    const result = calculateCourseTerm({ courseId, students: [{ id: "a", cursoId: courseId }] });
    assert.deepEqual(result.studentResults, []);
    assert.equal(result.risk, 0);
    assert.equal(result.modalidadEvaluacion, "cualitativa");
  }
});

test("las escrituras numericas rechazan Inicial antes de cualquier acceso remoto", async () => {
  establecerConfiguracion({ gestionActivaId: gestionDelCalendario(), gestionHabilitada: true, versionModelo: 2 });
  for (const courseId of ["inicial", "preinicial"]) {
    const activity = { id: "a", cursoId: courseId, materiaId: "matematica" };
    await assert.rejects(saveGrade({ activity, student: { id: "s", cursoId: courseId }, value: 80 }), /evaluacion cualitativa/);
    await assert.rejects(finalizeActivityReview({ activity }), /solo corresponde a Primaria/);
    await assert.rejects(importHistoricalGrades({ course: { id: courseId } }), /solo corresponde a Primaria/);
  }
});
