import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { claveCache, establecerConfiguracion } from "../src/services/rutasFirestore.js";
import { directorAlertKey, markDirectorAlertViewed, readDirectorSeenKeys, unseenDirectorAlerts } from "../src/services/avisosDirector.js";

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
};
const attendance = { kind: "attendance", studentId: "a", courseId: "cuarto_a", trimesterId: "t1", title: "Alumno A", detail: "Cuarto A · 9 faltas", value: "9", threshold: 4, dates: ["2026-02-04", "2026-02-05"] };
const grade = { kind: "grade", studentId: "a", courseId: "cuarto_a", trimesterId: "t1", title: "Alumno A", detail: "Cuarto A · promedio 45/100", value: "45", threshold: 51, subjects: [{ id: "matematica", name: "Matematica", score: 45 }] };

test("el aviso visto se conserva al recargar y separa faltas de notas", async () => {
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2 });
  const local = storage();
  markDirectorAlertViewed("director-persistencia", attendance, local);
  assert.deepEqual(unseenDirectorAlerts([attendance, grade], readDirectorSeenKeys("director-persistencia", "t1", local)), [grade]);
  const reloaded = await import("../src/services/avisosDirector.js?recarga-avisos");
  assert.equal(reloaded.unseenDirectorAlerts([attendance], reloaded.readDirectorSeenKeys("director-persistencia", "t1", local)).length, 0);
});

test("los vistos se separan por usuario, gestion y trimestre", () => {
  const local = storage();
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2 });
  markDirectorAlertViewed("director-contexto", attendance, local);
  assert.equal(readDirectorSeenKeys("otro-director", "t1", local).length, 0);
  assert.equal(readDirectorSeenKeys("director-contexto", "t2", local).length, 0);
  establecerConfiguracion({ gestionActivaId: "2027", versionModelo: 2 });
  assert.equal(readDirectorSeenKeys("director-contexto", "t1", local).length, 0);
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2 });
});

test("actualizar la copia no repite avisos y un cambio real genera uno nuevo", () => {
  assert.equal(directorAlertKey(attendance), directorAlertKey({ ...attendance, updatedAt: 12345, dates: [...attendance.dates].reverse() }));
  assert.notEqual(directorAlertKey(attendance), directorAlertKey({ ...attendance, value: "10", dates: [...attendance.dates, "2026-02-06"] }));
  assert.notEqual(directorAlertKey(grade), directorAlertKey({ ...grade, subjects: [{ ...grade.subjects[0], score: 44 }] }));
  const seen = [directorAlertKey(attendance)];
  assert.equal(unseenDirectorAlerts([{ ...attendance, updatedAt: Date.now() }], seen).length, 0);
});

test("el aviso se oculta en memoria si localStorage falla", () => {
  const blocked = { getItem() { throw new Error("Bloqueado"); }, setItem() { throw new Error("Bloqueado"); } };
  markDirectorAlertViewed("director-sin-storage", attendance, blocked);
  assert.equal(unseenDirectorAlerts([attendance], readDirectorSeenKeys("director-sin-storage", "t1", blocked)).length, 0);
  markDirectorAlertViewed("", attendance, blocked);
  assert.equal(readDirectorSeenKeys("", "t1", blocked).length, 0);
});

class Element {
  constructor() {
    const classes = new Set();
    this.classList = { add: (...values) => values.forEach((value) => classes.add(value)), remove: (...values) => values.forEach((value) => classes.delete(value)), contains: (value) => classes.has(value), toggle(value, enabled) { const on = enabled ?? !classes.has(value); on ? classes.add(value) : classes.delete(value); return on; } };
    this.innerHTML = "";
    this.textContent = "";
    this.dataset = {};
    this.attributes = {};
    this.children = new Map();
    this.events = new Map();
  }
  querySelector(selector) { return this.children.get(selector) || null; }
  addEventListener(event, handler, options = {}) { this.events.set(event, { handler, signal: options.signal }); }
  fire(event, detail) { const listener = this.events.get(event); if (listener && !listener.signal?.aborted) return listener.handler(detail); }
  setAttribute(key, value) { this.attributes[key] = value; }
  focus() { this.focused = true; }
  contains() { return false; }
}

