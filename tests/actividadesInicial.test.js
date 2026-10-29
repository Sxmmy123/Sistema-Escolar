import assert from "node:assert/strict";
import test from "node:test";
import { dimensionesActividad, opcionesActividad, validarCriteriosActividad, generarCriteriosGemini, validarAccesoActividad, validarBorradorCriterios } from "../functions/criterios-core.js";
import { validarActividadInicial, ordenarActividadesInicial, prioridadesInicial, actividadesRegistrablesInicial, siguientePasoRegistroInicial } from "../src/services/modeloActividadesInicial.js";
import { fuentesParaGemini, firmaFuentes } from "../functions/informe-core.js";
import { ActividadesInicial } from "../src/modules/docente-inicial/ActividadesInicial.js";
import { RegistroInicial } from "../src/modules/docente-inicial/RegistroInicial.js";
import { BitacoraInicial } from "../src/modules/docente-inicial/BitacoraInicial.js";
import { crearDatosInicial } from "../src/modules/docente-inicial/datosInicial.js";
import { findCourse, findSubject } from "../src/data/catalog.js";
import { establecerConfiguracion } from "../src/services/rutasFirestore.js";
import { geminiDevPlugin } from "../functions/dev-gemini.js";
import { abrirPreparacionActividad } from "../src/modules/docente-inicial/PrepararActividadInicial.js";
import { animarSeleccionActividad, desplazamientoActividad, marcoTarjetaActividad, caidaAlumnoInicial } from "../src/modules/docente-inicial/AnimacionRegistroInicial.js";
import { animarCambioAlumnoInicial, medirSeleccionAlumnoInicial } from "../src/modules/docente-inicial/AnimacionAlumnoInicial.js";
import { animarSelectorAlumnosInicial } from "../src/modules/docente-inicial/AnimacionSelectorAlumnoInicial.js";
const context = { uid: "docente", gestionId: "2026", courses: [findCourse("inicial")] };
const criteria = Object.fromEntries(dimensionesActividad.map((dimension) => [dimension, { criterio: `Criterio ${dimension}`, opciones: Object.fromEntries(opcionesActividad.map((id) => [id, `Opcion ${dimension} ${id}`])) }]));
const activities = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, docenteUid: "docente", cursoId: "inicial", trimestreId: "t1", materiaId: i % 2 ? "lenguaje" : "artes_plasticas", titulo: `Actividad ${i}`, descripcion: "Construir con carton", prioritaria: true, estado: "pendiente", orden: String(i), criterios: criteria }));
function state(rows = activities) {
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: true });
  return { context, courseId: "inicial", termId: "t1", route: "/docente/actividades", activityLimit: 5, activityView: "board", dimension: "ser", soloContenido: true, iaAvailable: true, criteriaDraft: () => null, advanceDraft: () => ({}), noteDraft: () => ({ descripcion: "" }), data: { leer: (type) => type === "activities" ? rows : type === "students" ? [{ id: "s1", nombre: "Alumno de prueba" }] : [] } };
}
function preparationFixture() {
  const body = { innerHTML: "" }, listeners = {}, writes = [], jobs = [];
  let closed = false;
  const draft = { id: "docente_nueva", materiaId: "artes_plasticas", titulo: "Muneco", descripcion: "Construir con carton", prioritaria: true, criterios: structuredClone(criteria), dimension: "ser", step: "criterios" };
  const host = { querySelector: (selector) => selector === ".initial-dialog" ? { classList: { add() {} } } : body, addEventListener: (type, callback) => { listeners[type] = callback; } };
  abrirPreparacionActividad({ state: { context, courseId: "inicial", termId: "t1", iaAvailable: true }, data: { guardarActividad: async (input) => writes.push(input) }, dialog: () => ({ host, signal: new AbortController().signal, close: () => { closed = true; } }), run: (operation) => jobs.push(operation()), assertWritable() {}, drafts: new Map([[JSON.stringify(["inicial", "t1", "nueva"]), draft]]) });
  return { body, writes, jobs, closed: () => closed,
    accept: () => listeners.click({ target: { closest: () => ({ disabled: false, dataset: {}, hasAttribute: (name) => name === "data-wizard-accept" }) } }),
    edit: (field, value) => listeners.input({ target: { dataset: { wizardCriterion: field }, value } })
  };
}
test("aceptar criterios y crear es la unica confirmacion, sin checks por dimension", async () => {
  const fixture = preparationFixture();
  assert.doesNotMatch(fixture.body.innerHTML, /wizard-reviewed|visto bueno|type="checkbox"/);
  assert.match(fixture.body.innerHTML, /Aceptar criterios y crear/);
  assert.doesNotMatch(fixture.body.innerHTML, /data-wizard-accept disabled/);
  fixture.edit("criterio", "Comparte materiales con respeto");
  fixture.accept(); await Promise.all(fixture.jobs);
  assert.equal(fixture.closed(), true); assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.writes[0].criterios.ser.criterio, "Comparte materiales con respeto");
});
test("quitar los checks no permite aceptar un criterio vacio", () => {
  const fixture = preparationFixture(); fixture.edit("criterio", "   "); fixture.accept();
  assert.equal(fixture.closed(), false); assert.equal(fixture.writes.length, 0);
  assert.match(fixture.body.innerHTML, /role="alert"/);
});
test("actividades no requieren fecha ni nota y validan materia y longitud", () => {
  const value = validarActividadInicial({ titulo: "  Muneco de carton ", descripcion: "Material reciclado", materiaId: "artes_plasticas", fecha: "2026-12-01", nota: 90 });
  assert.equal(value.titulo, "Muneco de carton"); assert.equal(value.fecha, undefined); assert.equal(value.nota, undefined);
  for (const change of [{ titulo: "" }, { titulo: "a".repeat(151) }, { descripcion: "a".repeat(2001) }, { materiaId: "inventada" }]) assert.throws(() => validarActividadInicial({ ...value, ...change }));
});
test("el orden se conserva entre materias y solo las pendientes prioritarias pasan a Registro", () => {
  const rows = [...activities].reverse();
  assert.equal(ordenarActividadesInicial(rows)[0].id, "a0");
  assert.deepEqual(prioridadesInicial([...rows, { ...activities[0], id: "otro", estado: "eliminada" }, { ...activities[0], id: "sin-prioridad", prioritaria: false }]).map((row) => row.id), activities.map((row) => row.id));
});
test("tablero por materia y lista enumerada comparten colores, orden y eliminacion confirmable", () => {
  const view = state(); const html = ActividadesInicial(view);
  assert.match(html, /initial-activity-board/); assert.ok(html.includes(`--surface-color:${findSubject("artes_plasticas").color}`));
  assert.match(html, /data-activity-action="eliminar"/);
  view.activityView = "list"; const list = ActividadesInicial(view);
  assert.match(list, /Subir prioridad/); assert.match(list, /Bajar prioridad/); assert.match(list, /initial-activity-table/);
});
test("Registro empieza con cinco prioritarias, cargar mas muestra el resto y no obliga fecha", () => {
  const view = state(); view.route = "/docente/registro";
  let html = RegistroInicial(view);
  assert.equal((html.match(/data-activity-open=/g) || []).length, 5); assert.match(html, /more-activities/);
  view.activityLimit = 10; html = RegistroInicial(view);
  assert.equal((html.match(/data-activity-open=/g) || []).length, 8); assert.doesNotMatch(html, /more-activities|type="date"|puntaje/);
});
test("una actividad sin criterios no permite valorar; habilitada ofrece cuatro opciones por dimension", () => {
  const view = state([{ ...activities[0], criterios: {} }]); view.route = "/docente/registro"; view.activityId = "a0";
  assert.match(RegistroInicial(view), /Sin actividades con criterios aprobados/); assert.doesNotMatch(RegistroInicial(view), /generate-criteria|data-activity-rate=/);
  view.data.leer = (type) => type === "activities" ? [{ ...activities[0], criterios: criteria }] : type === "students" ? [{ id: "s1", nombre: "Prueba" }] : [];
  view.studentId = "s1"; view.registrationStudentSelected = true;
  assert.equal((RegistroInicial(view).match(/data-activity-rate=/g) || []).length, 4);
  assert.match(RegistroInicial(view), /no_observado/);
  assert.doesNotMatch(RegistroInicial(view), /save-advance|save-next-advance|data-activity-open=/);
  assert.match(RegistroInicial(view), /data-activity-grid/); assert.doesNotMatch(RegistroInicial(view), /Registrando a|initial-active-student/);
});

