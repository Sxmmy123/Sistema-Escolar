import assert from "node:assert/strict";
import test from "node:test";
import { findCourse } from "../src/data/catalog.js";
import { GRUPO_INICIAL, cursosGrupoInicial, esMultigradoInicial, cursoActividadInicial, cursoTrabajoInicial } from "../src/services/grupoInicial.js";
import { establecerConfiguracion } from "../src/services/rutasFirestore.js";
import { crearDatosInicial } from "../src/modules/docente-inicial/datosInicial.js";
import { ActividadesInicial } from "../src/modules/docente-inicial/ActividadesInicial.js";
import { RegistroInicial } from "../src/modules/docente-inicial/RegistroInicial.js";
import { BitacoraInicial } from "../src/modules/docente-inicial/BitacoraInicial.js";
import { HorarioInicial } from "../src/modules/docente-inicial/HorarioInicial.js";
import { AsistenciaInicial } from "../src/modules/docente-inicial/AsistenciaInicial.js";
import { ResumenesInicial } from "../src/modules/docente-inicial/ResumenesInicial.js";
import { cuadriculaAlumnosInicial } from "../src/modules/docente-inicial/SeguimientoInicial.js";

const context = { uid: "docente", gestionId: "2026", courses: [findCourse("inicial"), findCourse("preinicial")] };
const criteria = Object.fromEntries(["ser", "saber", "hacer"].map((dimension) => [dimension, { criterio: `Criterio ${dimension}`, opciones: { logrado: "Lo logra", en_proceso: "En proceso", requiere_apoyo: "Requiere apoyo", no_observado: "Sin observar" } }]));
const activity = (course) => ({ id: `docente_${course}`, docenteUid: "docente", cursoId: course, trimestreId: "t1", materiaId: "lenguaje", titulo: `Actividad ${course}`, descripcion: "Reconocer vocales", estado: "pendiente", prioritaria: true, orden: course, criterios: criteria });
const pupils = { inicial: [{ id: "i", nombre: "Ana Inicial" }], preinicial: [{ id: "p", nombre: "Bruno Preinicial" }] };
const schedule = { periodos: [{ id: "p1", label: "1", hora: "08:00 - 08:40" }], clases: { p1: { lunes: "lenguaje" } } };
function fixture(overrides = {}) {
  const calls = [];
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: true });
  const data = crearDatosInicial(context, {
    getTeacherStudents: async (course) => pupils[course],
    listarActividadesInicial: async (_, course) => [activity(course)],
    listarRegistrosInicial: async (_, course) => [{ id: `nota_${course}`, cursoId: course, trimestreId: "t1", alumnoId: course === "inicial" ? "i" : "p", docenteUid: "docente", tipo: "bitacora", descripcion: `Comentario ${course}` }],
    getSchedule: async () => schedule,
    listAttendanceForCourseDate: async (course) => Object.fromEntries(pupils[course].map((student) => [student.id, { estado: "presente" }])),
    guardarRegistroInicial: async (_, input) => { calls.push(input); return input; },
    guardarAvanceInicial: async (_, current, studentId, entries, options) => {
      calls.push({ current, studentId, entries, options });
      return { activity: { ...current, tieneRegistros: true }, records: [{ id: `avance_${studentId}`, alumnoId: studentId, cursoId: options.cursoAlumnoId, tipo: "actividad", actividadId: current.id, dimension: "ser", valoracion: "logrado" }] };
    },
    modificarActividadInicial: async (_, input) => { calls.push(input); return { ...activity(input.cursoId), ...input }; },
    moverActividadInicial: async (_, first, second) => [{ ...first, orden: second.orden }, { ...second, orden: first.orden }],
    saveAttendance: async (input) => { calls.push(input); return input; },
    nuevoIdRegistroInicial: () => "docente_nuevo",
    ...overrides
  });
  return { data, calls };
}
async function loadGroup(data) {
  await Promise.all(["students", "activities", "records", "schedule"].map((type) => data.cargar(type, GRUPO_INICIAL, type === "students" || type === "schedule" ? "" : "t1")));
}
function state(data, route, courseId = GRUPO_INICIAL) {
  return { context, data, route, courseId, termId: "t1", date: "2026-03-10", soloContenido: true, activityId: "docente_preinicial", activityLimit: 5, dimension: "ser", studentId: "i", activityView: "board", noteDraft: () => ({ descripcion: "" }), advanceDraft: () => ({}), summarySearch: "", summaryCategory: "bitacora", summarySubjectId: "all", summaryStudentId: "" };
}

test("multigrado solo agrupa Inicial y Preinicial asignados al mismo docente", () => {
  assert.equal(esMultigradoInicial(context), true);
  assert.deepEqual(cursosGrupoInicial(context), ["preinicial", "inicial"]);
  for (const courses of [[findCourse("inicial")], [findCourse("cuarto_a")], [findCourse("inicial"), findCourse("cuarto_a")]]) assert.equal(esMultigradoInicial({ ...context, courses }), false);
  assert.equal(cursoTrabajoInicial(state({}, "/docente/registro")).nombre, "Inicial y Preinicial");
  assert.equal(cursoActividadInicial(state({}, "/docente/actividades")), "preinicial");
  assert.equal(cursoActividadInicial(state({}, "/docente/actividades"), activity("inicial")), "inicial");
});