function notificationUI() {
  const local = storage();
  const session = storage();
  const root = new Element();
  const toggle = new Element();
  const panel = new Element();
  const refresh = new Element();
  const badge = new Element();
  const content = new Element();
  const term = new Element();
  const modal = new Element();
  const holder = new Element();
  const closeButton = new Element();
  const document = new Element();
  const window = new Element();
  window.location = { hash: "#/director" };
  window.dispatchEvent = () => {};
  const elements = new Map([
    ["[data-director-alerts]", root], ["[data-director-alert-toggle]", toggle], ["[data-director-alert-panel]", panel],
    ["[data-director-alert-content]", content], ["[data-director-alert-term]", term], ["[data-director-alert-modal]", modal]
  ]);
  document.querySelector = (selector) => elements.get(selector) || null;
  document.querySelectorAll = (selector) => selector === "[data-director-alert-badge]" ? [badge] : [];
  root.children.set("[data-director-alert-toggle]", toggle);
  root.children.set("[data-director-alert-panel]", panel);
  root.children.set("[data-director-alert-refresh]", refresh);
  modal.children.set("[data-director-alert-modal-content]", holder);
  holder.children.set("[data-close-director-alert-modal]", closeButton);
  panel.classList.add("hidden");
  modal.classList.add("hidden");
  const snapshot = { trimesterId: "t1", gradeThreshold: 51, absenceLimit: 4, updatedAt: Date.now(), items: [attendance, grade], total: 2 };
  local.setItem(claveCache("director_alertas", "director-ui"), JSON.stringify({ version: 3, snapshot }));
  const context = vm.createContext({
    console, Date, AbortController, Event, document, window, localStorage: local, sessionStorage: session,
    auth: { currentUser: { uid: "director-ui" } }, claveCache,
    COURSES: [{ id: "cuarto_a", nombre: "Cuarto A" }],
    icon: () => "", refreshDirectorIcons() {}, escapeDirectorHtml: (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
    directorAlertKey, unseenDirectorAlerts,
    markDirectorAlertViewed: (uid, item) => markDirectorAlertViewed(uid, item, local),
    readDirectorSeenKeys: (uid, trimesterId) => readDirectorSeenKeys(uid, trimesterId, local)
  });
  let code = readFileSync(new URL("../src/modules/director/DirectorAlerts.js", import.meta.url), "utf8");
  code = code.replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "").replace(/export function /g, "function ");
  vm.runInContext(`${code}\nthis.ui = { bindDirectorAlerts, renderAlerts, buildAlertSnapshot };`, context);
  const clickItem = (item) => root.fire("click", { target: { closest: () => ({ dataset: { directorAlertItem: directorAlertKey(item) } }) } });
  return { ...context.ui, context, local, root, toggle, badge, modal, holder, document, window, content, term, snapshot, clickItem };
}

test("abrir el aviso muestra modal, no navega y reduce el contador al instante", () => {
  const ui = notificationUI();
  ui.bindDirectorAlerts("/director");
  assert.equal(ui.badge.textContent, "2");
  ui.clickItem(attendance);
  assert.equal(ui.modal.classList.contains("hidden"), false);
  assert.match(ui.holder.innerHTML, /Alumno A/);
  assert.match(ui.holder.innerHTML, /Ver asistencia/);
  assert.equal(ui.window.location.hash, "#/director");
  assert.equal(ui.badge.textContent, "1");
  assert.doesNotMatch(ui.content.innerHTML, /9 faltas/);
  assert.match(ui.content.innerHTML, /promedio 45/);
  ui.document.fire("keydown", { key: "Escape" });
  assert.equal(ui.modal.classList.contains("hidden"), true);
  assert.equal(ui.toggle.focused, true);
  ui.renderAlerts({ ...ui.snapshot, updatedAt: Date.now() });
  assert.equal(ui.badge.textContent, "1");
  ui.clickItem(grade);
  assert.match(ui.holder.innerHTML, /Matematica/);
  assert.equal(ui.badge.classList.contains("hidden"), true);
  assert.match(ui.content.innerHTML, /No hay avisos nuevos/);
  ui.modal.fire("click", { target: { closest: (selector) => selector === "[data-director-alert-go]" ? {} : null } });
  assert.equal(ui.window.location.hash, "#/director/notas");
  assert.equal(ui.context.sessionStorage.getItem("directorNotasEstudiante"), "a");
  ui.bindDirectorAlerts("/");
});

test("el snapshot conserva todos los alumnos, no solo los primeros tres", async () => {
  const ui = notificationUI();
  const students = Array.from({ length: 8 }, (_, index) => ({ id: `s${index}`, nombre: `Alumno ${index}`, cursoId: "cuarto_a", activo: true }));
  Object.assign(ui.context, {
    listDirectorStudents: async () => students,
    listDirectorAllActivities: async () => [],
    listDirectorGrades: async () => [],
    getDirectorAttendanceSettings: async () => ({ limiteFaltas: 4 }),
    listDirectorAttendanceByTrimester: async () => students.flatMap((student) => Array.from({ length: 5 }, (_, day) => ({ alumnoId: student.id, estado: "falta", fecha: `2026-02-${String(day + 2).padStart(2, "0")}` }))),
    calculateCourseTerm: () => ({ studentResults: [] })
  });
  const result = await ui.buildAlertSnapshot();
  assert.equal(result.total, 8);
  assert.equal(result.items.length, 8);
  assert.equal(result.items[0].dates.length, 5);
});

