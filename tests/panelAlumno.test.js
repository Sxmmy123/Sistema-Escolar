import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { crearGuardadoConPeriodo } from "../src/services/periodosCurso.js";
import { identificarAutoresAsistencia, nombreDocenteAsistencia } from "../src/services/autoriaAsistencia.js";
import { resolverVistaTrimestreAlumno, trimestreAutomaticoAlumno } from "../src/services/trimestreAlumno.js";
import { buildBulletin, buildStudentAnnualBulletin, buildStudentDashboardData } from "../src/services/studentData.js";
import { SUBJECTS } from "../src/data/catalog.js";
import { BoletaAlumno } from "../src/modules/alumno/BoletaAlumno.js";
import { asistenciaPorFechaAlumno, calendarioAsistenciaAlumno, globoObservacionAlumno } from "../src/modules/alumno/AsistenciaAlumno.js";
import { crearGloboAsistenciaAlumno, posicionGloboAlumno } from "../src/modules/alumno/GloboAsistenciaAlumno.js";
import { AlumnoDashboard } from "../src/modules/alumno/AlumnoDashboard.js";

const today = "2026-10-24";
const period = (id, date) => ({ id, actividadFecha: date, asistenciaFecha: date });
const context = { uid: "auth-a", gestionId: "2026", profile: {}, student: { id: "a", nombre: "Alumno", cursoId: "cuarto_a" } };

test("el curso avanza solo con actividad y asistencia del mismo trimestre, sin contar notas", () => {
  assert.equal(trimestreAutomaticoAlumno({ today, periods: [period("t1", "2026-02-10"), { id: "t2", actividadFecha: "2026-05-10" }] }), "t1");
  assert.equal(trimestreAutomaticoAlumno({ today, periods: [period("t2", "2026-05-10"), { id: "t3", asistenciaFecha: "2026-09-10" }] }), "t2");
  assert.equal(trimestreAutomaticoAlumno({ today, periods: [period("t2", "2026-05-10"), period("t3", "2026-11-10")] }), "t2");
  assert.equal(trimestreAutomaticoAlumno({ today, periods: [period("t3", "2026-09-10"), period("t1", "2026-02-10")] }), "t3");
  assert.equal(trimestreAutomaticoAlumno({ today, periods: [{ id: "t3", actividadFecha: "2026-11-10", asistenciaFecha: today }] }), "t3");
  assert.equal(trimestreAutomaticoAlumno({ today, periods: [period("t3", "2025-09-10"), period("t4", "2026-09-10")] }), "t1");
});

test("los registros anteriores funcionan sin senal y nunca gana el trimestre con mas registros", () => {
  const activities = [...Array.from({ length: 100 }, () => ({ trimestreId: "t1", fecha: "2026-03-10" })), { trimestreId: "t2", fecha: "2026-05-10" }];
  const attendance = [{ trimestreId: "t1", fecha: "2026-03-10" }, { trimestreId: "t2", fecha: "2026-05-11" }];
  assert.equal(trimestreAutomaticoAlumno({ today, activities, attendance }), "t2");
  assert.equal(trimestreAutomaticoAlumno({ today, activities: [{ trimestreId: "t3", fecha: "2026-09-10", interno: true }], attendance: [{ trimestreId: "t3", fecha: "2026-09-10" }] }), "t1");
  assert.equal(trimestreAutomaticoAlumno({ today, activities: [{ trimestreId: "t3", fecha: "2026-09-10", activo: false }], attendance: [{ trimestreId: "t3", fecha: "2026-09-10" }] }), "t1");
});

test("consultar un trimestre anterior persiste hasta el siguiente avance real del curso", () => {
  const profile = { preferencias: { vistasAlumnoPorGestion: { 2026: { cursoId: "cuarto_a", trimestreId: "t1", automatico: "t2" } } } };
  const args = { profile, year: "2026", courseId: "cuarto_a", automatic: "t2" };
  assert.equal(resolverVistaTrimestreAlumno(args), "t1");
  assert.equal(resolverVistaTrimestreAlumno({ ...args, automatic: "t3" }), "t3");
  assert.equal(resolverVistaTrimestreAlumno({ ...args, year: "2027" }), "t2");
  assert.equal(resolverVistaTrimestreAlumno({ ...args, courseId: "quinto_a" }), "t2");
  assert.equal(resolverVistaTrimestreAlumno({ ...args, profile: { preferencias: { trimestresPorGestion: { 2026: "t1" } } } }), "t2");
});