test("cada alumno muestra tres segmentos guardados por dimension y solo el seleccionado lleva flecha", () => {
  const view = state(); view.activityId = "a0"; view.studentId = "s1"; view.registrationStudentSelected = true;
  const rows = ["hacer", "ser"].map((dimension) => ({ tipo: "actividad", actividadId: "a0", alumnoId: "s1", dimension }));
  rows.push({ tipo: "actividad", actividadId: "otra", alumnoId: "s1", dimension: "saber" });
  view.data.leer = (type) => type === "activities" ? activities : type === "students" ? [{ id: "s1", nombre: "Ana" }, { id: "s2", nombre: "Bruno" }] : rows;
  const html = RegistroInicial(view), tiles = (html.match(/<button[^>]*data-activity-student=[\s\S]*?<\/button>/g) || []).join("");
  assert.equal((tiles.match(/data-progress-dimension=/g) || []).length, 6);
  assert.equal((tiles.match(/data-lucide="triangle"/g) || []).length, 1);
  assert.match(tiles, /SER: registrado; SABER: pendiente; HACER: registrado/);
  assert.match(tiles, /data-progress-dimension="ser" class="is-saved"/);
  assert.match(tiles, /data-progress-dimension="saber" class=""/);
  assert.doesNotMatch(tiles, /\d\/3|user-round|check-check/);
  assert.equal((html.match(/>Ana</g) || []).length, 1);
});

