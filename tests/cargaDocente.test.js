import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { crearCacheSesionPrivada } from "../src/services/cacheSesionPrivada.js";
import { CACHE_MAX_AGE, limpiarDatosPrivados } from "../src/services/cachePrivada.js";
import { cargarVistaDocente } from "../src/modules/docente/CargaVistaDocente.js";
import { establecerConfiguracion } from "../src/services/rutasFirestore.js";

const original = new Map(["document", "sessionStorage", "localStorage"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const store = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
};
const roots = new Map();
let teacherState, renderers;
before(async () => {
  globalThis.sessionStorage = store();
  globalThis.localStorage = store();
  globalThis.document = { querySelector: (key) => roots.get(key) || null, querySelectorAll: () => [] };
  ({ teacherState } = await import("../src/modules/docente/EstadoDocente.js"));
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2 });
  const { renderNotes } = await import("../src/modules/docente/NotasDocente.js");
  const { renderBulletin } = await import("../src/modules/docente/BoletinDocente.js");
  const { renderTeacherSchedule } = await import("../src/modules/docente/HorarioDocente.js");
  renderers = [
    { name: "Notas", render: renderNotes, root: "[data-teacher-notes]", button: "[data-refresh-notes-cache]", kind: "notes" },
    { name: "Boletin", render: renderBulletin, root: "[data-teacher-bulletin]", button: "[data-refresh-bulletin]", kind: "bulletin" },
    { name: "Horario", render: renderTeacherSchedule, root: "[data-teacher-schedule]", button: "[data-refresh-teacher-schedule]", kind: "schedule" }
  ];
});
after(() => {
  limpiarDatosPrivados([]);
  for (const [key, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

function fixture(module, name = "Ana Prueba") {
  roots.clear();
  const context = { uid: "prueba-carga", courses: [{ id: "cuarto_a", nombre: "Cuarto A", materias: ["matematica"] }] };
  teacherState.context = context;
  teacherState.selectedCourseId = "cuarto_a";
  teacherState.selectedSubjectId = "matematica";
  teacherState.trimesterId = "t1";
  const listeners = new Map();
  const root = { innerHTML: "", querySelector: (selector) => selector === module.button
    ? { addEventListener: (event, fn) => listeners.set(event, fn) } : null, querySelectorAll: () => [] };
  roots.set(module.root, root);
  const snapshot = { students: [{ id: "a", nombre: name }], activities: [], gradesList: [], attendanceRows: [] };
  const data = module.kind === "bulletin" ? [snapshot, snapshot, snapshot] : module.kind === "schedule"
    ? [{ cursoId: "cuarto_a", diaId: "lunes", periodo: "1", hora: "07:30 - 08:10", materiaId: "matematica", materia: name, color: "#f0aaaa" }] : snapshot;
  return { context, root, data, listeners };
}

test("las tres pantallas cargan al entrar sin depender de una copia local", async () => {
  for (const module of renderers) {
    const { context, root, data } = fixture(module);
    let calls = 0;
    await module.render(context, { readCache: async () => null, refresh: async () => { calls++; return data; } });
    assert.equal(calls, 1, module.name);
    assert.match(root.innerHTML, /Ana Prueba/, module.name);
    assert.match(root.innerHTML, /aria-busy="false"/, module.name);
    assert.doesNotMatch(root.innerHTML, /role="alert"/, module.name);
  }
});

test("cada pantalla permite reintentar y recupera el boton despues de un error", async () => {
  for (const module of renderers) {
    const { context, root, data, listeners } = fixture(module);
    let calls = 0;
    await module.render(context, { readCache: async () => null, refresh: async () => {
      if (++calls === 1) throw Object.assign(new Error("sin red"), { code: "unavailable" });
      return data;
    } });
    assert.match(root.innerHTML, /role="alert"/, module.name);
    assert.match(root.innerHTML, /Reintentar/, module.name);
    assert.doesNotMatch(root.innerHTML, new RegExp(`${module.button.slice(1, -1)} disabled`), module.name);
    await listeners.get("click")();
    assert.equal(calls, 2, module.name);
    assert.match(root.innerHTML, /Ana Prueba/, module.name);
    assert.doesNotMatch(root.innerHTML, /role="alert"/, module.name);
  }
});

test("actualizar conserva los datos visibles si la red falla", async () => {
  for (const module of renderers) {
    const { context, root, data } = fixture(module);
    await module.render(context, { force: true, readCache: async () => module.kind === "bulletin" ? data[0] : data,
      refresh: async () => { throw new Error("fallo"); } });
    assert.match(root.innerHTML, /Ana Prueba/, module.name);
    assert.match(root.innerHTML, /role="alert"/, module.name);
    assert.match(root.innerHTML, /aria-busy="false"/, module.name);
  }
});

test("las copias completas vigentes evitan consultas repetidas", async () => {
  for (const module of renderers) {
    const { context, root, data } = fixture(module);
    await module.render(context, { readCache: async () => module.kind === "bulletin" ? data[0] : data,
      refresh: async () => { throw new Error("No debe descargar"); } });
    assert.match(root.innerHTML, /Ana Prueba/, module.name);
    assert.doesNotMatch(root.innerHTML, /role="alert"/, module.name);
  }
});

test("respuestas anteriores no reemplazan una carga mas reciente ni una pantalla abandonada", async () => {
  for (const module of renderers) {
    const f = fixture(module, "Respuesta nueva");
    let finish;
    const pending = module.render(f.context, { readCache: async () => null, refresh: () => new Promise((resolve) => { finish = resolve; }) });
    await new Promise((resolve) => setImmediate(resolve));
    await module.render(f.context, { readCache: async () => null, refresh: async () => f.data });
    const current = f.root.innerHTML;
    finish(module.kind === "bulletin" ? [] : module.kind === "schedule" ? [] : { students: [] });
    await pending;
    assert.equal(f.root.innerHTML, current, module.name);
    let finishAbandoned;
    const abandoned = module.render(f.context, { readCache: async () => null, refresh: () => new Promise((resolve) => { finishAbandoned = resolve; }) });
    await new Promise((resolve) => setImmediate(resolve));
    roots.clear();
    f.root.innerHTML = "Nueva pantalla";
    finishAbandoned(f.data);
    await abandoned;
    assert.equal(f.root.innerHTML, "Nueva pantalla", module.name);
  }
});

test("Notas no muestra un trimestre antiguo despues de cambiarlo durante la descarga", async () => {
  const module = renderers[0], f = fixture(module);
  let finish;
  const pending = module.render(f.context, { readCache: async () => null, refresh: () => new Promise((resolve) => { finish = resolve; }) });
  await new Promise((resolve) => setImmediate(resolve));
  teacherState.trimesterId = "t2";
  f.root.innerHTML = "Segundo trimestre";
  finish(f.data);
  await pending;
  assert.equal(f.root.innerHTML, "Segundo trimestre");
});

test("Boletin conserva las notas finales y los promedios al preparar una sola vez cada trimestre", async () => {
  const module = renderers[1], f = fixture(module);
  const snapshot = {
    students: [{ id: "a", nombre: "Ana Prueba" }],
    activities: [
      { id: "s", materiaId: "matematica", tipo: "examen", maximo: 100 },
      { id: "h", materiaId: "matematica", tipo: "tarea", maximo: 100 },
      { id: "auto", materiaId: "matematica", tipo: "auto", maximo: 5, interno: true }
    ],
    gradesList: [
      { actividadId: "s", alumnoId: "a", nota: 80, valor: 80, estadoEntrega: "a_tiempo" },
      { actividadId: "h", alumnoId: "a", nota: 70, valor: 70, estadoEntrega: "a_tiempo" },
      { actividadId: "auto", alumnoId: "a", nota: 100, valor: 5 }
    ],
    attendanceRows: [{ alumnoId: "a", fecha: "2026-02-02", estado: "licencia" }]
  };
  await module.render(f.context, { readCache: async () => snapshot, refresh: async () => { throw new Error("No debe descargar"); } });
  const body = f.root.innerHTML.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  assert.equal((body.match(/>79<\/td>/g) || []).length, 7);
});

test("una descarga que no responde termina con error recuperable", async () => {
  const draws = [];
  await cargarVistaDocente({ container: {}, isCurrent: () => true, readCache: async () => null,
    refresh: () => new Promise(() => {}), draw: (data, state = {}) => draws.push(state), timeoutMs: 5 });
  assert.equal(draws[0].loading, true);
  assert.match(draws.at(-1).error, /conectar/);
});

test("la cache sigue funcionando sin sessionStorage o cuando se llena su cuota", () => {
  const broken = { getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("cuota"); }, removeItem() {} };
  const cache = crearCacheSesionPrivada({ storage: () => broken });
  cache.write("docente-a", { updatedAt: Date.now(), data: { valor: 8 } });
  assert.equal(cache.read("docente-a").data.valor, 8);
  assert.equal(cache.read("docente-b"), null);
  limpiarDatosPrivados([]);
  assert.equal(cache.read("docente-a"), null);
});

test("una escritura fallida no recupera una copia anterior del almacenamiento", () => {
  const persisted = store(), time = Date.now();
  persisted.setItem("notas", JSON.stringify({ updatedAt: time, data: "anterior" }));
  const cache = crearCacheSesionPrivada({ storage: () => ({ ...persisted, setItem() { throw new Error("cuota"); } }) });
  cache.write("notas", { updatedAt: time, data: "actual" });
  assert.equal(cache.read("notas").data, "actual");
});

test("la copia en memoria caduca igual que la copia persistida", () => {
  const cache = crearCacheSesionPrivada({ storage: () => { throw new Error("sin storage"); } });
  cache.write("notas", { updatedAt: Date.now() - CACHE_MAX_AGE - 1, data: "privado" });
  assert.equal(cache.read("notas"), null);
});
