import assert from "node:assert/strict";
import test, { before, after } from "node:test";
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
