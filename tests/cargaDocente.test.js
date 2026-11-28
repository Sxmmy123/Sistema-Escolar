import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { crearCacheSesionPrivada } from "../src/services/cacheSesionPrivada.js";
import { CACHE_MAX_AGE, cacheVigente, limpiarDatosPrivados, revisionCachePrivada } from "../src/services/cachePrivada.js";
import { cargarVistaDocente } from "../src/modules/docente/CargaVistaDocente.js";
import { claveCache, establecerConfiguracion } from "../src/services/rutasFirestore.js";
import { DAYS, findSubject, periodsForCourse } from "../src/data/catalog.js";

const original = new Map(["document", "sessionStorage", "localStorage"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const store = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
};
const roots = new Map();
let teacherState, renderers, renderDashboardSchedule, nextSchoolDayInfo, todayDayId;
before(async () => {
  globalThis.sessionStorage = store();
  globalThis.localStorage = store();
  globalThis.document = { querySelector: (key) => roots.get(key) || null, querySelectorAll: (key) => roots.has(key) ? [roots.get(key)] : [] };
  ({ teacherState } = await import("../src/modules/docente/EstadoDocente.js"));
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2 });
  const { renderNotes } = await import("../src/modules/docente/NotasDocente.js");
  const { renderBulletin } = await import("../src/modules/docente/BoletinDocente.js");
  const { renderTeacherSchedule } = await import("../src/modules/docente/HorarioDocente.js");
  ({ renderDashboardSchedule } = await import("../src/modules/docente/PanelDocente.js"));
  ({ nextSchoolDayInfo, todayDayId } = await import("../src/services/teacherData.js"));
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
  const root = { innerHTML: "", querySelector: (selector) => selector === module.button && root.innerHTML.includes(module.button.slice(1, -1))
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

test("Horario no muestra un boton para cargar o actualizar despues de la carga automatica", async () => {
  const module = renderers[2], { context, root, data } = fixture(module);
  await module.render(context, { readCache: async () => null, refresh: async () => data });
  assert.doesNotMatch(root.innerHTML, /data-refresh-teacher-schedule|Cargar horario|Actualizar horario/);
});

function dashboardFixture() {
  roots.clear();
  const listeners = new Map();
  const today = { innerHTML: "", querySelector: (selector) => selector === "[data-retry-dashboard-schedule]" && today.innerHTML.includes("data-retry-dashboard-schedule") ? { addEventListener: (event, callback) => listeners.set(event, callback) } : null };
  const tomorrow = { innerHTML: "" }, count = { textContent: "" };
  roots.set("[data-teacher-today]", today);
  roots.set("[data-teacher-tomorrow]", tomorrow);
  roots.set('[data-teacher-count="classesToday"]', count);
  const context = { uid: "panel-prueba", courses: [{ id: "cuarto_a", nombre: "Cuarto A", materias: ["matematica"] }] };
  teacherState.context = context;
  const rows = [...new Set([todayDayId(), nextSchoolDayInfo().dayId])].filter(Boolean).map((diaId) => ({ cursoId: "cuarto_a", diaId, periodo: "1", hora: "07:30 - 08:10", materiaId: "matematica", materia: "Matematica automatica", color: "#f0aaaa" }));
  return { context, today, tomorrow, count, rows, listeners };
}

test("el Panel carga el horario al entrar por primera vez y muestra el proximo dia sin visitar Horario", async () => {
  const f = dashboardFixture();
  let calls = 0, finish;
  const pending = renderDashboardSchedule(f.context, { readCache: async () => null, refresh: () => { calls++; return new Promise((resolve) => { finish = resolve; }); } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(f.today.innerHTML, /Cargando horario/);
  finish(f.rows);
  await pending;
  assert.equal(calls, 1);
  assert.match(f.tomorrow.innerHTML, /Matematica automatica/);
  assert.equal(f.count.textContent, todayDayId() ? "1" : "0");
  assert.doesNotMatch(f.today.innerHTML + f.tomorrow.innerHTML, /Carga el horario|data-retry-dashboard-schedule/);
});

test("el Panel conserva una copia vigente del horario sin volver a descargarla", async () => {
  const f = dashboardFixture();
  await renderDashboardSchedule(f.context, { readCache: async () => f.rows, refresh: async () => { throw new Error("No debe descargar"); } });
  assert.match(f.tomorrow.innerHTML, /Matematica automatica/);
  assert.doesNotMatch(f.today.innerHTML, /role="alert"/);
});

test("un fallo del horario del Panel permite reintentar y desaparece al recuperarse", async () => {
  const f = dashboardFixture();
  let calls = 0;
  await renderDashboardSchedule(f.context, { readCache: async () => null, refresh: async () => { if (++calls === 1) throw new Error("sin red"); return f.rows; } });
  assert.match(f.today.innerHTML, /role="alert"/);
  assert.match(f.today.innerHTML, /Reintentar/);
  await f.listeners.get("click")();
  assert.equal(calls, 2);
  assert.match(f.tomorrow.innerHTML, /Matematica automatica/);
  assert.doesNotMatch(f.today.innerHTML, /role="alert"|Reintentar/);
});

test("el horario del Panel no cambia una pantalla abandonada ni otra sesion", async () => {
  for (const leavePage of [true, false]) {
    const f = dashboardFixture();
    let finish;
    const pending = renderDashboardSchedule(f.context, { readCache: async () => null, refresh: () => new Promise((resolve) => { finish = resolve; }) });
    await new Promise((resolve) => setImmediate(resolve));
    if (leavePage) roots.clear();
    else teacherState.context = { uid: "otro-docente" };
    f.today.innerHTML = "Otra pantalla";
    finish(f.rows);
    await pending;
    assert.equal(f.today.innerHTML, "Otra pantalla");
  }
});

async function scheduleService(getSchedule, DateClass = Date) {
  const source = (await readFile(new URL("../src/services/teacherData.js", import.meta.url), "utf8"))
    .replace(/^\uFEFF/, "").replace(/^import[\s\S]*?;\r?\n/gm, "").replace(/^export \{[^}]*\};?\r?$/gm, "").replace(/^export /gm, "");
  const storage = store();
  return vm.runInNewContext(`${source}; ({ getTeacherScheduleRows, refreshTeacherScheduleCache, todayDayId })`, {
    crearCacheSesionPrivada: () => crearCacheSesionPrivada({ storage: () => storage }), claveCache, cacheVigente, revisionCachePrivada, getSchedule, DAYS, findSubject, periodsForCourse,
    Date: DateClass, auth: { currentUser: { uid: "horario-prueba" } }
  });
}

const scheduleContext = (uid = "horario-prueba") => ({ uid, courses: [{ id: "cuarto_a", nombre: "Cuarto A", materias: ["matematica", "lenguaje"] }] });
const scheduleData = (subject = "matematica") => ({ periodos: [{ id: "p1", label: "1", hora: "07:30 - 08:10" }], clases: { p1: { lunes: subject, martes: subject } } });

test("el servicio descarga el horario automaticamente y reutiliza la copia entre Panel, Agenda y Horario", async () => {
  limpiarDatosPrivados([]);
  let calls = 0;
  const service = await scheduleService(async () => { calls++; return scheduleData(); });
  const rows = await service.getTeacherScheduleRows(scheduleContext());
  assert.equal(rows.length, 2);
  assert.equal(calls, 1);
  assert.equal((await service.getTeacherScheduleRows(scheduleContext(), "martes")).length, 1);
  assert.equal(calls, 1);
});

test("cacheOnly no descarga y forceRemote actualiza incluso una copia vigente", async () => {
  limpiarDatosPrivados([]);
  let calls = 0;
  const service = await scheduleService(async () => scheduleData(++calls === 1 ? "matematica" : "lenguaje"));
  assert.equal((await service.getTeacherScheduleRows(scheduleContext(), null, { cacheOnly: true })).length, 0);
  assert.equal(calls, 0);
  assert.equal((await service.getTeacherScheduleRows(scheduleContext()))[0].materiaId, "matematica");
  assert.equal((await service.getTeacherScheduleRows(scheduleContext(), null, { forceRemote: true }))[0].materiaId, "lenguaje");
  assert.equal(calls, 2);
});

test("las cargas simultaneas comparten la misma consulta y no guardan resultados de otra sesion", async () => {
  limpiarDatosPrivados([]);
  let calls = 0, finish;
  const service = await scheduleService(() => { calls++; return new Promise((resolve) => { finish = resolve; }); });
  const first = service.getTeacherScheduleRows(scheduleContext());
  const second = service.refreshTeacherScheduleCache(scheduleContext());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  limpiarDatosPrivados([]);
  finish(scheduleData());
  const settled = await Promise.allSettled([first, second]);
  assert.ok(settled.every((result) => result.status === "rejected" && /sesion cambio/.test(result.reason.message)));
  assert.equal((await service.getTeacherScheduleRows(scheduleContext(), null, { cacheOnly: true })).length, 0);
});

test("un fallo de descarga no bloquea el siguiente intento ni mezcla horarios entre usuarios", async () => {
  limpiarDatosPrivados([]);
  let calls = 0;
  const service = await scheduleService(async () => { if (++calls === 1) throw new Error("sin red"); return scheduleData(); });
  await assert.rejects(service.getTeacherScheduleRows(scheduleContext()), /sin red/);
  assert.equal((await service.getTeacherScheduleRows(scheduleContext())).length, 2);
  assert.equal((await service.getTeacherScheduleRows(scheduleContext("otro"), null, { cacheOnly: true })).length, 0);
  assert.equal(calls, 2);
});

test("el Panel no considera el lunes como el dia de hoy durante sabado o domingo", async () => {
  for (const date of ["2026-11-28T12:00:00", "2026-11-29T12:00:00"]) {
    class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [date])); } }
    const service = await scheduleService(async () => scheduleData(), FixedDate);
    assert.equal(service.todayDayId(), "");
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
