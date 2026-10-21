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