test("la misma senal actualiza a todos los alumnos aunque uno no tenga asistencia propia", () => {
  const raw = { periods: [period("t2", "2026-05-10")], activities: [{ id: "tarea-1", trimestreId: "t1", materiaId: "matematica", fecha: "2026-03-10" }, { id: "tarea-2", trimestreId: "t2", materiaId: "matematica", fecha: "2026-05-10" }], attendance: [{ alumnoId: "a", trimestreId: "t1", fecha: "2026-03-10", estado: "atraso", observacion: "Llego tarde" }] };
  const first = buildStudentDashboardData(context, raw, today);
  const other = buildStudentDashboardData({ ...context, student: { id: "b", cursoId: "cuarto_a" } }, { ...raw, attendance: [] }, today);
  assert.equal(first.trimesterId, "t2"); assert.equal(other.trimesterId, "t2");
  assert.deepEqual(first.activities.map((item) => item.id), ["tarea-2"]); assert.equal(first.attendance.length, 0);
  const profile = { preferencias: { vistasAlumnoPorGestion: { 2026: { cursoId: "cuarto_a", trimestreId: "t1", automatico: "t2" } } } };
  const old = buildStudentDashboardData({ ...context, profile }, raw, today);
  assert.equal(old.trimesterLabel, "1er trimestre"); assert.equal(old.attendance[0].observacion, "Llego tarde");
});

test("la senal y el registro se guardan juntos, sin escrituras extra por cada alumno", async () => {
  const writes = [], direct = []; let reads = 0, stored = {};
  const save = crearGuardadoConPeriodo({ timestamp: () => "server", save: async (...args) => direct.push(args), transaction: async (_, callback) => callback({ get: async () => { reads++; return { exists: () => Object.keys(stored).length > 0, data: () => stored }; }, set: (ref, data) => { writes.push([ref.id, data]); if (ref.id === "t2") stored = { ...stored, ...data }; } }) });
  const args = { db: {}, uid: "docente", year: "2026", courseId: "cuarto_a", termId: "t2", kind: "asistencia", sourceRef: { id: "asistencia-a" }, periodRef: { id: "t2" }, payload: { fecha: "2026-05-10" }, merge: true };
  await save(args); assert.equal(reads, 1); assert.equal(writes.length, 2); assert.equal(stored.asistenciaFecha, "2026-05-10");
  await save({ ...args, sourceRef: { id: "asistencia-b" } }); assert.equal(reads, 1); assert.equal(direct.length, 1);
  await save({ ...args, payload: { fecha: "2026-05-01" } }); assert.equal(stored.asistenciaFecha, "2026-05-01");
  await save({ ...args, kind: "actividad", sourceRef: { id: "tarea" }, payload: { fecha: "2026-05-10" } }); assert.equal(stored.actividadId, "tarea"); assert.equal(stored.asistenciaId, "asistencia-a");
});

test("un fallo no deja la senal marcada en cache y permite reintentar", async () => {
  let calls = 0;
  const save = crearGuardadoConPeriodo({ transaction: async () => { if (++calls === 1) throw new Error("Sin red"); return "2026-05-10"; }, save: () => assert.fail("No se debe omitir la transaccion") });
  const args = { uid: "d", year: "2026", courseId: "cuarto_a", termId: "t2", kind: "actividad", payload: { fecha: "2026-05-10" } };
  await assert.rejects(save(args), /Sin red/); await save(args); assert.equal(calls, 2);
});

