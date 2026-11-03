import assert from "node:assert/strict";
import test from "node:test";
import { COURSES, PRIMARY_COURSES, SCHEDULE_COURSES, DAYS, SUBJECTS, findCourse, periodsForCourse, scheduleCourseId } from "../src/data/catalog.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";
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

function scheduleService(initial = {}) {
  const store = new Map(Object.entries(structuredClone(initial)));
  const reads = [], writes = [];
  const plain = (value) => JSON.parse(JSON.stringify(value));
  const snapshot = (id) => ({ id, exists: () => store.has(id), data: () => store.get(id) });
  const save = (ref, data, options) => {
    const value = plain(data), old = options?.merge ? store.get(ref.id) || {} : {};
    const classes = { ...old.clases };
    for (const [period, days] of Object.entries(value.clases || {})) classes[period] = { ...classes[period], ...days };
    store.set(ref.id, { ...old, ...value, clases: classes });
    writes.push({ ref, data: value });
  };
  const scope = vm.createContext({
    COURSES, SCHEDULE_COURSES, SUBJECTS, periodsForCourse, scheduleCourseId, firestore: {},
    gestionActual: () => "2026", serverTimestamp: () => "server-time",
    documentoGestion: (_, name, id, year = "2026") => ({ name, id, year }),
    coleccionGestion: (_, name) => name, collection: (_, name) => name,
    query: (source) => source, where: () => ({}), getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    getDoc: async (ref) => { reads.push(ref); return snapshot(ref.id); },
    getDocs: async () => ({ docs: [...store.keys()].map(snapshot) }),
    setDoc: async (ref, data, options) => save(ref, data, options),
    runTransaction: async (_, run) => run({
      get: async (ref) => { reads.push(ref); return snapshot(ref.id); }, set: save
    })
  });
  const source = readFileSync(new URL("../src/services/adminData.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "")
    .replace(/^export \{[^\n]+\n/gm, "").replace(/export (async )?function /g, "$1function ");
  vm.runInContext(`${source}\nthis.service = { getSchedule, saveScheduleCell, getAllSchedules, saveFullSchedule, importSchedulesPayload, getAdminCounts };`, scope);
  return { ...scope.service, store, reads, writes, plain };
}

function adminScheduleMarkup() {
  const source = readFileSync(new URL("../src/modules/admin/PaginasAdmin.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "").replace(/export function /g, "function ");
  return vm.runInNewContext(`${source}\nAdminModule('/admin/horarios');`, {
    COURSES, PRIMARY_COURSES, SCHEDULE_COURSES, DAYS, SUBJECTS, periodsForCourse,
    icon: () => "", AdminShell: (_, content) => content, AlumnosAdminPanel: () => "",
    gestionActual: () => "2026", fechaEscolarIso: () => "2026-03-10"
  });
}

test("administracion muestra un horario multigrado y seis de Primaria, sin fusionar las matriculas", () => {
  assert.equal(COURSES.length, 8);
  assert.equal(SCHEDULE_COURSES.length, 7);
  assert.equal(SCHEDULE_COURSES[0].nombre, "Inicial y Preinicial");
  assert.equal(scheduleCourseId("inicial"), scheduleCourseId("preinicial"));
  for (const course of COURSES.filter((item) => item.nivel === "primaria")) assert.equal(scheduleCourseId(course.id), course.id);
  const html = adminScheduleMarkup();
  assert.equal((html.match(/data-action="schedule-course"/g) || []).length, 7);
  assert.match(html, /data-schedule-title>Inicial y Preinicial/);
  assert.doesNotMatch(html, /data-action="schedule-course" data-course-id="inicial"/);
});

test("ambos cursos leen el horario compartido conservando su identidad y sus periodos", async () => {
  const service = scheduleService({ preinicial: { clases: { p1: { lunes: "matematica" } } }, inicial: { clases: { p1: { lunes: "lenguaje" } } } });
  const preinitial = await service.getSchedule("preinicial"), initial = await service.getSchedule("inicial");
  assert.deepEqual(service.plain(initial.clases), service.plain(preinitial.clases));
  assert.equal(initial.cursoId, "inicial"); assert.equal(preinitial.cursoId, "preinicial");
  assert.equal(initial.periodos[0].hora, "08:00 - 08:40");
  assert.deepEqual(service.reads.map((ref) => ref.id), ["preinicial", "preinicial"]);
});

test("un horario compartido vacio no recupera materias retiradas del registro anterior", async () => {
  const service = scheduleService({ preinicial: { clases: {} }, inicial: { clases: { p1: { lunes: "lenguaje" } } } });
  assert.deepEqual(service.plain((await service.getSchedule("inicial")).clases), {});
});

test("el primer guardado conserva las celdas del antiguo horario de Inicial", async () => {
  const service = scheduleService({ inicial: { clases: { p1: { lunes: "lenguaje", martes: "musica" }, p2: { viernes: "religion" } } } });
  assert.equal((await service.getSchedule("preinicial")).clases.p1.martes, "musica");
  await service.saveScheduleCell("inicial", "p1", "lunes", "matematica");
  assert.equal(service.writes.length, 1); assert.equal(service.writes[0].ref.id, "preinicial");
  assert.equal(service.store.get("preinicial").clases.p1.martes, "musica");
  assert.equal(service.store.get("preinicial").clases.p2.viernes, "religion");
  assert.equal((await service.getSchedule("inicial")).clases.p1.lunes, "matematica");
  assert.equal(service.store.get("inicial").clases.p1.lunes, "lenguaje");
});

test("guardar o quitar una materia afecta al horario compartido y nunca al de Primaria", async () => {
  const service = scheduleService({ cuarto_a: { clases: { p1: { lunes: "lenguaje" } } } });
  await service.saveScheduleCell("preinicial", "p1", "lunes", "musica");
  await service.saveScheduleCell("inicial", "p1", "lunes", "");
  assert.equal((await service.getSchedule("preinicial")).clases.p1.lunes, null);
  assert.equal((await service.getSchedule("cuarto_a")).clases.p1.lunes, "lenguaje");
  await service.saveScheduleCell("cuarto_a", "p1", "martes", "matematica");
  assert.deepEqual(service.writes.map((item) => item.ref.id), ["preinicial", "preinicial", "cuarto_a"]);
  assert.equal((await service.getSchedule("cuarto_a")).periodos[0].hora, "07:30 - 08:10");
});

test("la exportacion y el contador no duplican Inicial y Preinicial", async () => {
  const service = scheduleService({ inicial: { clases: {} }, preinicial: { clases: { p1: { lunes: "musica" } } }, cuarto_a: { clases: {} } });
  const all = await service.getAllSchedules();
  assert.deepEqual(Object.keys(all).sort(), ["cuarto_a", "preinicial"]);
  assert.equal(all.preinicial.clases.p1.lunes, "musica");
  assert.equal((await service.getAdminCounts()).schedules, 2);
});

test("importar dos copias identicas del multigrado guarda una sola, aunque cambie el orden de las claves", async () => {
  const service = scheduleService();
  const count = await service.importSchedulesPayload({ horarios: {
    inicial: { clases: { p1: { martes: "musica", lunes: "lenguaje" } } },
    preinicial: { clases: { p1: { lunes: "lenguaje", martes: "musica" } } },
    cuarto_a: { clases: { p1: { lunes: "matematica" } } }
  } });
  assert.equal(count, 2);
  assert.deepEqual(service.writes.map((item) => item.ref.id), ["preinicial", "cuarto_a"]);
});

test("un archivo con horarios multigrado contradictorios se rechaza antes de escribir", async () => {
  const service = scheduleService();
  await assert.rejects(service.importSchedulesPayload({ horarios: {
    cuarto_a: { clases: {} }, inicial: { clases: { p1: { lunes: "musica" } } }, preinicial: { clases: { p1: { lunes: "lenguaje" } } }
  } }), /comparten un solo horario/);
  assert.equal(service.writes.length, 0);
});

test("importar solamente Inicial escribe en el mismo documento compartido", async () => {
  const service = scheduleService();
  assert.equal(await service.importSchedulesPayload({ Inicial: { clases: { p1: { lunes: "musica" } } } }), 1);
  assert.equal(service.writes[0].ref.id, "preinicial");
  assert.equal((await service.getSchedule("preinicial")).clases.p1.lunes, "musica");
});

test("direccion consulta el mismo horario en ambos cursos y conserva la identidad de cada uno", async () => {
  const service = scheduleService({ preinicial: { clases: { p1: { lunes: "musica" } } }, cuarto_a: { clases: { p1: { lunes: "matematica" } } } });
  const source = readFileSync(new URL("../src/services/directorData.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function listDirectorSchedules");
  const method = source.slice(start, source.indexOf("\nexport", start + 1)).replace("export ", "");
  const schedules = await vm.runInNewContext(`${method}\nlistDirectorSchedules();`, { COURSES, scheduleCourseId, getAllSchedules: service.getAllSchedules });
  assert.equal(schedules.inicial.clases, schedules.preinicial.clases);
  assert.equal(schedules.inicial.cursoId, "inicial");
  assert.equal(schedules.preinicial.cursoId, "preinicial");
  assert.equal(schedules.cuarto_a.clases.p1.lunes, "matematica");
});
