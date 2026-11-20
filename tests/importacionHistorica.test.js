import assert from "node:assert/strict";
import test from "node:test";
import { firestore } from "../src/firebase/client.js";
import { guardarImportacionHistorica } from "../src/services/importacionHistorica.js";
import { importHistoricalAttendance, importHistoricalGrades } from "../src/services/adminData.js";
import { establecerConfiguracion } from "../src/services/rutasFirestore.js";

function memoryStore(initial = []) {
  const saved = new Map(initial), commits = [];
  let calls = 0, failOn = 0;
  const path = (ref) => typeof ref === "string" ? ref : ref.path;
  const transact = async (_db, callback) => {
    calls++;
    const writes = new Map();
    const result = await callback({
      get: async (ref) => { const value = saved.get(path(ref)); return { exists: () => value !== undefined, data: () => value }; },
      set: (ref, data) => writes.set(path(ref), data)
    });
    if (calls === failOn) throw new Error("Conexion interrumpida");
    writes.forEach((value, key) => saved.set(key, value));
    commits.push([...writes.keys()]);
    return result;
  };
  return { saved, commits, transact, failAt: (value) => { failOn = value; } };
}
const entry = (id, value = 80) => ({ id, collection: "notas", label: id, data: { value }, matches: (saved) => saved.value === value });
const options = (store, groups, extra = {}) => ({ db: {}, groups, existing: new Map(), reference: (item) => `${item.collection}/${item.id}`, current: () => true, transact: store.transact, ...extra });

test("un conflicto conocido cancela toda la carga antes de escribir", async () => {
  const store = memoryStore();
  await assert.rejects(guardarImportacionHistorica(options(store, [[entry("nueva")], [entry("anterior")]], {
    existing: new Map([["notas/anterior", { value: 20 }]])
  })), /No se sobrescribio/);
  assert.equal(store.commits.length, 0);
});

test("una carrera detectada dentro de la transaccion no guarda ni media actividad", async () => {
  const store = memoryStore([["notas/anterior", { value: 20 }]]);
  await assert.rejects(guardarImportacionHistorica(options(store, [[entry("actividad"), entry("anterior")]])), (error) => error.progress.confirmed === 0);
  assert.equal(store.saved.has("notas/actividad"), false);
  assert.equal(store.saved.get("notas/anterior").value, 20);
});

test("una interrupcion informa el avance confirmado y reintentar no duplica ni reemplaza", async () => {
  const store = memoryStore(), groups = Array.from({ length: 451 }, (_, index) => [entry(`n${index}`)]);
  store.failAt(2);
  await assert.rejects(guardarImportacionHistorica(options(store, groups)), (error) => {
    assert.equal(error.code, "importacion/interrumpida");
    assert.deepEqual(error.progress, { total: 451, confirmed: 450, created: 450, preserved: 0 });
    return true;
  });
  assert.equal(store.saved.size, 450);
  store.failAt(0);
  const result = await guardarImportacionHistorica(options(store, groups));
  assert.deepEqual(result, { total: 451, confirmed: 451, created: 1, preserved: 450 });
  assert.equal(store.saved.size, 451);
});

test("los lotes no dividen una actividad de sus notas", async () => {
  const store = memoryStore();
  const groups = [Array.from({ length: 449 }, (_, index) => entry(`a${index}`)), [entry("actividad-b"), entry("nota-b")]];
  await guardarImportacionHistorica(options(store, groups));
  assert.deepEqual(store.commits.map((group) => group.length), [449, 2]);
  assert.ok(store.commits[1].includes("notas/actividad-b") && store.commits[1].includes("notas/nota-b"));
  await assert.rejects(guardarImportacionHistorica(options(store, [Array.from({ length: 451 }, (_, index) => entry(`x${index}`))])), /supera/);
});

test("cambiar de sesion o pantalla detiene el siguiente lote sin perder el avance confirmado", async () => {
  const store = memoryStore(); let active = true;
  const groups = Array.from({ length: 451 }, (_, index) => [entry(`n${index}`)]);
  await assert.rejects(guardarImportacionHistorica(options(store, groups, { current: () => active, onProgress: () => { active = false; } })), (error) => error.progress.confirmed === 450);
  assert.equal(store.saved.size, 450);
  const empty = memoryStore();
  await assert.rejects(guardarImportacionHistorica(options(empty, [[entry("n")]], { current: () => false })), /sesion/);
  assert.equal(empty.saved.size, 0);
});

