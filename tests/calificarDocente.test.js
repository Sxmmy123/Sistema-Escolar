import assert from "node:assert/strict";
import test from "node:test";
import {
  ambitoCalificar, cargarActividadCalificar, cargarIndiceCalificar, crearCacheCalificar,
  quitarActividadCalificar, sincronizarActividadCalificar, sincronizarAsistenciaCalificar, sincronizarNotaCalificar
} from "../src/services/datosCalificarDocente.js";

function almacenamiento() {
  const datos = new Map();
  return {
    get length() { return datos.size; },
    key: (i) => [...datos.keys()][i],
    getItem: (key) => datos.get(key) ?? null,
    setItem: (key, value) => datos.set(key, value),
    removeItem: (key) => datos.delete(key)
  };
}

function ejemplo() {
  const storage = almacenamiento();
  const cache = crearCacheCalificar({ almacenamiento: () => storage });
  const context = { uid: "aracely", gestionId: "2026", courses: [{ id: "cuarto_a" }] };
  const actividad = { id: "tarea1", cursoId: "cuarto_a", trimestreId: "t1", fecha: "2026-02-02", estadoRevision: "sin_iniciar" };
  const consultas = {};
  const contar = (nombre, resultado) => async () => {
    consultas[nombre] = (consultas[nombre] || 0) + 1;
    return structuredClone(resultado);
  };
  const loaders = {
    listActivities: contar("actividades", [actividad]),
    listGradesForCourse: contar("notasCurso", []),
    getTeacherStudents: contar("alumnos", [{ id: "alumno1" }, { id: "alumno2" }]),
    listGradesForActivity: contar("notas", {}),
    listAttendanceForCourseDate: contar("asistencia", { alumno1: { estado: "presente" }, alumno2: { estado: "atraso" } })
  };
  return { storage, cache, context, actividad, consultas, loaders };
}

test("Calificar reutiliza el indice y no consulta todas las notas para actividades con estado de revision", async () => {
  const { cache, context, loaders, consultas } = ejemplo();
  for (const pendientes of [false, true, false, true]) {
    const indice = await cargarIndiceCalificar(context, "t1", loaders, { pendientes, cache });
    assert.equal(indice.actividades.length, 1);
    assert.equal(indice.calificadas.size, 0);
  }
  assert.deepEqual(consultas, { actividades: 1 });
});

test("los registros antiguos conservan la consulta de notas, una sola vez por curso", async () => {
  const { cache, context, loaders, consultas, actividad } = ejemplo();
  delete actividad.estadoRevision;
  loaders.listActivities = async () => { consultas.actividades = (consultas.actividades || 0) + 1; return [actividad]; };
  loaders.listGradesForCourse = async () => { consultas.notasCurso = (consultas.notasCurso || 0) + 1; return [{ actividadId: actividad.id }]; };
  await cargarIndiceCalificar(context, "t1", loaders, { cache });
  for (let i = 0; i < 3; i += 1) {
    const indice = await cargarIndiceCalificar(context, "t1", loaders, { pendientes: true, cache });
    assert.equal(indice.calificadas.has(actividad.id), true);
  }
  assert.deepEqual(consultas, { actividades: 1, notasCurso: 1 });
});

test("cambiar alumno o modo no vuelve a consultar notas, matricula ni asistencia", async () => {
  const { cache, context, actividad, loaders, consultas } = ejemplo();
  for (let i = 0; i < 16; i += 1) {
    const datos = await cargarActividadCalificar(context, actividad, loaders, { cache });
    assert.equal(datos.students.length, 2);
    assert.equal(datos.attendanceMap.alumno2.estado, "atraso");
  }
  await cargarActividadCalificar(context, { ...actividad, id: "examen1" }, loaders, { cache });
  assert.deepEqual(consultas, { alumnos: 1, notas: 2, asistencia: 1 });
});

test("las cargas simultaneas comparten una sola consulta", async () => {
  const { cache, context, loaders, consultas } = ejemplo();
  await Promise.all(Array.from({ length: 10 }, () => cargarIndiceCalificar(context, "t1", loaders, { cache })));
  assert.equal(consultas.actividades, 1);
});

test("una nota confirmada se refleja localmente sin lecturas y persiste al recargar", async () => {
  const { cache, context, actividad, loaders, consultas, storage } = ejemplo();
  await cargarIndiceCalificar(context, "t1", loaders, { cache });
  await cargarActividadCalificar(context, actividad, loaders, { cache });
  const nota = { id: "nota1", actividadId: actividad.id, alumnoId: "alumno1", valor: 90, nota: 90 };
  sincronizarNotaCalificar(context, { ...actividad, estadoRevision: "en_proceso", tieneCalificaciones: true }, nota, cache);
  const reiniciada = crearCacheCalificar({ almacenamiento: () => storage });
  const datos = await cargarActividadCalificar(context, actividad, loaders, { cache: reiniciada });
  assert.equal(datos.gradesMap.alumno1.valor, 90);
  const indice = await cargarIndiceCalificar(context, "t1", loaders, { pendientes: true, cache: reiniciada });
  assert.equal(indice.actividades[0].estadoRevision, "en_proceso");
  assert.deepEqual(consultas, { actividades: 1, alumnos: 1, notas: 1, asistencia: 1 });
});