function animationFixture() {
  const calls = [], states = new Set(), layers = [];
  const animate = (index) => (frames, options) => {
    let resolve, reject; const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
    calls.push({ index, frames, options, resolve });
    return { finished, cancel: () => reject(new Error("cancelled")) };
  };
  const card = { style: {}, classList: { add() {} }, removeAttribute() {}, animate: animate("card"), lastElementChild: { animate: animate("chevron") } };
  const document = { createElement: () => ({ setAttribute() {}, append() {}, remove() { layers.splice(layers.indexOf(this), 1); } }), body: { append: (layer) => layers.push(layer) } };
  const grid = { classList: { add: (name) => states.add(name), remove: (name) => states.delete(name) }, setAttribute() {}, removeAttribute() {}, querySelectorAll: () => items };
  const items = [0, 1, 2].map((index) => ({
    closest: () => grid, classList: { add() {}, remove() {} }, style: {}, cloneNode: () => card, dataset: { activityOpen: `a${index}` },
    getBoundingClientRect: () => ({ left: index * 220, top: 50, width: 200, height: 100 }),
    animate: animate(index)
  }));
  const destination = { style: { visibility: "" }, getBoundingClientRect: () => ({ left: 120, top: 150, width: 360, height: 112 }) };
  const workspace = { style: { overflow: "visible" }, getBoundingClientRect: () => ({ height: 420 }), animate: animate("workspace") };
  const detail = { animate: animate("detail") };
  const pupils = [0, 1, 2].map((index) => ({ getBoundingClientRect: () => ({ left: index * 210, top: 300, width: 190, height: 58 }), animate: animate(`student-${index}`) }));
  const roster = { ...grid, querySelectorAll: () => pupils };
  const focused = { ...items[1], dataset: { activityKey: "a1" }, hasAttribute: (name) => name === "data-activity-grid", getBoundingClientRect: destination.getBoundingClientRect };
  return { calls, states, items, pupils, focused, layers, destination, workspace, root: { ownerDocument: document, contains: (item) => items.includes(item) || item === focused, querySelector: (selector) => selector === ".initial-registration-students" ? roster : { getBoundingClientRect: () => ({ height: 220 }) }, querySelectorAll: (selector) => selector === "[data-activity-student]" ? pupils : [] }, incomingRoot: { querySelectorAll: (selector) => selector === "[data-activity-open]" ? items : selector === "[data-activity-student]" ? pupils : [], querySelector: (selector) => selector === "[data-activity-grid]" ? destination : selector === ".initial-registration-workspace" ? workspace : detail } };
}
test("las actividades convergen detras de la seleccionada antes de abrir el registro", async () => {
  assert.deepEqual(desplazamientoActividad({ left: 0, top: 0, width: 100, height: 60 }, { left: 220, top: 80, width: 120, height: 60 }), { x: 230, y: 80 });
  const fixture = animationFixture(), transition = animarSeleccionActividad(fixture.root, fixture.items[1]);
  assert.equal(fixture.calls.length, 2); assert.ok(fixture.states.has("is-collecting"));
  assert.match(fixture.calls[0].frames.at(-1).transform, /translate\(220px, 0px\)/);
  assert.match(fixture.calls[1].frames.at(-1).transform, /translate\(-220px, 0px\)/);
  assert.equal(fixture.calls[0].frames.at(-1).opacity, 0);
  fixture.calls.forEach((call) => call.resolve()); assert.equal(await transition.finished, true);
  transition.cancel(); assert.equal(fixture.states.size, 0);
});
test("la misma tarjeta anima ancho y posicion sin escalar texto y revela alumnos sin salto de altura", async () => {
  const fixture = animationFixture(), transition = animarSeleccionActividad(fixture.root, fixture.items[1]);
  fixture.calls.forEach((call) => call.resolve()); await transition.finished;
  const revealed = transition.reveal(fixture.incomingRoot);
  const card = fixture.calls.find((call) => call.index === "card"), workspace = fixture.calls.find((call) => call.index === "workspace");
  assert.deepEqual(card.frames[0], marcoTarjetaActividad(fixture.items[1].getBoundingClientRect()));
  assert.deepEqual(card.frames[1], marcoTarjetaActividad(fixture.destination.getBoundingClientRect()));
  assert.equal(card.frames[0].transform, undefined); assert.equal(card.frames[1].transform, undefined);
  assert.deepEqual(workspace.frames, [{ height: "220px" }, { height: "420px" }]);
  assert.equal(fixture.destination.style.visibility, "hidden"); assert.equal(fixture.layers.length, 1);
  fixture.calls.forEach((call) => call.resolve()); assert.equal(await revealed, true);
  transition.cancel(); assert.equal(fixture.destination.style.visibility, ""); assert.equal(fixture.workspace.style.overflow, "visible"); assert.equal(fixture.layers.length, 0);
});
test("la tarjeta seleccionada conserva el borde, contenido y tipografia del mosaico", () => {
  const view = state(); view.activityId = "a0";
  const html = RegistroInicial(view);
  assert.match(html, /initial-priority-item initial-selected-activity-toggle/);
  assert.match(html, /<strong>Actividad 0<\/strong><span>Artes Plasticas<\/span>/);
  assert.match(html, /initial-registration-workspace/); assert.match(html, /initial-registration-detail/);
  assert.doesNotMatch(html, /initial-subject-tag/);
});
test("cancelar la animacion libera el mosaico y respeta movimiento reducido", async () => {
  const fixture = animationFixture(), transition = animarSeleccionActividad(fixture.root, fixture.items[0]);
  transition.cancel(); assert.equal(await transition.finished, false); assert.equal(fixture.states.size, 0);
  const original = globalThis.matchMedia;
  try {
    globalThis.matchMedia = () => ({ matches: true });
    const reduced = animationFixture(), result = animarSeleccionActividad(reduced.root, reduced.items[0]);
    assert.equal(await result.finished, true); assert.equal(reduced.calls.length, 0); result.cancel();
  } finally { if (original) globalThis.matchMedia = original; else delete globalThis.matchMedia; }
});

