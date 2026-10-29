import assert from "node:assert/strict";
import test, { after } from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { isMainAdmin } from "../src/services/authSession.js";
import { ADMIN_USER } from "../src/firebase/config.js";

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
globalThis.sessionStorage = { getItem: () => null, setItem() {} };
after(() => { if (previousStorage) Object.defineProperty(globalThis, "sessionStorage", previousStorage); else delete globalThis.sessionStorage; });
const catalog = await import("../src/data/catalog.js");
const utilities = await import("../src/modules/docente/UtilidadesDocente.js");
const academic = await import("../src/modules/docente/AcademicoDocente.js");
const common = await import("../src/modules/docente/ComunDocente.js");
const { teacherState } = await import("../src/modules/docente/EstadoDocente.js");
const { bulletinStudents } = await import("../src/modules/docente/BoletinDocente.js");
const { printDocument } = await import("../src/modules/docente/imprimirNotasDocente.js");
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("el correo del administrador no concede privilegios a otro UID", () => {
  assert.equal(isMainAdmin({ uid: "otro", email: ADMIN_USER.email, emailVerified: false }), false);
  assert.equal(isMainAdmin({ uid: ADMIN_USER.uid, email: "otro@example.test" }), true);
  assert.equal(isMainAdmin(null), false);
});