test("asistencia, edicion, nueva actividad y cierre de revision sincronizan la copia local", async () => {
  const { cache, context, actividad, loaders, consultas } = ejemplo();
  await cargarIndiceCalificar(context, "t1", loaders, { cache });
  await cargarActividadCalificar(context, actividad, loaders, { cache });
  sincronizarAsistenciaCalificar(context, { cursoId: actividad.cursoId, trimestreId: "t1", fecha: actividad.fecha, alumnoId: "alumno1", estado: "permiso" }, cache);
  sincronizarActividadCalificar(context, { ...actividad, titulo: "Titulo corregido", estadoRevision: "cerrada" }, null, cache);
  sincronizarActividadCalificar(context, { ...actividad, id: "tarea2" }, null, cache);
  const datos = await cargarActividadCalificar(context, actividad, loaders, { cache });
  const indice = await cargarIndiceCalificar(context, "t1", loaders, { pendientes: true, cache });
  assert.equal(datos.attendanceMap.alumno1.estado, "permiso");
  assert.equal(indice.actividades[0].estadoRevision, "cerrada");
  assert.equal(indice.actividades[0].titulo, "Titulo corregido");
  assert.equal(indice.actividades.length, 2);
  quitarActividadCalificar(context, actividad, cache);
  assert.equal((await cargarIndiceCalificar(context, "t1", loaders, { cache })).actividades[0].id, "tarea2");
  assert.deepEqual(consultas, { actividades: 1, alumnos: 1, notas: 1, asistencia: 1 });
});

test("Actualizar elimina tambien la copia persistida y vuelve a leer solo el trimestre seleccionado", async () => {
  const { cache, context, loaders, consultas, storage } = ejemplo();
  await cargarIndiceCalificar(context, "t1", loaders, { cache });
  await cargarIndiceCalificar(context, "t2", loaders, { cache });
  const nueva = crearCacheCalificar({ almacenamiento: () => storage });
  nueva.limpiar(ambitoCalificar(context, "t1"));
  await cargarIndiceCalificar(context, "t1", loaders, { cache: nueva });
  await cargarIndiceCalificar(context, "t2", loaders, { cache: nueva });
  assert.equal(consultas.actividades, 3);
});

test("la cache separa docente, gestion, trimestre y curso", async () => {
  const { cache, context, loaders, consultas } = ejemplo();
  for (const [ctx, trimestre] of [
    [context, "t1"], [{ ...context, uid: "jorge" }, "t1"],
    [{ ...context, gestionId: "2027" }, "t1"], [context, "t2"],
    [{ ...context, courses: [{ id: "tercero_a" }] }, "t1"]
  ]) await cargarIndiceCalificar(ctx, trimestre, loaders, { cache });
  assert.equal(consultas.actividades, 5);
});

test("un error de Firebase no queda almacenado y se puede reintentar", async () => {
  const { cache, context, loaders, consultas } = ejemplo();
  await assert.rejects(cargarIndiceCalificar(context, "t1", { ...loaders, listActivities: async () => { throw new Error("sin conexion"); } }, { cache }), /sin conexion/);
  await cargarIndiceCalificar(context, "t1", loaders, { cache });
  assert.equal(consultas.actividades, 1);
});

test("una respuesta remota vieja no sobrescribe una nota guardada mientras carga", async () => {
  const { cache, context } = ejemplo();
  const ambito = ambitoCalificar(context, "t1");
  let terminar;
  const carga = cache.cargar(ambito, "notas_actividad", "tarea1", () => new Promise((resolve) => { terminar = resolve; }));
  await Promise.resolve();
  cache.guardar(ambito, "notas_actividad", "tarea1", { alumno1: { valor: 90 } });
  terminar({});
  assert.equal((await carga).alumno1.valor, 90);
});

test("Calificar funciona en memoria si localStorage esta bloqueado", async () => {
  const { context, loaders, consultas } = ejemplo();
  const cache = crearCacheCalificar({ almacenamiento: () => { throw new Error("bloqueado"); } });
  await cargarIndiceCalificar(context, "t1", loaders, { cache });
  await cargarIndiceCalificar(context, "t1", loaders, { cache });
  assert.equal(consultas.actividades, 1);
});