test("los alumnos caen desde la actividad uno a uno y regresan por el mismo recorrido", async () => {
  const fixture = animationFixture(), opening = animarSeleccionActividad(fixture.root, fixture.items[1]);
  fixture.calls.forEach((call) => call.resolve()); await opening.finished;
  const revealed = opening.reveal(fixture.incomingRoot);
  const students = fixture.calls.filter((call) => String(call.index).startsWith("student-"));
  assert.equal(students.length, 3); assert.ok(students[0].options.delay < students[1].options.delay);
  assert.deepEqual(students[0].frames, caidaAlumnoInicial(fixture.pupils[0].getBoundingClientRect(), fixture.destination.getBoundingClientRect(), 0));
  assert.equal(students[0].frames[0].opacity, 0); assert.match(students[0].frames[1].transform, /7px/);
  fixture.calls.forEach((call) => call.resolve()); await revealed; opening.cancel();
  fixture.calls.length = 0;
  const closing = animarSeleccionActividad(fixture.root, fixture.focused);
  assert.equal(fixture.calls.length, 3); assert.ok(fixture.calls.every((call) => call.options.direction === "reverse"));
  assert.ok(fixture.calls[0].options.delay > fixture.calls[2].options.delay);
  fixture.calls.forEach((call) => call.resolve()); await closing.finished;
  const expanded = closing.reveal(fixture.incomingRoot);
  assert.equal(closing.focusTarget(), fixture.items[1]);
  const cards = fixture.calls.filter((call) => typeof call.index === "number");
  assert.equal(cards.length, 2); assert.equal(cards[0].frames[0].opacity, 0); assert.equal(cards[0].frames[1].opacity, 1);
  fixture.calls.forEach((call) => call.resolve()); assert.equal(await expanded, true); closing.cancel();
  assert.equal(fixture.layers.length, 0);
});