test("el grupo combina alumnos y actividades sin duplicarlos ni cambiar su curso real", async () => {
  const { data } = fixture(); await loadGroup(data);
  assert.deepEqual(data.leer("students", GRUPO_INICIAL).map(({ id, cursoId }) => [id, cursoId]), [["p", "preinicial"], ["i", "inicial"]]);
  assert.equal(data.leer("activities", GRUPO_INICIAL, "t1").length, 2);
  assert.equal(data.leer("students", "inicial").length, 1);
  assert.equal(data.leer("students", "preinicial")[0].id, "p");
  assert.equal(data.leer("schedule", GRUPO_INICIAL), schedule);
});

test("una actividad comun guarda cada avance en el curso matriculado del alumno", async () => {
  const { data, calls } = fixture(); await loadGroup(data);
  const shared = activity("preinicial");
  await data.guardarAvance(shared, "i", { ser: { valoracion: "logrado" } });
  await data.guardarAvance(shared, "p", { ser: { valoracion: "logrado" } });
  assert.equal(calls[0].options.cursoAlumnoId, "inicial");
  assert.equal(calls[1].options.cursoAlumnoId, "preinicial");
  assert.equal(calls[0].current.id, calls[1].current.id);
  assert.equal(data.leer("records", "inicial", "t1").filter((row) => row.tipo === "actividad")[0].alumnoId, "i");
  assert.equal(data.leer("records", "preinicial", "t1").filter((row) => row.tipo === "actividad")[0].alumnoId, "p");
  await assert.rejects(data.guardarAvance(shared, "no-asignado", { ser: { valoracion: "logrado" } }), /no pertenece/);
});

test("Bitacora y Asistencia juntas nunca guardan multigrado como curso de un alumno", async () => {
  const { data, calls } = fixture(); await loadGroup(data);
  await data.guardarRegistro({ id: "docente_comentario", cursoId: GRUPO_INICIAL, trimestreId: "t1", alumnoId: "i", tipo: "bitacora", descripcion: "Comparte sus materiales." });
  assert.equal(calls[0].cursoId, "inicial");
  await data.cargar("attendance", GRUPO_INICIAL, "t1", "2026-03-10");
  await data.guardarAsistencia(GRUPO_INICIAL, pupils.preinicial[0], "2026-03-10", "t1", "atraso", "Llego despues del inicio.");
  assert.equal(calls[1].course.id, "preinicial");
  assert.equal(data.leer("attendance", GRUPO_INICIAL, "t1", "2026-03-10").p.estado, "atraso");
  assert.equal(data.leer("attendance", GRUPO_INICIAL, "t1", "2026-03-10").i.estado, "presente");
});

test("crear, priorizar y ordenar conservan una sola actividad y actualizan el grupo", async () => {
  const { data, calls } = fixture(); await loadGroup(data);
  await data.guardarActividad({ id: "docente_nueva", cursoId: GRUPO_INICIAL, trimestreId: "t1", accion: "crear" });
  assert.equal(calls.length, 1); assert.equal(calls[0].cursoId, "preinicial");
  assert.equal(data.leer("activities", GRUPO_INICIAL, "t1").filter((item) => item.id === "docente_nueva").length, 1);
  await data.guardarActividad({ id: "docente_inicial", cursoId: GRUPO_INICIAL, trimestreId: "t1", accion: "prioridad" });
  assert.equal(calls[1].cursoId, "inicial");
  await data.moverActividad(activity("inicial"), activity("preinicial"));
  assert.equal(data.leer("activities", "inicial", "t1")[0].orden, "preinicial");
  assert.equal(data.leer("activities", "preinicial", "t1").find((item) => item.id === "docente_preinicial").orden, "inicial");
});

test("las pantallas comunes ocultan cursos y Seguimiento mantiene alumnos separados", async () => {
  const { data } = fixture(); await loadGroup(data);
  await data.cargar("attendance", GRUPO_INICIAL, "t1", "2026-03-10");
  for (const [route, view] of [["actividades", ActividadesInicial], ["registro", RegistroInicial], ["bitacora", BitacoraInicial], ["horario", HorarioInicial], ["asistencia", AsistenciaInicial]]) {
    const markup = view(state(data, `/docente/${route}`));
    assert.match(markup, /Inicial y Preinicial/);
    assert.doesNotMatch(markup, /data-initial-course=/);
  }
  const tiles = cuadriculaAlumnosInicial(state(data, "/docente/bitacora"));
  assert.match(tiles, /Ana Inicial/); assert.match(tiles, /Bruno Preinicial/);
  assert.equal((HorarioInicial(state(data, "/docente/horario")).match(/<table/g) || []).length, 1);
  const initial = ResumenesInicial(state(data, "/docente/resumenes", "inicial"));
  const preinitial = ResumenesInicial(state(data, "/docente/resumenes", "preinicial"));
  assert.match(initial, /data-initial-course="preinicial"/); assert.match(initial, /Ana Inicial/); assert.doesNotMatch(initial, /Bruno Preinicial/);
  assert.match(preinitial, /Bruno Preinicial/); assert.doesNotMatch(preinitial, /Ana Inicial/);
});
