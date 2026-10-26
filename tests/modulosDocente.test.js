import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { readFile } from "node:fs/promises";
import { claveCache, establecerConfiguracion } from "../src/services/rutasFirestore.js";

const previous = new Map(["document", "sessionStorage", "localStorage"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const storage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), clear: () => data.clear() };
};
const modules = [
  ["AsistenciaDocente", "renderAttendance", "[data-teacher-attendance]"],
  ["AgendaDocente", "renderTasks", "[data-teacher-tasks]"],
  ["CalificarDocente", "renderDateGrading", "[data-teacher-grading]"],
  ["RegularizacionDocente", "renderRegularization", "[data-teacher-regularization]"],
  ["NotasDocente", "renderNotes", "[data-teacher-notes]"],
  ["ResumenAsistenciaDocente", "renderSummary", "[data-teacher-summary]"],
  ["HorarioDocente", "renderTeacherSchedule", "[data-teacher-schedule]"]
];
let teacherState;
let roots;

before(async () => {
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
  roots = new Map();
  globalThis.document = { querySelector: (selector) => roots.get(selector) || null, querySelectorAll: () => [] };
  ({ teacherState } = await import("../src/modules/docente/EstadoDocente.js"));
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2 });
});

after(() => {
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

test("el trimestre solo cambia en la pantalla y cache despues de confirmar el guardado remoto", async () => {
  const { persistActiveTrimester } = await import("../src/modules/docente/EstadoDocente.js");
  const context = { uid: "docente-prueba", profile: { trimestreActivo: "t1" } };
  teacherState.trimesterId = "t1";
  sessionStorage.setItem("docenteTrimestreId", "t1");
  await assert.rejects(persistActiveTrimester(context, "t2", async () => { throw new Error("permission-denied"); }), /permission-denied/);
  assert.equal(teacherState.trimesterId, "t1");
  assert.equal(context.profile.trimestreActivo, "t1");
  assert.equal(sessionStorage.getItem("docenteTrimestreId"), "t1");
  let confirmar;
  const pending = persistActiveTrimester(context, "t2", () => new Promise((resolve) => { confirmar = resolve; }));
  assert.equal(teacherState.trimesterId, "t1");
  confirmar();
  await pending;
  assert.equal(teacherState.trimesterId, "t2");
  assert.equal(context.profile.trimestreActivo, "t2");
  assert.equal(sessionStorage.getItem("docenteTrimestreId"), "t2");
  teacherState.trimesterId = "t1";
});

test("el calendario de agenda no cruza a otro ano con una gestion distinta en la cabecera", async () => {
  const { shiftMonth, monthLabel } = await import("../src/modules/docente/UtilidadesDocente.js");
  assert.equal(shiftMonth("2026-12", 1), "2026-12");
  assert.equal(shiftMonth("2026-01", -1), "2026-01");
  assert.equal(shiftMonth("2026-09", 1), "2026-10");
  assert.doesNotMatch(monthLabel("2026-10"), /2026/);
});

test("cada modulo expone su pantalla y no hace cargas cuando su contenedor no existe", async () => {
  for (const [file, renderer] of modules) {
    const imported = await import(`../src/modules/docente/${file}.js`);
    assert.equal(typeof imported[renderer], "function", file);
    await imported[renderer]({ courses: [] });
  }
  const controller = await import("../src/modules/docente/ControladorDocente.js");
  assert.equal(typeof controller.bindDocentePages, "function");
  await controller.bindDocentePages("/");
});

test("la asistencia guiada se posiciona en la pantalla, no a la altura del boton", async () => {
  const { guidedAttendanceModal } = await import("../src/modules/docente/AsistenciaDocente.js");
  teacherState.attendanceMode = "guia"; teacherState.guidedIndex = 0;
  const html = guidedAttendanceModal({ nombre: "Cuarto A" }, [{ id: "a", nombre: "Ana" }], {});
  assert.match(html, /data-guided-modal/);
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="guided-attendance-title"/);
  assert.match(html, /data-guided-state="presente"/);
  assert.match(html, /data-guided-prev/); assert.match(html, /data-guided-next/);
  assert.doesNotMatch(html, /padding-top:|items-start/);
  teacherState.attendanceMode = "lista";
  assert.match(guidedAttendanceModal({ nombre: "Cuarto A" }, [], {}), /hidden/);
  const source = await readFile(new URL("../src/modules/docente/AsistenciaDocente.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /guidedModalTop/);
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.initial-dialog-backdrop:has\(\.initial-attendance-guide\)/);
  assert.match(css, /max-height: calc\(100dvh - 40px\)/);
  assert.match(css, /align-items: flex-start;\s*padding: max\(12px, env\(safe-area-inset-top\)\)/);
  assert.match(css, /overflow-y: auto;\s*overscroll-behavior: contain/);
});

test("las pantallas sin cursos conservan su estado vacio despues de separarse", async () => {
  for (const [file, renderer, selector] of modules) {
    const root = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
    roots.set(selector, root);
    const imported = await import(`../src/modules/docente/${file}.js`);
    await imported[renderer]({ courses: [] });
    assert.match(root.innerHTML, /Sin cursos|Sin asignaciones|Sin horario/, file);
    roots.delete(selector);
  }
});

test("Notas conserva la tabla, los alumnos y el calculo usando exclusivamente la copia local", async () => {
  const context = { uid: "docente-prueba", courses: [{ id: "cuarto_a", nombre: "Cuarto A", corto: "4A", materias: ["matematica"] }] };
  teacherState.context = context;
  teacherState.selectedCourseId = "cuarto_a";
  teacherState.selectedSubjectId = "matematica";
  teacherState.trimesterId = "t2";
  const base = { cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t2", maximo: 100, fecha: "2026-09-22", estadoRevision: "cerrada" };
  const activities = [{ ...base, id: "saber", titulo: "Examen", tipo: "examen" }, { ...base, id: "hacer", titulo: "Ejercicios", tipo: "tarea" }, { ...base, id: "auto", titulo: "Autoevaluacion", tipo: "auto", interno: true, maximo: 5 }];
  const data = {
    students: [{ id: "alumno-prueba", nombre: "Alumno de prueba", cursoId: "cuarto_a", activo: true }], activities,
    gradesList: [{ id: "nota-saber", alumnoId: "alumno-prueba", actividadId: "saber", valor: 80, nota: 80, estadoEntrega: "a_tiempo" }, { id: "nota-hacer", alumnoId: "alumno-prueba", actividadId: "hacer", valor: 70, nota: 70, estadoEntrega: "a_tiempo" }, { id: "nota-auto", alumnoId: "alumno-prueba", actividadId: "auto", valor: 5, nota: 100 }],
    attendanceRows: [{ alumnoId: "alumno-prueba", cursoId: "cuarto_a", fecha: base.fecha, trimestreId: "t2", estado: "licencia" }]
  };
  localStorage.setItem(claveCache("notas", context.uid, "cuarto_a", "t2"), JSON.stringify({ updatedAt: Date.now(), data }));
  const root = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  roots.set("[data-teacher-notes]", root);
  const { renderNotes } = await import("../src/modules/docente/NotasDocente.js");
  await renderNotes(context);
  assert.match(root.innerHTML, /Alumno de prueba/);
  assert.match(root.innerHTML, /Notas por materia/);
  assert.match(root.innerHTML, />79</);
  assert.match(root.innerHTML, /data-refresh-notes-cache/);
  assert.match(root.innerHTML, /> Actualizar\s*</);
  roots.clear();
});

test("Resumen conserva la copia local y suma Licencia y Permiso en una misma columna", async () => {
  const context = { uid: "docente-prueba", courses: [{ id: "cuarto_a", nombre: "Cuarto A", corto: "4A", materias: ["matematica"] }] };
  teacherState.context = context;
  teacherState.selectedCourseId = "cuarto_a";
  teacherState.trimesterId = "t2";
  const student = { id: "alumno-prueba", nombre: "Alumno de prueba", cursoId: "cuarto_a", activo: true };
  const records = ["licencia", "permiso", " LICENCIA "].map((estado, index) => ({ alumnoId: student.id, cursoId: "cuarto_a", trimestreId: "t2", fecha: `2026-09-${22 + index}`, estado }));
  localStorage.setItem(claveCache("resumen_asistencia", context.uid, "cuarto_a", "t2"), JSON.stringify({ updatedAt: Date.now(), data: { students: [student], records } }));
  const root = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  roots.set("[data-teacher-summary]", root);
  const { renderSummary } = await import("../src/modules/docente/ResumenAsistenciaDocente.js");
  await renderSummary(context);
  assert.match(root.innerHTML, /3 fecha\(s\) registradas/);
  const row = root.innerHTML.match(/<tr data-teacher-alert-student="alumno-prueba"[^>]*>(.*?)<\/tr>/s)[1];
  assert.equal((row.match(/>L<\/span>/g) || []).length, 3);
  assert.match(row, /<td class="w-7[^>]*>3<\/td>/);
  assert.match(root.innerHTML, /Actualizar resumen/);
  roots.clear();
});

test("Calificar muestra pendientes y el modal usando la copia local sin consultas remotas", async () => {
  const { cacheCalificar, ambitoCalificar } = await import("../src/services/datosCalificarDocente.js");
  const context = { uid: "docente-calificar", gestionId: "2026", courses: [{ id: "cuarto_a", nombre: "Cuarto A", corto: "4A", materias: ["matematica"] }] };
  const ambito = ambitoCalificar(context, "t1");
  const actividad = { id: "tarea-local", cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t1", fecha: "2026-02-02", titulo: "Tarea local", tipo: "tarea", maximo: 100, estadoRevision: "en_proceso" };
  const student = { id: "alumno-local", nombre: "Alumno local", cursoId: "cuarto_a" };
  cacheCalificar.guardar(ambito, "actividades", "cuarto_a", [actividad]);
  cacheCalificar.guardar(ambito, "alumnos", "cuarto_a", [student]);
  cacheCalificar.guardar(ambito, "notas_actividad", actividad.id, {});
  cacheCalificar.guardar(ambito, "asistencia", `cuarto_a_${actividad.fecha}`, { [student.id]: { estado: "presente" } });
  teacherState.context = context;
  teacherState.trimesterId = "t1";
  teacherState.gradeScope = "pendientes";
  teacherState.gradeModalActivityId = "";
  teacherState.gradeModalClosed = true;
  const root = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  roots.set("[data-teacher-grading]", root);
  const { renderDateGrading } = await import("../src/modules/docente/CalificarDocente.js");
  await renderDateGrading(context);
  assert.match(root.innerHTML, /Tarea local/);
  assert.match(root.innerHTML, /data-refresh-grading/);
  teacherState.gradeModalActivityId = actividad.id;
  teacherState.gradeModalClosed = false;
  await renderDateGrading(context);
  assert.match(root.innerHTML, /Alumno local/);
  assert.match(root.innerHTML, /data-student-grade-modal/);
  teacherState.gradeModalActivityId = "";
  teacherState.gradeModalClosed = true;
  roots.clear();
});

test("cerrar revision usa un modal interno y cancelar no modifica notas ni licencias", async () => {
  const { cacheCalificar, ambitoCalificar } = await import("../src/services/datosCalificarDocente.js");
  const context = { uid: "docente-confirmacion", gestionId: "2026", courses: [{ id: "cuarto_a", nombre: "Cuarto A", corto: "4A", materias: ["matematica"] }] };
  const ambito = ambitoCalificar(context, "t1");
  const activity = { id: "examen-confirmacion", cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t1", fecha: "2026-02-02", titulo: "Examen 1", tipo: "examen", maximo: 100, estadoRevision: "en_proceso" };
  const students = ["calificado", "ausente", "licencia"].map((id) => ({ id, nombre: id, cursoId: "cuarto_a" }));
  const grades = { calificado: { alumnoId: "calificado", actividadId: activity.id, valor: 80, nota: 80 } };
  cacheCalificar.guardar(ambito, "actividades", "cuarto_a", [activity]);
  cacheCalificar.guardar(ambito, "alumnos", "cuarto_a", students);
  cacheCalificar.guardar(ambito, "notas_actividad", activity.id, grades);
  cacheCalificar.guardar(ambito, "asistencia", `cuarto_a_${activity.fecha}`, { calificado: { estado: "presente" }, ausente: { estado: "falta" }, licencia: { estado: "licencia" } });
  teacherState.context = context;
  teacherState.trimesterId = "t1";
  teacherState.gradeScope = "pendientes";
  teacherState.gradeModalActivityId = activity.id;
  teacherState.gradeModalClosed = false;

  const element = () => {
    const classes = new Set(["hidden"]);
    return { handlers: {}, focused: false, classList: { add: (...items) => items.forEach((item) => classes.add(item)), remove: (...items) => items.forEach((item) => classes.delete(item)), contains: (item) => classes.has(item) }, addEventListener(type, handler) { this.handlers[type] = handler; }, focus() { this.focused = true; } };
  };
  const modal = element(), open = element(), cancel = element(), confirmButton = element();
  const controls = new Map([["[data-finalize-review-modal]", modal], ["[data-finalize-activity-review]", open], ["[data-cancel-finalize-review]", cancel], ["[data-confirm-finalize-review]", confirmButton]]);
  const root = { innerHTML: "", querySelector: (selector) => controls.get(selector) || null, querySelectorAll: () => [] };
  roots.set("[data-teacher-grading]", root);
  const previousConfirm = globalThis.confirm;
  globalThis.confirm = () => { throw new Error("No debe abrir la confirmacion nativa"); };
  try {
    const { renderDateGrading } = await import("../src/modules/docente/CalificarDocente.js");
    await renderDateGrading(context);
    assert.match(root.innerHTML, /role="dialog" aria-modal="true" aria-labelledby="finalize-review-title"/);
    assert.match(root.innerHTML, /1 alumno\(s\) sin nota se marcaran como no presentaron/);
    assert.match(root.innerHTML, /1 alumno\(s\) con licencia seguiran pendientes y no perderan Responsabilidad/);
    open.handlers.click();
    assert.equal(modal.classList.contains("hidden"), false);
    assert.equal(cancel.focused, true);
    cancel.handlers.click();
    assert.equal(modal.classList.contains("hidden"), true);
    assert.equal(open.focused, true);
    open.handlers.click();
    modal.handlers.keydown({ key: "Escape", preventDefault() {} });
    assert.equal(modal.classList.contains("hidden"), true);
    assert.deepEqual(cacheCalificar.leer(ambito, "notas_actividad", activity.id), grades);
    assert.equal(cacheCalificar.leer(ambito, "actividades", "cuarto_a")[0].estadoRevision, "en_proceso");
  } finally {
    if (previousConfirm === undefined) delete globalThis.confirm;
    else globalThis.confirm = previousConfirm;
    teacherState.gradeModalActivityId = "";
    teacherState.gradeModalClosed = true;
    roots.clear();
  }
});

test("Regularizacion muestra el total real y todos los segmentos, incluso con mas de diez por dimension", async () => {
  const { renderRegularization } = await import("../src/modules/docente/RegularizacionDocente.js");
  const { upsertTeacherNotesSnapshotGrade } = await import("../src/services/teacherData.js");
  const courses = [
    { id: "cuarto_a", nombre: "Cuarto A", corto: "4A", materias: ["matematica"] },
    { id: "tercero_a", nombre: "Tercero A", corto: "3A", materias: ["matematica"] }
  ];
  const context = { uid: "docente-totales-regularizacion", courses };
  const student = { id: "alumno-total", nombre: "Alumno con pendientes", cursoId: "cuarto_a" };
  const otherStudent = { id: "otro-curso", nombre: "Otro alumno", cursoId: "tercero_a" };
  const base = { cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t1", fecha: "2026-02-02", maximo: 100, estadoRevision: "cerrada", regularizacionDesde: "2026-02-03" };
  const tasks = Array.from({ length: 12 }, (_, index) => ({ ...base, id: `hacer-${index}`, titulo: `Tarea ${index + 1}`, tipo: "tarea" }));
  const exams = Array.from({ length: 13 }, (_, index) => ({ ...base, id: `saber-${index}`, titulo: `Examen ${index + 1}`, tipo: "examen" }));
  const presented = { ...base, id: "presentada", titulo: "Ya presentada", tipo: "tarea" };
  const data = {
    students: [student],
    activities: [...tasks, ...exams, presented,
      { ...base, id: "abierta", titulo: "Revision abierta", tipo: "tarea", estadoRevision: "en_proceso" },
      { ...base, id: "otra-materia", materiaId: "lenguaje", tipo: "tarea" },
      { ...base, id: "interno", tipo: "auto", interno: true }],
    gradesList: [
      { actividadId: presented.id, alumnoId: student.id, valor: 80, nota: 80 },
      { actividadId: tasks[0].id, alumnoId: student.id, valor: 0, nota: 35, estadoEntrega: "no_presento" }
    ],
    attendanceRows: [{ alumnoId: student.id, fecha: base.fecha, estado: "licencia" }]
  };
  const otherData = { students: [otherStudent], activities: [{ ...base, id: "tarea-tercero", cursoId: "tercero_a", tipo: "tarea" }], gradesList: [], attendanceRows: [] };
  localStorage.setItem(claveCache("notas", context.uid, "cuarto_a", "t1"), JSON.stringify({ updatedAt: Date.now(), data }));
  localStorage.setItem(claveCache("notas", context.uid, "tercero_a", "t1"), JSON.stringify({ updatedAt: Date.now(), data: otherData }));
  teacherState.context = context;
  teacherState.trimesterId = "t1";
  teacherState.regularizationSearch = "";
  teacherState.regularizationReportStudentId = "";
  teacherState.regularizationGradeActivityId = "";
  teacherState.regularizationGradeStudentId = "";
  const root = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  roots.set("[data-teacher-regularization]", root);
  try {
    await renderRegularization(context);
    assert.match(root.innerHTML, /data-regularization-total="26">26</);
    assert.match(root.innerHTML, /data-regularization-student-total="alumno-total" data-pending-count="25">25</);
    assert.match(root.innerHTML, /data-regularization-student-total="otro-curso" data-pending-count="1">1</);
    assert.match(root.innerHTML, /data-regularization-type="hacer" data-regularization-count="12"/);
    assert.match(root.innerHTML, /data-regularization-type="saber" data-regularization-count="13"/);
    assert.equal((root.innerHTML.match(/data-regularization-segment=/g) || []).length, 26);
    assert.equal((root.innerHTML.match(/data-regularization-segment="hacer-/g) || []).length, 12);
    assert.equal((root.innerHTML.match(/data-regularization-segment="saber-/g) || []).length, 13);
    assert.match(root.innerHTML, /data-regularization-bar style="--pending-count:12"/);
    assert.match(root.innerHTML, /data-regularization-bar style="--pending-count:13"/);
    assert.doesNotMatch(root.innerHTML, /grid-cols-10|auto-rows-\[10px\]/);
    assert.match(root.innerHTML, /data-regularization-type="saber" data-regularization-count="0"/);
    assert.match(root.innerHTML, /Sin pendientes/);

    teacherState.regularizationReportStudentId = student.id;
    await renderRegularization(context);
    assert.equal((root.innerHTML.match(/data-regularization-grade-activity=/g) || []).length, 25);
    assert.match(root.innerHTML, /13 pendiente\(s\)/);
    assert.match(root.innerHTML, /12 pendiente\(s\)/);

    upsertTeacherNotesSnapshotGrade(context, tasks[0], { id: "regularizada", actividadId: tasks[0].id, alumnoId: student.id, valor: 75, nota: 75 });
    await renderRegularization(context);
    assert.match(root.innerHTML, /data-regularization-total="25">25</);
    assert.match(root.innerHTML, /data-regularization-student-total="alumno-total" data-pending-count="24">24</);
    assert.match(root.innerHTML, /data-regularization-type="hacer" data-regularization-count="11"/);
    assert.equal((root.innerHTML.match(/data-regularization-segment=/g) || []).length, 25);
    assert.equal((root.innerHTML.match(/data-regularization-grade-activity=/g) || []).length, 24);
  } finally {
    teacherState.regularizationReportStudentId = "";
    roots.clear();
  }
});

test("Regularizacion identifica materias por color y califica solo al alumno y materia seleccionados", async () => {
  const { renderRegularization } = await import("../src/modules/docente/RegularizacionDocente.js");
  const courses = [
    { id: "cuarto_a", nombre: "Cuarto A", materias: ["matematica", "ciencias_naturales"] },
    { id: "tercero_a", nombre: "Tercero A", materias: ["matematica"] }
  ];
  const context = { uid: "docente-filtro-regularizacion", courses };
  const student = { id: "alumno-filtrado", nombre: "Alumno principal", cursoId: "cuarto_a" };
  const other = { id: "alumno-otro-curso", nombre: "Otro alumno", cursoId: "tercero_a" };
  const base = { cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t1", fecha: "2026-02-02", tipo: "tarea", maximo: 100, estadoRevision: "cerrada", regularizacionDesde: "2026-02-10" };
  const math = { ...base, id: "matematica-pendiente", titulo: "Tarea de matematica" };
  const science = [
    { ...base, id: "naturales-examen", titulo: "Examen de celula", materiaId: "ciencias_naturales", tipo: "examen", fecha: "2026-02-03" },
    { ...base, id: "naturales-tarea", titulo: "Dibujo de celula", materiaId: "ciencias_naturales", fecha: "2026-02-04" }
  ];
  const data = { students: [student], activities: [math, ...science], gradesList: [], attendanceRows: [math, ...science].map((activity) => ({ alumnoId: student.id, fecha: activity.fecha, estado: "licencia" })) };
  const otherData = { students: [other], activities: [{ ...math, id: "tarea-otro-curso", cursoId: "tercero_a" }], gradesList: [], attendanceRows: [] };
  for (const [index, snapshot] of [data, otherData].entries()) {
    localStorage.setItem(claveCache("notas", context.uid, courses[index].id, "t1"), JSON.stringify({ updatedAt: Date.now(), data: snapshot }));
  }
  teacherState.context = context;
  teacherState.trimesterId = "t1";
  teacherState.regularizationSearch = "";
  teacherState.regularizationReportStudentId = student.id;
  teacherState.regularizationSubject = { studentId: student.id, id: "all" };
  teacherState.regularizationGradeActivityId = "";
  teacherState.regularizationGradeStudentId = "";
  const button = (dataset = {}) => ({ dataset, handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; }, focus() {} });
  const subjectButton = button({ regularizationSubject: "ciencias_naturales" });
  const startButton = button();
  const closeGrade = button();
  const root = {
    innerHTML: "",
    querySelector: (selector) => selector === "[data-regularization-start-grading]" ? startButton : selector === "[data-close-regularization-grade]" ? closeGrade : null,
    querySelectorAll: (selector) => selector === "[data-regularization-subject]" ? [subjectButton] : []
  };
  roots.set("[data-teacher-regularization]", root);
  try {
    await renderRegularization(context);
    assert.match(root.innerHTML, /data-regularization-subject-color="matematica"[^>]*style="background:#f8c7c7"/);
    assert.match(root.innerHTML, /data-regularization-subject-color="ciencias_naturales"[^>]*style="background:#cfe8c1"/);
    assert.match(root.innerHTML, /role="dialog" aria-modal="true" aria-labelledby="regularization-report-title"/);
    assert.equal((root.innerHTML.match(/data-regularization-report-activity=/g) || []).length, 3);

    await subjectButton.handlers.click();
    assert.deepEqual(teacherState.regularizationSubject, { studentId: student.id, id: "ciencias_naturales" });
    assert.match(root.innerHTML, /data-regularization-subject="ciencias_naturales" aria-pressed="true"/);
    assert.equal((root.innerHTML.match(/data-regularization-report-subject="ciencias_naturales"/g) || []).length, 2);
    assert.doesNotMatch(root.innerHTML, /data-regularization-report-subject="matematica"/);
    assert.match(root.innerHTML, /data-regularization-report-dimension="saber"/);
    assert.match(root.innerHTML, /data-regularization-report-dimension="hacer"/);
    assert.match(root.innerHTML, /data-regularization-report-subject="ciencias_naturales" style="--subject-color:#cfe8c1"/);

    await startButton.handlers.click();
    assert.equal(teacherState.regularizationGradeActivityId, science[0].id);
    assert.equal(teacherState.regularizationGradeStudentId, student.id);
    assert.doesNotMatch(root.innerHTML, /data-save-next-regularization-grade-input/);
    assert.doesNotMatch(root.innerHTML, /data-regularization-report role="dialog"/);
    assert.match(root.innerHTML, /border-top:5px solid #cfe8c1/);

    teacherState.regularizationGradeActivityId = science[1].id;
    await renderRegularization(context);
    assert.doesNotMatch(root.innerHTML, /data-save-next-regularization-grade-input/);
    await closeGrade.handlers.click();
    assert.equal(teacherState.regularizationGradeActivityId, "");
    assert.match(root.innerHTML, /data-regularization-subject="ciencias_naturales" aria-pressed="true"/);
    assert.equal((root.innerHTML.match(/data-regularization-report-activity=/g) || []).length, 2);

    teacherState.regularizationReportStudentId = other.id;
    await renderRegularization(context);
    assert.match(root.innerHTML, /data-regularization-subject="all" aria-pressed="true"/);
    assert.match(root.innerHTML, /data-regularization-report-activity="tarea-otro-curso"/);
  } finally {
    teacherState.regularizationReportStudentId = "";
    teacherState.regularizationSubject = { studentId: "", id: "all" };
    teacherState.regularizationGradeActivityId = "";
    teacherState.regularizationGradeStudentId = "";
    roots.clear();
  }
});

test("Guardar y siguiente en Regularizacion conserva Saber o Hacer, materia y alumno", async () => {
  const { renderRegularization } = await import("../src/modules/docente/RegularizacionDocente.js");
  const courses = [
    { id: "cuarto_a", nombre: "Cuarto A", materias: ["matematica", "ciencias_naturales"] },
    { id: "tercero_a", nombre: "Tercero A", materias: ["matematica"] }
  ];
  const context = { uid: "docente-secuencia-regularizacion", courses };
  const student = { id: "alumno-secuencia", nombre: "Alumno principal", cursoId: "cuarto_a" };
  const otherStudent = { id: "alumno-ajeno-secuencia", nombre: "Otro alumno", cursoId: "tercero_a" };
  const base = { cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t1", maximo: 100, estadoRevision: "cerrada", regularizacionDesde: "2026-02-15" };
  const activities = [
    { ...base, id: "hacer-primera", tipo: "tarea", fecha: "2026-02-02", titulo: "Tarea uno" },
    { ...base, id: "saber-primera", tipo: "examen", fecha: "2026-02-03", titulo: "Examen uno" },
    { ...base, id: "saber-otra-materia", materiaId: "ciencias_naturales", tipo: "examen", fecha: "2026-02-04", titulo: "Examen de ciencias" },
    { ...base, id: "hacer-segunda", tipo: "hacer", fecha: "2026-02-05", titulo: "Tarea dos" },
    { ...base, id: "saber-segunda", tipo: "saber", fecha: "2026-02-06", titulo: "Examen dos" },
    { ...base, id: "saber-presentada", tipo: "examen", fecha: "2026-02-07", titulo: "Examen ya presentado" }
  ];
  const data = {
    students: [student], activities,
    gradesList: [{ actividadId: "saber-presentada", alumnoId: student.id, valor: 85, nota: 85 }],
    attendanceRows: activities.map((activity) => ({ alumnoId: student.id, fecha: activity.fecha, estado: "licencia" }))
  };
  const otherData = { students: [otherStudent], activities: [{ ...base, cursoId: "tercero_a", id: "saber-otro-alumno", tipo: "examen", fecha: "2026-02-08", titulo: "Examen de otro alumno" }], gradesList: [], attendanceRows: [] };
  for (const [index, snapshot] of [data, otherData].entries()) {
    localStorage.setItem(claveCache("notas", context.uid, courses[index].id, "t1"), JSON.stringify({ updatedAt: Date.now(), data: snapshot }));
  }
  teacherState.context = context;
  teacherState.trimesterId = "t1";
  teacherState.regularizationSearch = "";
  teacherState.regularizationReportStudentId = student.id;
  teacherState.regularizationSubject = { studentId: student.id, id: "all" };
  const root = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  roots.set("[data-teacher-regularization]", root);
  const openActivity = async (id) => {
    teacherState.regularizationGradeActivityId = id;
    teacherState.regularizationGradeStudentId = student.id;
    await renderRegularization(context);
    return root.innerHTML;
  };
  try {
    const saber = await openActivity("saber-primera");
    assert.match(saber, /data-save-next-regularization-grade-input title="Siguiente de Saber: Examen dos"/);
    assert.match(saber, /Saber · Matematica · Regularizacion/);
    const hacer = await openActivity("hacer-primera");
    assert.match(hacer, /data-save-next-regularization-grade-input title="Siguiente de Hacer: Tarea dos"/);
    assert.match(hacer, /Hacer · Matematica · Regularizacion/);
    for (const id of ["saber-segunda", "hacer-segunda", "saber-otra-materia"]) {
      assert.doesNotMatch(await openActivity(id), /data-save-next-regularization-grade-input/);
    }
    teacherState.regularizationReportStudentId = "";
    assert.doesNotMatch(await openActivity("saber-segunda"), /data-save-next-regularization-grade-input/);
    teacherState.regularizationReportStudentId = student.id;
    teacherState.regularizationSubject = { studentId: student.id, id: "matematica" };
    assert.match(await openActivity("saber-primera"), /title="Siguiente de Saber: Examen dos"/);
    assert.match(await openActivity("hacer-primera"), /title="Siguiente de Hacer: Tarea dos"/);
  } finally {
    teacherState.regularizationReportStudentId = "";
    teacherState.regularizationSubject = { studentId: "", id: "all" };
    teacherState.regularizationGradeActivityId = "";
    teacherState.regularizationGradeStudentId = "";
    roots.clear();
  }
});