function studentPickerAnimationFixture() {
  const calls = [], attributes = new Map();
  const animated = (id, rect) => ({ getBoundingClientRect: () => rect, animate(frames, options) {
    let resolve; const finished = new Promise((done) => { resolve = done; });
    const call = { id, frames, options, resolve, cancelled: false }; calls.push(call);
    return { finished, cancel() { call.cancelled = true; resolve(); } };
  } });
  const pupils = [0, 1, 2].map((index) => animated(index, { left: 100 + index * 110, top: 220, width: 100, height: 90 }));
  const grid = { style: { pointerEvents: "auto" }, querySelectorAll: () => pupils, getAttribute: (name) => attributes.get(name) ?? null, setAttribute: (name, value) => attributes.set(name, value), removeAttribute: (name) => attributes.delete(name) };
  const dialog = animated("dialog", {}), backdrop = animated("backdrop", {});
  const host = { querySelector: (selector) => selector === ".initial-report-student-grid" ? grid : selector === ".initial-dialog" ? dialog : backdrop };
  const trigger = { getBoundingClientRect: () => ({ left: 80, top: 100, width: 300, height: 48 }) };
  return { calls, pupils, grid, host, trigger, attributes };
}

test("Bitacora despliega y recoge alumnos con la misma caida escalonada de Registro", async () => {
  const fixture = studentPickerAnimationFixture(), opening = animarSelectorAlumnosInicial(fixture.host, fixture.trigger);
  const pupils = fixture.calls.filter((item) => typeof item.id === "number");
  assert.equal(pupils.length, 3); assert.ok(pupils[0].options.delay < pupils[1].options.delay);
  assert.deepEqual(pupils[0].frames, caidaAlumnoInicial(fixture.pupils[0].getBoundingClientRect(), fixture.trigger.getBoundingClientRect(), 0));
  assert.equal(fixture.grid.style.pointerEvents, "none"); assert.equal(fixture.attributes.get("aria-busy"), "true");
  fixture.calls.forEach((item) => item.resolve()); assert.equal(await opening.finished, true);
  assert.equal(fixture.grid.style.pointerEvents, "auto"); assert.equal(fixture.attributes.has("aria-busy"), false);
  assert.ok(fixture.calls.every((item) => item.cancelled)); fixture.calls.length = 0;
  const closing = animarSelectorAlumnosInicial(fixture.host, fixture.trigger, true);
  const reverse = fixture.calls.filter((item) => typeof item.id === "number");
  assert.ok(reverse.every((item) => item.options.direction === "reverse"));
  assert.ok(reverse[0].options.delay > reverse[2].options.delay);
  assert.ok(fixture.calls.find((item) => item.id === "dialog").options.delay > 0);
  fixture.calls.forEach((item) => item.resolve()); assert.equal(await closing.finished, true);
});