function importFixture(initial = []) {
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: true });
  const store = memoryStore(initial);
  const clients = { firestore, auth: { currentUser: { uid: "admin-test", email: "admin@example.test" } }, transact: store.transact,
    read: async (request) => {
      const prefix = `${request._query.path.toArray().join("/")}/`;
      return { docs: [...store.saved].filter(([key]) => key.startsWith(prefix)).map(([key, data]) => ({ id: key.slice(prefix.length), data: () => data })) };
    }
  };
  return { ...store, clients };
}
const attendanceInput = { course: { id: "cuarto_a" }, trimestreId: "t1", rows: [{ student: { id: "alumno-a" }, fecha: "2026-02-09", estado: "atraso" }] };
const attendanceData = { cursoId: "cuarto_a", trimestreId: "t1", alumnoId: "alumno-a", fecha: "2026-02-09", estado: "atraso", observacion: "Llego a las 9", registradoPorUid: "docente-original" };
const gradeInput = { course: { id: "cuarto_a" }, materiaId: "matematica", trimestreId: "t1", activities: [{ key: "a", titulo: "Sumas", tipo: "tarea", maximo: 100, fecha: "2026-02-09" }], rows: [{ activityKey: "a", student: { id: "alumno-a" }, valor: 80 }] };

test("importar asistencia conserva observaciones y autoria, incluso con un ID antiguo", async () => {
  const key = "gestiones/2026/asistencias/id-antiguo", fixture = importFixture([[key, attendanceData]]);
  const result = await importHistoricalAttendance(attendanceInput, fixture.clients);
  assert.deepEqual(result, { total: 1, created: 0, preserved: 1 });
  assert.deepEqual(fixture.saved.get(key), attendanceData);
  assert.equal(fixture.saved.size, 1);
});

test("un estado distinto, otro trimestre o duplicados no reemplazan asistencias", async () => {
  for (const change of [{ estado: "presente" }, { trimestreId: "t2" }]) {
    const fixture = importFixture([["gestiones/2026/asistencias/anterior", { ...attendanceData, ...change }]]);
    await assert.rejects(importHistoricalAttendance(attendanceInput, fixture.clients), /registro diferente/);
    assert.equal(fixture.commits.length, 0);
  }
  const fixture = importFixture([["gestiones/2026/asistencias/a", attendanceData], ["gestiones/2026/asistencias/b", attendanceData]]);
  await assert.rejects(importHistoricalAttendance(attendanceInput, fixture.clients), /duplicadas/);
});

test("la carga repetida reutiliza las actividades y las notas sin duplicar ni perder comentarios", async () => {
  const fixture = importFixture();
  assert.equal((await importHistoricalGrades(gradeInput, fixture.clients)).created, 2);
  const gradeKey = [...fixture.saved.keys()].find((key) => key.includes("/calificaciones/"));
  fixture.saved.set(gradeKey, { ...fixture.saved.get(gradeKey), observacion: "Buen progreso", calificadoPorUid: "docente-original" });
  const before = [...fixture.saved];
  assert.equal((await importHistoricalGrades(gradeInput, fixture.clients)).preserved, 2);
  assert.deepEqual([...fixture.saved], before);
  assert.equal(fixture.saved.size, 2);
  await assert.rejects(importHistoricalGrades({ ...gradeInput, rows: [{ ...gradeInput.rows[0], valor: 20 }] }, fixture.clients), /registro diferente/);
  assert.deepEqual([...fixture.saved], before);
});

test("IDs deterministas impiden duplicados cuando una consulta previa no vio la carga concurrente", async () => {
  const fixture = importFixture();
  await importHistoricalGrades(gradeInput, fixture.clients);
  fixture.clients.read = async () => ({ docs: [] });
  const result = await importHistoricalGrades(gradeInput, fixture.clients);
  assert.equal(result.preserved, 2);
  assert.equal(fixture.saved.size, 2);
});

test("notas invalidas o filas repetidas se rechazan antes de escribir", async () => {
  for (const rows of [[{ ...gradeInput.rows[0], valor: 101 }], [{ ...gradeInput.rows[0], valor: "" }], [gradeInput.rows[0], gradeInput.rows[0]]]) {
    const fixture = importFixture();
    await assert.rejects(importHistoricalGrades({ ...gradeInput, rows }, fixture.clients));
    assert.equal(fixture.saved.size, 0);
  }
});

test("duplicados ajenos a la carga no bloquean asistencia ni notas del alumno seleccionado", async () => {
  const otherAttendance = { ...attendanceData, alumnoId: "otro" };
  const otherActivity = { cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t1", titulo: "Otra actividad", fecha: "2026-04-01", tipo: "tarea", maximo: 100 };
  const fixture = importFixture([
    ["gestiones/2026/asistencias/otro-a", otherAttendance], ["gestiones/2026/asistencias/otro-b", otherAttendance],
    ["gestiones/2026/actividades/otra-a", otherActivity], ["gestiones/2026/actividades/otra-b", otherActivity]
  ]);
  assert.equal((await importHistoricalAttendance(attendanceInput, fixture.clients)).created, 1);
  assert.equal((await importHistoricalGrades(gradeInput, fixture.clients)).created, 2);
});

test("identificadores que colisionan no mezclan notas de alumnos diferentes", async () => {
  const fixture = importFixture();
  await assert.rejects(importHistoricalGrades({ ...gradeInput, rows: [{ ...gradeInput.rows[0], student: { id: "Alumno_A" } }, { ...gradeInput.rows[0], student: { id: "alumno_a" } }] }, fixture.clients), /identificadores repetidos/);
  assert.equal(fixture.saved.size, 0);
});