test("auditoria conserva el ID real y escapa IDs que contienen HTML", async () => {
  const service = await source("src/services/auditData.js");
  const list = vm.runInNewContext(service.slice(service.indexOf("export async function listAudit")).replace("export ", "") + "; listAudit", {
    todayIso: () => "2026-10-26", getDocs: async () => ({ docs: [{ id: "id-real", data: () => ({ id: 'falso\"><img src=x>', fecha: "2026-10-26" }) }] }),
    firestore: {}, collection() {}, query() {}, orderBy() {}, limit() {}
  });
  assert.equal((await list())[0].id, "id-real");
  const bindings = await source("src/modules/admin/AdminBindings.js");
  const tbody = { innerHTML: "", querySelectorAll: () => [] };
  const render = vm.runInNewContext(bindings.slice(bindings.indexOf("function escapeHtml"), bindings.indexOf("function openAuditDetail")) + "; renderAuditRows", {
    document: { querySelector: (selector) => selector === "[data-audit-list]" ? tbody : null }
  });
  render([{ id: '\"><img src=x onerror=alert(1)>' }]);
  assert.doesNotMatch(tbody.innerHTML, /<img/);
  assert.match(tbody.innerHTML, /data-audit-open="&quot;&gt;&lt;img/);
});

test("remarcar asistencia sin comentario conserva la observacion; vaciarla expresamente la borra", async () => {
  const service = await source("src/services/teacherData.js");
  let stored = { observacion: "Se incorpora a las 9am", estado: "atraso" };
  const save = vm.runInNewContext(service.slice(service.indexOf("export async function saveAttendance"), service.indexOf("export async function listActivities")).replace("export ", "") + "; saveAttendance", {
    asegurarRegistroDocente() {}, asegurarTrimestreRegistro() {}, validarFechaGestion() {}, gestionActual: () => "2026", currentUid: () => "docente-a",
    getTeacherContext: async () => ({ profile: { nombre: "Aracely" } }), auth: { currentUser: {} }, nombreDocenteAsistencia: (name) => name,
    attendanceDocId: () => "asistencia-a", serverTimestamp: () => "ahora", documentoGestion: () => ({}), doc() {}, periodosCurso() {}, firestore: {},
    guardarConPeriodoCurso: async ({ payload }) => { stored = { ...stored, ...payload }; }, getDoc: async () => ({ data: () => stored }),
    sincronizarAsistenciaCalificar() {}, announceAlertDataChange() {}, safeAudit() {}
  });
  const input = { course: { id: "cuarto_a", nombre: "Cuarto A" }, student: { id: "a", nombre: "Ana" }, fecha: "2026-03-10", estado: "presente" };
  const result = await save(input);
  assert.equal(stored.observacion, "Se incorpora a las 9am");
  assert.equal(result.observacion, stored.observacion);
  await save({ ...input, observacion: "" });
  assert.equal(stored.observacion, "");
});

test("editar una actividad de otro dia mantiene el curso original", async () => {
  const agenda = (await source("src/modules/docente/AgendaDocente.js")).replace(/^import .*;\r?\n/gm, "").replace("export async function renderTasks", "async function renderTasks");
  const courses = ["tercero_a", "cuarto_a"].map((id) => ({ ...catalog.findCourse(id), materias: ["matematica"] }));
  const task = { id: "actividad-cuarto", cursoId: "cuarto_a", materiaId: "matematica", fecha: "2026-10-27", tipo: "tarea", titulo: "Titulo original", maximo: 100 };
  const state = { ...teacherState, taskMonth: "2026-10", taskEditActivityId: task.id, taskDraftCourseId: task.cursoId, taskModalDate: "" };
  const container = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
  const render = vm.runInNewContext(`${agenda}; renderTasks`, {
    ...utilities, ...academic, ...common, ...catalog,
    teacherState: state, selectedCourse: () => courses[1], selectedTrimester: () => ({ label: "1er trimestre" }),
    todayIso: () => "2026-10-26", gestionActual: () => "2026", icon: () => "", refreshIcons() {},
    listActivities: async (id) => id === task.cursoId ? [task] : [],
    getTeacherScheduleRows: async () => [{ cursoId: "tercero_a", materiaId: "matematica", diaId: utilities.dayIdFromIso("2026-10-26"), hora: "08:00" }],
    document: { querySelector: () => container }, sessionStorage: globalThis.sessionStorage, FormData
  });
  await render({ courses });
  assert.equal(state.taskDraftCourseId, "cuarto_a");
  assert.match(container.innerHTML, /value="cuarto_a" selected/);
  assert.match(container.innerHTML, /name="fecha" value="2026-10-27"/);
});

test("el boletin incluye incorporaciones posteriores y actualiza nombres por ID", () => {
  const rows = bulletinStudents([{ students: [{ id: "a", nombre: "Ana anterior" }] }, { students: [{ id: "b", nombre: "Bruno" }, { id: "a", nombre: "Ana actual" }] }, null]);
  assert.deepEqual(rows.map((row) => [row.id, row.nombre]), [["a", "Ana actual"], ["b", "Bruno"]]);
});

test("imprimir 41 alumnos genera dos paginas e incluye al ultimo", () => {
  const previousWindow = globalThis.window;
  let html = "";
  globalThis.window = { location: { origin: "http://localhost" }, open: () => ({ document: { open() {}, write(value) { html = value; }, close() {} } }) };
  try {
    const students = Array.from({ length: 41 }, (_, index) => ({ id: `a${index}`, nombre: `ALUMNO ${String(index + 1).padStart(2, "0")}` }));
    printDocument({ students, course: catalog.findCourse("cuarto_a"), activities: [], gradesList: [], attendanceRows: [], calculateStudentTerm: academic.calculateStudentTerm }, [catalog.findSubject("matematica")]);
    assert.equal((html.match(/class="print-page /g) || []).length, 2);
    for (const student of students) assert.ok(html.includes(student.nombre));
    assert.match(html, /<td>41<\/td>/);
  } finally { globalThis.window = previousWindow; }
});

test("abrir de nuevo el resumen de Direccion consulta notas y asistencias actuales", async () => {
  const director = await source("src/modules/director/DirectorStudents.js");
  let note = 40, missed = 1;
  const loaders = vm.runInNewContext(director.slice(director.indexOf("async function reportData()"), director.indexOf("function reportTerm")) + "; ({reportData,reportAttendance})", {
    listDirectorAllActivities: async () => [], listDirectorGrades: async () => [{ nota: note }], listDirectorAttendanceByTrimester: async () => [{ faltas: missed }]
  });
  assert.equal((await loaders.reportData()).grades[0].nota, 40);
  assert.equal((await loaders.reportAttendance("t1"))[0].faltas, 1);
  note = 90; missed = 3;
  assert.equal((await loaders.reportData()).grades[0].nota, 90);
  assert.equal((await loaders.reportAttendance("t1"))[0].faltas, 3);
});