test("cancelar el despliegue de Bitacora libera la lista y movimiento reducido evita animarla", async () => {
  const fixture = studentPickerAnimationFixture(), transition = animarSelectorAlumnosInicial(fixture.host, fixture.trigger);
  transition.cancel(); assert.equal(await transition.finished, false);
  assert.equal(fixture.grid.style.pointerEvents, "auto"); assert.equal(fixture.attributes.has("aria-busy"), false);
  const previous = globalThis.matchMedia;
  try {
    globalThis.matchMedia = () => ({ matches: true });
    const reduced = studentPickerAnimationFixture(), result = animarSelectorAlumnosInicial(reduced.host, reduced.trigger);
    assert.equal(await result.finished, true); assert.equal(reduced.calls.length, 0); result.cancel();
  } finally { if (previous) globalThis.matchMedia = previous; else delete globalThis.matchMedia; }
  assert.equal(await animarSelectorAlumnosInicial(null, null).finished, true);
});

test("el marco del alumno no repite su nombre y asocia el registro con el seleccionado", () => {
  const view = state(); view.activityId = "a0"; view.studentId = "s1"; view.registrationStudentSelected = true;
  const html = RegistroInicial(view);
  assert.match(html, /initial-student-bubble/); assert.match(html, /data-registration-student="s1"/);
  assert.match(html, /aria-label="Registro de Alumno de prueba"/); assert.match(html, /initial-selected-student/);
  const roster = html.slice(html.indexOf('class="initial-registration-students"'), html.indexOf('<section class="initial-activity-assessment '));
  assert.doesNotMatch(roster, /data-activity-student="s1"/);
  assert.equal((html.match(/>Alumno de prueba</g) || []).length, 1);
});