test("con reglas anteriores sigue guardando el registro sin inventar una senal ni saltarse sus permisos", async () => {
  let writes = 0, reads = 0;
  const save = crearGuardadoConPeriodo({ transaction: async () => { reads++; throw Object.assign(new Error("Reglas pendientes"), { code: "permission-denied" }); }, save: async () => { writes++; } });
  const args = { uid: "d", year: "2026", courseId: "cuarto_a", termId: "t2", kind: "actividad", payload: { fecha: "2026-05-10" } };
  await save(args); await save(args); assert.equal(writes, 2); assert.equal(reads, 2);
  const denied = crearGuardadoConPeriodo({ transaction: async () => { throw Object.assign(new Error("Sin permiso"), { code: "permission-denied" }); }, save: async () => { throw new Error("Registro denegado"); } });
  await assert.rejects(denied(args), /Registro denegado/);
});

test("el minicalendario muestra el icono solo con observacion y conserva todos los comentarios del dia", () => {
  const attendance = [
    { fecha: "2026-03-10", estado: "atraso", observacion: "Llego muy tarde 9am <script>", registradoPor: "Docente A", updatedAt: { seconds: 1 } },
    { fecha: "2026-03-10", estado: "presente", observacion: "Se incorporo a la actividad", registradoPor: "Docente B", updatedAt: { toMillis: () => 2000 } },
    { fecha: "2026-03-11", estado: "presente", observacion: "   " }
  ];
  const data = { ...context, attendance, trimesterLabel: "1er trimestre" };
  const grouped = asistenciaPorFechaAlumno(attendance);
  assert.equal(grouped.get("2026-03-10").record.estado, "presente"); assert.equal(grouped.get("2026-03-10").observations.length, 2);
  const html = calendarioAsistenciaAlumno(data);
  assert.equal((html.match(/data-attendance-note-date=/g) || []).length, 1);
  assert.doesNotMatch(html, /Llego muy tarde/);
  const opened = globoObservacionAlumno(data, "2026-03-10");
  assert.match(opened, /Llego muy tarde 9am &lt;script&gt;/); assert.match(opened, /Se incorporo a la actividad/);
  assert.match(opened, /Docente A/); assert.match(opened, /Docente B/); assert.doesNotMatch(opened, /<script>/);
  assert.match(html, /aria-expanded="false" aria-controls="student-attendance-note"/);
  assert.doesNotMatch(opened, /data-close-attendance-note/);
});

test("la idea muestra solo Prof. nombre y comentario, sin fecha, estado ni correo", () => {
  const data = { attendance: [{ fecha: "2026-03-10", estado: "atraso", registradoPor: "Aracely", observacion: "Llego tarde 9am muy tarde" }] };
  const html = globoObservacionAlumno(data, "2026-03-10");
  const visible = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.equal(visible, "Prof. Aracely: Llego tarde 9am muy tarde");
  assert.doesNotMatch(html, /<h3|balloon-title|Atraso|data-close-attendance-note/);
  const legacy = globoObservacionAlumno({ attendance: [{ ...data.attendance[0], registradoPor: "aracely004@example.test" }] }, "2026-03-10");
  assert.doesNotMatch(legacy, /aracely004|example.test|@/); assert.match(legacy, />Docente:<\/span>/);
});

test("los nombres conocidos resuelven al mismo docente sin inferir nombres desde correos", () => {
  for (const name of ["Aracely", "Prof. Aracely", "Profesora Aracely", "Lic. Aracely"]) assert.equal(nombreDocenteAsistencia(name), "Aracely");
  for (const value of ["aracely@example.test", "Aracely004", "admin", "Docente", " "]) assert.equal(nombreDocenteAsistencia(value), "");
  const old = { registradoPorUid: "docente-a", registradoPor: "cuenta@example.test" };
  const rows = identificarAutoresAsistencia([old, { registradoPorUid: "docente-a", registradoPor: "Aracely" }, { registradoPorUid: "otro", registradoPor: "otro@example.test" }]);
  assert.equal(rows[0].registradoPor, "Aracely"); assert.equal(rows[2].registradoPor, ""); assert.equal(old.registradoPor, "cuenta@example.test");
});