function communicationsService() {
  const writes = [], streams = [], profiles = new Map();
  const auth = { currentUser: { uid: "director-a" } };
  const context = vm.createContext({
    Date, Map, Error, auth, firestore: {}, fechaEscolarIso: () => "2026-10-31",
    coleccionGestion: (_, name) => name, documentoGestion: (_, name, id) => ({ name, id }),
    doc: (_, name, id) => ({ name, id }), getDoc: async ({ id }) => ({ exists: () => profiles.has(id), data: () => profiles.get(id) }),
    query: (source, ...filters) => ({ source, filters }), where: (field, op, value) => ({ field, op, value }),
    onSnapshot(request, next, error) { const stream = { request, next, error, stopped: false }; streams.push(stream); return () => { stream.stopped = true; }; },
    getDocs: async () => ({ docs: [] }), serverTimestamp: () => "server-time", safeAudit: async () => {}, updateDoc: async () => {},
    addDoc: async (source, data) => { writes.push({ source, data }); return { id: "nuevo-aviso" }; }
  });
  const code = readFileSync(new URL("../src/services/comunicadosDocentes.js", import.meta.url), "utf8").replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "").replace(/export (async )?function /g, "$1function ");
  vm.runInContext(`${code}\nthis.service = { createCommunication, watchActiveCommunications, communicationAudience };`, context);
  const emit = (index, items) => streams[index].next({ docs: items.map(({ id, ...data }) => ({ id, data: () => data })) });
  return { ...context.service, auth, writes, streams, profiles, emit };
}

test("el comunicado individual valida al docente activo y guarda su destinatario sin hacerlo global", async () => {
  const ui = communicationsService();
  ui.profiles.set("docente-a", { rol: "docente", activo: true, nombre: "Aracely Michme" });
  const input = { titulo: "Coordinacion", motivo: "Revisar el informe", fechaEvento: "2026-11-02", horaEvento: "15:00", alcance: "docente", destinatarioUid: "docente-a" };
  await ui.createCommunication(input);
  const item = ui.writes[0].data;
  assert.equal(item.destinatarioUid, "docente-a"); assert.equal(item.destinatarioNombre, "Aracely Michme");
  assert.equal(item.destinatariosRol.length, 0); assert.equal(ui.communicationAudience(item), "Aracely Michme");
  ui.profiles.set("docente-a", { rol: "docente", activo: false });
  await assert.rejects(ui.createCommunication(input), /ya no esta activo/);
  await assert.rejects(ui.createCommunication({ ...input, destinatarioUid: "" }), /Selecciona un docente/);
  await assert.rejects(ui.createCommunication({ ...input, destinatarioUid: "inexistente" }), /ya no esta activo/);
  assert.equal(ui.writes.length, 1);
});

test("el envio general ignora una seleccion individual anterior y los avisos antiguos conservan su alcance", async () => {
  const ui = communicationsService();
  await ui.createCommunication({ titulo: "Reunion", motivo: "Plantel docente", fechaEvento: "2026-11-02", horaEvento: "15:00", alcance: "todos", destinatarioUid: "docente-a" });
  const item = ui.writes[0].data;
  assert.equal(item.destinatarioUid, ""); assert.equal(item.destinatarioNombre, "");
  assert.equal(item.destinatariosRol.join(), "docente"); assert.equal(ui.communicationAudience({ destinatariosRol: ["docente"] }), "Todos los docentes");
});

test("la campana combina solo comunicados generales y propios, sin duplicados ni vencidos", () => {
  const ui = communicationsService(), delivered = [];
  ui.auth.currentUser.uid = "docente-a";
  const stop = ui.watchActiveCommunications((items) => delivered.push(items), assert.fail);
  assert.equal(ui.streams[0].request.filters[0].field, "destinatariosRol");
  assert.equal(ui.streams[1].request.filters[0].value, "docente-a");
  const general = { id: "general", destinatariosRol: ["docente"], fechaEvento: "2026-11-02", horaEvento: "15:00", activo: true };
  const mine = { id: "personal", destinatariosRol: [], destinatarioUid: "docente-a", fechaEvento: "2026-11-01", horaEvento: "10:00", activo: true };
  ui.emit(0, [general]); assert.equal(delivered.length, 0);
  ui.emit(1, [mine, general, { ...mine, id: "otro", destinatarioUid: "docente-b" }, { ...mine, id: "vencido", fechaEvento: "2026-10-30" }]);
  assert.equal(delivered.length, 1); assert.equal(delivered[0].map((item) => item.id).join(), "personal,general");
  stop(); assert.ok(ui.streams.every((stream) => stream.stopped));
  ui.emit(0, []); assert.equal(delivered.length, 1);
});

test("cambiar de cuenta o fallar una consulta cierra ambas suscripciones de comunicados", () => {
  const ui = communicationsService(), delivered = [], failures = [];
  ui.auth.currentUser.uid = "docente-a";
  ui.watchActiveCommunications((items) => delivered.push(items), (error) => failures.push(error));
  ui.auth.currentUser.uid = "docente-b"; ui.emit(0, []);
  assert.ok(ui.streams.every((stream) => stream.stopped)); assert.equal(delivered.length, 0);
  const other = communicationsService();
  other.watchActiveCommunications(assert.fail, (error) => failures.push(error));
  other.streams[1].error(new Error("Sin conexion"));
  assert.ok(other.streams.every((stream) => stream.stopped)); assert.equal(failures.length, 1);
});