test("el alumno entra en el marco y este se adapta sin escalar las letras", async () => {
  const calls = [];
  const animated = (rect) => ({ style: { overflow: "visible" }, getBoundingClientRect: () => rect, animate(frames) { calls.push(frames); return { finished: Promise.resolve(), cancel() {} }; } });
  const student = { ...animated({ left: 30, top: 200, width: 180 }), dataset: { activityStudent: "b" } };
  const session = animated({ height: 500 }), frame = animated({}), content = animated({});
  const bubble = { ...animated({ left: 10, width: 600, height: 350 }), querySelector: (selector) => selector.endsWith("frame") ? frame : content };
  const root = { querySelectorAll: () => [student], querySelector: (selector) => selector.includes("is-active") ? student : selector === ".initial-student-bubble" ? bubble : session };
  assert.equal(medirSeleccionAlumnoInicial(root).studentId, "b");
  const transition = animarCambioAlumnoInicial(root, { studentId: "a", bubble: { width: 600, height: 310 }, session: { height: 460 }, tiles: { b: { left: 300, top: 50 } } });
  assert.ok(calls.some((frames) => frames[0].transform === "translate(270px, -150px)" && frames[1].transform === "translate(0, 0)"));
  assert.ok(calls.some((frames) => frames[0].height === "460px" && frames[1].height === "500px"));
  assert.equal(await transition.finished, true); transition.cancel(); assert.equal(session.style.overflow, "visible");
});
test("solo se generan criterios desde borradores acotados, sin datos adicionales de alumnos", () => {
  const result = validarBorradorCriterios({ materiaId: "lenguaje", titulo: " Las vocales ", descripcion: " Reconocer vocales ", alumno: "privado" });
  assert.deepEqual(result, { materiaId: "lenguaje", titulo: "Las vocales", descripcion: "Reconocer vocales" });
  for (const change of [{ materiaId: "inventada" }, { descripcion: "" }, { descripcion: "a".repeat(2001) }, { titulo: "a".repeat(151) }]) assert.throws(() => validarBorradorCriterios({ ...result, ...change }));
});
test("API de criterios valida asignacion antes de generar desde un borrador y no consulta alumnos", async () => {
  let handler, sent = "", role = "docente";
  geminiDevPlugin({ GEMINI_API_KEY: "prueba", GEMINI_MODEL: "modelo" }, { apiKey: "publica", projectId: "prueba" }).configureServer({ middlewares: { use: (_, callback) => { handler = callback; } } });
  const encode = (value) => typeof value === "string" ? { stringValue: value } : typeof value === "boolean" ? { booleanValue: value } : typeof value === "number" ? { integerValue: String(value) } : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  const document = (value) => ({ fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) });
  const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/La_Paz" }).format(new Date());
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    let result;
    if (url.includes("accounts:lookup")) result = { users: [{ localId: "docente" }] };
    else if (url.endsWith("usuarios/docente")) result = document({ rol: role, activo: true });
    else if (url.endsWith("configuracion/sistema")) result = document({ versionModelo: 2, gestionActivaId: year });
    else if (url.endsWith(`gestiones/${year}`)) result = document({ ano: Number(year) });
    else if (url.includes("asignaciones/")) result = document({ cursos: { inicial: { materias: {} } } });
    else if (url.includes("generativelanguage.googleapis.com")) { sent = options.body; result = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(criteria) }] } }] }; }
    else assert.fail(`No debe consultar registros, alumnos ni borradores inexistentes: ${url}`);
    return { ok: true, json: async () => result };
  };
  const call = (change = {}) => new Promise((resolve) => {
    const input = { gestionId: year, cursoId: "inicial", trimestreId: "t1", borrador: { materiaId: "artes_plasticas", titulo: "Muneco", descripcion: "Recortar carton", alumnoId: "NO ENVIAR" }, ...change };
    handler({ url: "/criterios", method: "POST", headers: { authorization: "Bearer prueba", origin: "http://127.0.0.1:5192", host: "127.0.0.1:5192" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield JSON.stringify(input); } }, { statusCode: 200, setHeader() {}, end(body) { resolve({ status: this.statusCode, data: JSON.parse(body) }); } });
  });
  try {
    assert.equal((await call({ borrador: { titulo: "Invalido" } })).status, 400);
    assert.equal((await call()).status, 200); assert.match(sent, /Recortar carton/); assert.doesNotMatch(sent, /NO ENVIAR/);
    role = "alumno"; assert.equal((await call()).status, 403);
  } finally { globalThis.fetch = original; }
});
test("actividades aprobadas no prioritarias tambien aparecen despues de las prioritarias", () => {
  const ready = actividadesRegistrablesInicial([{ ...activities[0], prioritaria: false }, { ...activities[1], estado: "finalizada" }, { ...activities[2], criterios: {} }, activities[3]]);
  assert.deepEqual(ready.map((item) => item.id), ["a3", "a0"]);
});
test("al terminar HACER no regresa al primer alumno completado ni omite dimensiones pendientes", () => {
  const students = [{ id: "a" }, { id: "b" }], rows = ["ser", "saber", "hacer"].map((dimension) => ({ tipo: "actividad", actividadId: "a0", alumnoId: "a", dimension }));
  assert.deepEqual(siguientePasoRegistroInicial(rows, "a0", students, "a", "hacer"), { studentId: "b", dimension: "ser", completo: false });
  assert.deepEqual(siguientePasoRegistroInicial(rows.slice(0, 1), "a0", students, "a", "hacer"), { studentId: "a", dimension: "saber", completo: false });
  assert.equal(siguientePasoRegistroInicial([...rows, ...rows.map((row) => ({ ...row, alumnoId: "b" }))], "a0", students, "b", "hacer").completo, true);
});
test("Bitacora es general y sigue asociada a estudiante y trimestre", () => {
  const html = BitacoraInicial({ ...state(), route: "/docente/bitacora" });
  assert.match(html, /data-initial-action="select-student"/); assert.match(html, /1er trimestre/); assert.doesNotMatch(html, /data-initial-subject|Materia/);
});
test("criterios rechazan estructuras incompletas, opciones numericas y textos demasiado largos", () => {
  assert.deepEqual(validarCriteriosActividad(criteria), criteria);
  assert.throws(() => validarCriteriosActividad({ ser: criteria.ser }));
  assert.throws(() => validarCriteriosActividad({ ...criteria, hacer: { ...criteria.hacer, opciones: { ...criteria.hacer.opciones, logrado: 100 } } }));
  assert.throws(() => validarCriteriosActividad({ ...criteria, saber: { ...criteria.saber, criterio: "a".repeat(201) } }));
});
test("Gemini propone opciones de la actividad sin recibir alumnos ni valoraciones personales", async () => {
  let sent;
  const result = await generarCriteriosGemini({ activity: { ...activities[0], alumnoId: "CI-PRIVADO", registros: [{ descripcion: "PRIVADO" }] }, apiKey: "prueba", model: "modelo", fetcher: async (_, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(criteria) }] } }] }) }; } });
  assert.deepEqual(result.criterios, criteria);
  assert.doesNotMatch(JSON.stringify(sent), /CI-PRIVADO|PRIVADO/); assert.match(sent.systemInstruction.parts[0].text, /no una evaluacion de alumnos/);
  validarAccesoActividad(activities[0], "docente", { cursoId: "inicial", trimestreId: "t1" });
  assert.throws(() => validarAccesoActividad(activities[0], "otro", { cursoId: "inicial", trimestreId: "t1" }));
});
test("informe usa la opinion elegida y bitacora; sin observar no es una debilidad", () => {
  const rows = [{ id: "uno", tipo: "actividad", actividadTitulo: "Muneco", opinion: "Recorta con apoyo", valoracion: "requiere_apoyo" }, { id: "dos", tipo: "bitacora", descripcion: "Comparte materiales" }, { id: "tres", tipo: "actividad", valoracion: "no_observado", opinion: "Sin observar" }];
  const sources = fuentesParaGemini(rows); assert.match(sources, /Recorta con apoyo|Comparte materiales/); assert.doesNotMatch(sources, /Sin observar/);
  assert.throws(() => fuentesParaGemini([rows[2]]));
  assert.notEqual(firmaFuentes(rows), firmaFuentes([{ ...rows[0], opinion: "Recorta solo" }, ...rows.slice(1)]));
});
test("cache sincroniza prioridad, orden y avances sin recargar los registros", async () => {
  const data = crearDatosInicial(context, { listarActividadesInicial: async () => activities, listarRegistrosInicial: async () => [], modificarActividadInicial: async (_, input) => ({ ...activities[0], ...input }), moverActividadInicial: async () => [{ ...activities[0], orden: "1" }, { ...activities[1], orden: "0" }], guardarAvanceInicial: async () => ({ activity: { ...activities[0], tieneRegistros: true }, records: [{ id: "r1", tipo: "actividad", opinion: "Observado" }] }) });
  await data.cargar("activities", "inicial", "t1"); await data.cargar("records", "inicial", "t1");
  await data.guardarActividad({ ...activities[0], prioritaria: false }); assert.equal(data.leer("activities", "inicial", "t1").find((row) => row.id === "a0").prioritaria, false);
  await data.moverActividad(activities[0], activities[1]); assert.equal(ordenarActividadesInicial(data.leer("activities", "inicial", "t1"))[0].id, "a1");
  await data.guardarAvance(activities[0], "s1", { ser: { valoracion: "logrado" } }); await data.guardarAvance(activities[0], "s1", { ser: { valoracion: "logrado" } });
  assert.equal(data.leer("records", "inicial", "t1").length, 1);
});