test("guardar asistencia toma el nombre del perfil docente y no el correo de sesion", async () => {
  const source = await readFile(new URL("../src/services/teacherData.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("export async function saveAttendance("), source.indexOf("export async function listActivities(")).replace("export ", "");
  const writes = []; let uid = "docente-a", changeSession = false;
  const save = vm.runInNewContext(`${code}; saveAttendance`, { asegurarRegistroDocente() {}, asegurarTrimestreRegistro() {}, validarFechaGestion() {}, gestionActual: () => "2026", currentUid: () => uid, getTeacherContext: async () => { if (changeSession) uid = "otro"; return { profile: { nombre: "Aracely" } }; }, nombreDocenteAsistencia, attendanceDocId: () => "registro-a", firestore: {}, documentoGestion: () => ({}), doc: () => ({}), periodosCurso: () => ({}), serverTimestamp: () => null, guardarConPeriodoCurso: async ({ payload }) => { writes.push(payload); }, sincronizarAsistenciaCalificar() {}, announceAlertDataChange() {}, safeAudit() {}, auth: { currentUser: { email: "cuenta@example.test" } }, Date });
  const input = { course: { id: "cuarto_a", nombre: "Cuarto A" }, student: { id: "a", cursoId: "cuarto_a", nombre: "Alumno" }, fecha: "2026-03-10", estado: "atraso", observacion: "" };
  const record = await save(input);
  assert.equal(record.registradoPor, "Aracely"); assert.equal(writes[0].registradoPor, "Aracely");
  changeSession = true;
  await assert.rejects(save(input), /sesion del docente cambio/); assert.equal(writes.length, 1);
});

test("el globo queda dentro del calendario y orienta el crecimiento hacia su icono", () => {
  const bounds = { left: 12, right: 378, top: 40, bottom: 800 };
  const first = posicionGloboAlumno({ left: 40, top: 400, bottom: 414, width: 14, height: 14 }, bounds, { width: 340, height: 180 });
  assert.equal(first.side, "above"); assert.equal(first.left, 24); assert.equal(first.top, 208);
  assert.equal(first.originX, 23); assert.equal(first.originY, 199);
  const last = posicionGloboAlumno({ left: 345, top: 70, bottom: 84, width: 14, height: 14 }, bounds, { width: 340, height: 250 });
  assert.equal(last.side, "below"); assert.equal(last.left + 340, bounds.right - 12);
  assert.ok(last.tailX >= 18 && last.tailX <= 322);
  const long = posicionGloboAlumno({ left: 120, top: 400, bottom: 414, width: 14, height: 14 }, bounds, { width: 340, height: 1000 });
  assert.ok(long.height <= bounds.bottom - bounds.top); assert.ok(long.top >= bounds.top);
});

function balloonFixture({ reduced = false } = {}) {
  const frames = new Map(), timers = new Map(), elements = []; let sequence = 0;
  const classList = () => { const values = new Set(); return { add: (value) => values.add(value), remove: (value) => values.delete(value), contains: (value) => values.has(value) }; };
  const view = { innerWidth: 390, innerHeight: 844, matchMedia: () => ({ matches: reduced }), requestAnimationFrame: (fn) => { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame: (id) => frames.delete(id), setTimeout: (fn) => { timers.set(++sequence, fn); return sequence; }, clearTimeout: (id) => timers.delete(id) };
  const host = { set innerHTML(value) {
    const events = new Map();
    const element = { content: value, dataset: {}, style: { setProperty(key, item) { this[key] = item; } }, classList: classList(), querySelector: () => ({ scrollHeight: 110 }), addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name), remove() { this.removed = true; if (host.firstElementChild === this) host.firstElementChild = null; }, finish() { events.get("transitionend")?.({ target: this, propertyName: "transform" }); } };
    this.firstElementChild = element; elements.push(element);
  } };
  const target = { ownerDocument: { defaultView: view }, querySelector: (selector) => selector === "[data-attendance-balloon-host]" ? host : selector === '[role="dialog"]' ? { getBoundingClientRect: () => ({ left: 12, right: 378, top: 40, bottom: 800 }) } : null };
  const button = (date) => ({ dataset: { attendanceNoteDate: date }, isConnected: true, classList: classList(), attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, querySelector: () => ({ getBoundingClientRect: () => ({ left: 100, top: 400, bottom: 414, width: 14, height: 14 }) }) });
  const popup = crearGloboAsistenciaAlumno({ target, render: (date) => `Observacion ${date}` });
  return { popup, button, elements, frames, timers, flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); } };
}

test("el mismo icono abre el globo y lo retrae al volver a pulsarlo sin otra X", () => {
  const fixture = balloonFixture(), button = fixture.button("2026-03-10");
  fixture.popup.alternar(button); fixture.flush();
  const bubble = fixture.elements[0];
  assert.equal(button.attributes["aria-expanded"], "true"); assert.ok(bubble.classList.contains("is-open"));
  fixture.popup.alternar(button);
  assert.equal(button.attributes["aria-expanded"], "false"); assert.equal(bubble.removed, undefined); assert.ok(!bubble.classList.contains("is-open"));
  bubble.finish(); assert.equal(bubble.removed, true); assert.equal(fixture.popup.fecha, ""); assert.equal(fixture.timers.size, 0);
});

test("pulsaciones rapidas revierten el cierre y no eliminan el globo reabierto", () => {
  const fixture = balloonFixture(), first = fixture.button("2026-03-10"), other = fixture.button("2026-03-12");
  fixture.popup.alternar(first); fixture.flush(); fixture.popup.alternar(first); fixture.popup.alternar(first);
  assert.equal(fixture.elements.length, 1); assert.equal(fixture.timers.size, 0); assert.equal(fixture.popup.fecha, "2026-03-10");
  fixture.elements[0].finish(); assert.equal(fixture.elements[0].removed, undefined);
  fixture.popup.alternar(other); fixture.flush(); assert.equal(fixture.elements[0].removed, true); assert.equal(fixture.popup.fecha, "2026-03-12");
  fixture.popup.desmontar(); assert.equal(fixture.elements[1].removed, true); assert.equal(other.attributes["aria-expanded"], "false");
});

test("respeta movimiento reducido y cancelar antes del despliegue no deja animaciones pendientes", () => {
  const reduced = balloonFixture({ reduced: true }), button = reduced.button("2026-03-10");
  reduced.popup.alternar(button); assert.equal(reduced.frames.size, 0); assert.ok(reduced.elements[0].classList.contains("is-open"));
  reduced.popup.alternar(button); assert.equal(reduced.elements[0].removed, true); assert.equal(reduced.timers.size, 0);
  const normal = balloonFixture(); normal.popup.alternar(normal.button("2026-03-10")); normal.popup.desmontar(); normal.flush();
  assert.equal(normal.elements[0].removed, true); assert.equal(normal.frames.size, 0); assert.equal(normal.popup.fecha, "");
});

test("Panel conserva el selector global y Boleta carga su consulta independiente", () => {
  assert.equal((AlumnoDashboard("/alumno").match(/data-student-select-term=/g) || []).length, 3);
  assert.doesNotMatch(AlumnoDashboard("/alumno/boleta"), /data-student-select-term|data-bulletin-trimester/);
});

function annualFixture(terms = ["t1", "t2", "t3"], subjects = ["matematica", "ciencias_naturales"]) {
  const activities = [], grades = [], attendance = [];
  terms.forEach((term, index) => {
    const date = `2026-${["03", "06", "09"][index]}-10`;
    attendance.push({ alumnoId: "a", trimestreId: term, fecha: date, estado: index === 0 ? "atraso" : "presente" });
    subjects.forEach((subject, subjectIndex) => ["tarea", "examen"].forEach((type) => {
      const id = `${subject}_${term}_${type}`, value = Math.min(100, 40 + index * 20 + subjectIndex * 5);
      activities.push({ id, cursoId: "cuarto_a", materiaId: subject, trimestreId: term, fecha: date, tipo: type, maximo: 100, activo: true });
      grades.push({ actividadId: id, alumnoId: "a", trimestreId: term, valor: value, nota: value, maximo: 100, estadoEntrega: "a_tiempo", fechaEntrega: date });
    }));
  });
  return { student: context.student, activities, grades, attendance };
}

test("la boleta anual separa los tres trimestres y usa el mismo calculo academico existente", () => {
  const input = annualFixture(), annual = buildStudentAnnualBulletin(input);
  for (const term of ["t1", "t2", "t3"]) {
    const expected = buildBulletin({ ...input, trimesterId: term, activities: input.activities.filter((row) => row.trimestreId === term), grades: input.grades.filter((row) => row.trimestreId === term), attendance: input.attendance.filter((row) => row.trimestreId === term) });
    assert.deepEqual(annual.byTerm[term], expected);
  }
  const math = annual.rows.find((row) => row.subjectId === "matematica");
  assert.equal(math.termCount, 3);
  assert.equal(math.average, Math.round((math.terms.t1.final + math.terms.t2.final + math.terms.t3.final) / 3));
  assert.equal(annual.average, Math.round(annual.terms.reduce((sum, term) => sum + term.average, 0) / 3));
  assert.ok(math.terms.t1.final < math.terms.t2.final && math.terms.t2.final < math.terms.t3.final);
});

test("los trimestres pendientes nunca se convierten en cero ni rebajan el promedio disponible", () => {
  const input = annualFixture(["t1"]), annual = buildStudentAnnualBulletin(input);
  const math = annual.rows.find((row) => row.subjectId === "matematica");
  assert.equal(math.terms.t2, null); assert.equal(math.terms.t3, null); assert.equal(math.average, math.terms.t1.final);
  assert.equal(annual.terms[1].average, null); assert.equal(annual.average, annual.terms[0].average); assert.equal(annual.partial, true);
  const empty = buildStudentAnnualBulletin({ student: context.student });
  assert.equal(empty.average, null); assert.equal(empty.termCount, 0); assert.ok(empty.rows.every((row) => row.average === null));
  const reviewOnly = buildStudentAnnualBulletin({ student: context.student, activities: [{ id: "sin-nota-propia", trimestreId: "t2", materiaId: "matematica", estadoRevision: "en_proceso", tipo: "tarea" }], grades: [{ actividadId: "sin-nota-propia", alumnoId: "otro", trimestreId: "t2", nota: 80 }] });
  assert.equal(reviewOnly.average, null); assert.equal(reviewOnly.rows.find((row) => row.subjectId === "matematica").terms.t2, null);
});

test("el promedio general sigue el promedio de los trimestres y reconoce una gestion con notas completas", () => {
  const input = annualFixture(["t1", "t2", "t3"], SUBJECTS.map((subject) => subject.id));
  const annual = buildStudentAnnualBulletin(input);
  assert.equal(annual.partial, false); assert.equal(annual.termCount, 3);
  assert.equal(annual.average, Math.round(annual.terms.reduce((sum, term) => sum + term.average, 0) / 3));
  const html = BoletaAlumno({ annualBulletin: annual }, "total");
  assert.match(html, /3 trimestres con notas/); assert.match(html, /Promedio general/); assert.match(html, /data-student-overall-average/);
});

test("consultar un trimestre en Panel no oculta los otros en Boleta ni incorpora notas de otro alumno", () => {
  const input = annualFixture(), raw = { activities: input.activities, grades: input.grades, attendance: input.attendance };
  const oldProfile = { preferencias: { vistasAlumnoPorGestion: { 2026: { cursoId: "cuarto_a", trimestreId: "t1", automatico: "t3" } } } };
  const first = buildStudentDashboardData({ ...context, profile: oldProfile }, raw, today);
  const third = buildStudentDashboardData(context, raw, today);
  assert.equal(first.trimesterId, "t1"); assert.equal(third.trimesterId, "t3"); assert.deepEqual(first.annualBulletin, third.annualBulletin);
  const other = buildStudentAnnualBulletin({ ...input, student: { ...context.student, id: "otro" } });
  assert.equal(other.average, null); assert.ok(other.rows.every((row) => row.average === null));
});

test("la tabla deja pendientes sin boton y abre solo el desglose de la materia y trimestre pulsados", () => {
  const annualBulletin = buildStudentAnnualBulletin(annualFixture(["t1", "t2"]));
  const html = BoletaAlumno({ annualBulletin }, "total", "matematica:t2");
  assert.match(html, /1er<span>trimestre/); assert.match(html, /2do<span>trimestre/); assert.match(html, /3er<span>trimestre/);
  assert.doesNotMatch(html, /data-student-grade-detail="matematica:t3"/);
  assert.equal((html.match(/aria-expanded="true"/g) || []).length, 1);
  assert.match(html, /Matematica · 2do trimestre/); assert.match(html, /SER/); assert.match(html, /SABER/); assert.match(html, /HACER/); assert.match(html, /Auto/);
  assert.match(html, /Promedio parcial/); assert.match(html, /aria-label="Pendiente"/);
});

test("Boleta ofrece tres trimestres individuales y un promedio total compacto", () => {
  const annualBulletin = buildStudentAnnualBulletin(annualFixture());
  const html = BoletaAlumno({ annualBulletin, trimesterId: "t2" });
  assert.equal((html.match(/data-student-bulletin-view=/g) || []).length, 4);
  assert.match(html, /data-student-bulletin-view="t2" aria-pressed="true"/);
  assert.match(html, /Notas del 2do trimestre/);
  for (const heading of ["SER", "SABER", "HACER", "Auto", "Final"]) assert.match(html, new RegExp(`<th scope="col">${heading}<span>`));
  assert.match(html, /Promedio del trimestre/);
  assert.doesNotMatch(html, /data-student-overall-average|data-student-grade-detail=/);
  const total = BoletaAlumno({ annualBulletin, trimesterId: "t2" }, "total");
  assert.match(total, /data-student-bulletin-view="total" aria-pressed="true"/);
  assert.match(total, /data-student-overall-average/);
  assert.doesNotMatch(total, /student-bulletin-term-table|<th scope="col">SER/);
});

test("cada trimestre muestra sus propias dimensiones y uno pendiente no inventa notas", () => {
  const annualBulletin = buildStudentAnnualBulletin(annualFixture(["t1", "t2"]));
  for (const id of ["t1", "t2"]) {
    const html = BoletaAlumno({ annualBulletin }, id);
    const grade = annualBulletin.rows[0].terms[id];
    assert.match(html, new RegExp(`<td class="">${grade.ser10}</td><td class="">${grade.saber45}</td><td class="">${grade.hacer40}</td><td class="">${grade.auto5}</td>`));
    assert.match(html, new RegExp(`data-student-term-average>${annualBulletin.terms.find((term) => term.id === id).average}</td>`));
  }
  const empty = BoletaAlumno({ annualBulletin }, "t3");
  assert.match(empty, /Sin notas/);
  assert.equal((empty.match(/aria-label="Pendiente"/g) || []).length, SUBJECTS.length * 5 + 1);
  assert.doesNotMatch(empty, /data-student-overall-average/);
});

async function pageFixture() {
  const source = await readFile(new URL("../src/modules/alumno/AlumnoDashboard.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("let disposePage = null;")).replaceAll("export ", "");
  const buttons = ["t1", "t2", "t3"].map((term) => ({ dataset: { studentSelectTerm: term }, disabled: true, setAttribute() {}, addEventListener(_, handler, { signal }) { this.click = () => !signal.aborted && handler(); } }));
  const rendered = [], details = [], error = { hidden: true, textContent: "" };
  const table = { addEventListener(_, handler, { signal }) {
    const send = (attribute, value) => { if (!signal.aborted) handler({ target: { closest: (selector) => selector === `[${attribute}]` ? { dataset: attribute === "data-student-grade-detail" ? { studentGradeDetail: value } : { studentBulletinView: value } } : null } }); };
    this.pick = (key) => send("data-student-grade-detail", key);
    this.view = (id) => send("data-student-bulletin-view", id);
  } };
  const document = { querySelectorAll: () => buttons, querySelector: (selector) => selector === "[data-student-term-error]" ? error : selector === "[data-student-bulletin]" ? table : null };
  const api = vm.runInNewContext(`${code}; ({ bindAlumnoPage, desmontarAlumno })`, { document, AbortController, observarPanelAlumno() {}, vincularCalendarioAlumno: () => ({ actualizar() {} }), fillCommon: (data) => rendered.push(data), fillPanel() {}, fillBulletin: (data, view, selection = "") => details.push({ data, view, selection }), refreshIcons() {} });
  return { ...api, buttons, rendered, error, table, details };
}

test("abrir desgloses de Boleta no guarda otra preferencia y las actualizaciones conservan la materia abierta", async () => {
  const input = annualFixture(["t1", "t2"]), page = await pageFixture();
  const data = buildStudentDashboardData(context, input, today);
  let emit;
  await page.bindAlumnoPage("/alumno/boleta", { observe: async (callback) => { emit = callback; callback(data); return { stop() {}, seleccionarTrimestre() { assert.fail("Consultar notas no cambia el trimestre del Panel"); } }; } });
  assert.equal(page.details.at(-1).view, "t2");
  page.table.view("total");
  page.table.pick("matematica:t1"); assert.equal(page.details.at(-1).selection, "matematica:t1");
  page.table.pick("matematica:t3"); assert.equal(page.details.at(-1).selection, "matematica:t1");
  emit(data); assert.equal(page.details.at(-1).selection, "matematica:t1");
  page.table.pick("matematica:t1"); assert.equal(page.details.at(-1).selection, "");
  assert.equal(data.trimesterId, "t2");
  page.desmontarAlumno();
});

test("las cuatro consultas de Boleta no guardan preferencias y sobreviven a actualizaciones", async () => {
  const page = await pageFixture(), data = buildStudentDashboardData(context, annualFixture(), today);
  let emit;
  await page.bindAlumnoPage("/alumno/boleta", { observe: async (callback) => { emit = callback; callback(data); return { stop() {}, seleccionarTrimestre() { assert.fail("La consulta de Boleta no escribe preferencias"); } }; } });
  assert.equal(page.details.at(-1).view, data.trimesterId);
  for (const view of ["t1", "t2", "t3", "total"]) {
    page.table.view(view);
    assert.equal(page.details.at(-1).view, view);
    emit({ ...data, trimesterId: "t1" });
    assert.equal(page.details.at(-1).view, view);
  }
  page.table.pick("matematica:t1"); assert.equal(page.details.at(-1).selection, "matematica:t1");
  page.table.view("t2"); assert.equal(page.details.at(-1).selection, "");
  page.table.pick("matematica:t1"); assert.equal(page.details.at(-1).selection, "");
  page.table.view("invalid"); assert.equal(page.details.at(-1).view, "t2");
  page.desmontarAlumno();
  page.table.view("t3"); assert.equal(page.details.at(-1).view, "t2");
});

test("navegar descarta respuestas antiguas y detiene las escuchas del alumno", async () => {
  const page = await pageFixture();
  let finish, oldEmit, stopped = 0;
  const pending = page.bindAlumnoPage("/alumno", { observe: (emit) => { oldEmit = emit; return new Promise((resolve) => { finish = resolve; }); } });
  await page.bindAlumnoPage("/alumno/boleta", { observe: async (emit) => { emit({ trimesterId: "t2" }); return { stop() { stopped++; } }; } });
  oldEmit({ trimesterId: "t1" });
  finish({ stop() { stopped++; } }); await pending;
  assert.equal(page.rendered.length, 1); assert.equal(page.rendered[0].trimesterId, "t2"); assert.equal(stopped, 1);
  page.desmontarAlumno(); assert.equal(stopped, 2);
});

test("un fallo al cambiar trimestre mantiene la vista y permite reintentar sin duplicar guardados", async () => {
  const page = await pageFixture(); let writes = 0, reject;
  await page.bindAlumnoPage("/alumno", { observe: async (emit) => { emit({ trimesterId: "t2" }); return { stop() {}, seleccionarTrimestre: () => { writes++; return new Promise((_, fail) => { reject = fail; }); } }; } });
  const first = page.buttons[0].click(); await page.buttons[0].click();
  assert.equal(writes, 1); assert.ok(page.buttons.every((button) => button.disabled));
  reject(new Error("Sin conexion")); await first;
  assert.match(page.error.textContent, /Sin conexion/); assert.equal(page.rendered.at(-1).trimesterId, "t2"); assert.ok(page.buttons.every((button) => !button.disabled));
  page.desmontarAlumno();
});
