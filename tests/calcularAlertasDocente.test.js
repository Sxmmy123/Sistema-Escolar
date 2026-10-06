import assert from "node:assert/strict";
import test from "node:test";
import { calculateTeacherAlerts, teacherAlertKeys, unseenTeacherAlerts } from "../src/services/calcularAlertasDocente.js";

const courses = [{ id: "cuarto_a", materias: ["matematica", "lenguaje"] }];
const students = [
  { id: "ana", nombre: "Ana", cursoId: "cuarto_a", activo: true },
  { id: "beto", nombre: "Beto", cursoId: "cuarto_a", activo: true },
  { id: "cesar", nombre: "Cesar", cursoId: "tercero_a", activo: true }
];
const base = { courses, students, trimesterId: "t2", today: "2026-09-28" };
const attendanceRow = (studentId, date, state) => ({
  alumnoId: studentId, cursoId: "cuarto_a", trimestreId: "t2", fecha: date, estado: state
});
const activity = (id, overrides = {}) => ({
  id, cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t2",
  fecha: "2026-09-22", titulo: `Actividad ${id}`, ...overrides
});
const grade = (studentId, activityId, value, overrides = {}) => ({
  alumnoId: studentId, actividadId: activityId, cursoId: "cuarto_a",
  materiaId: "matematica", trimestreId: "t2", nota: value, valor: value, ...overrides
});

test("tres faltas consecutivas solo usan dias registrados y se apagan tras seguimiento", () => {
  const dates = ["2026-09-23", "2026-09-24", "2026-09-25"];
  const attendance = dates.map((date) => attendanceRow("ana", date, "falta"));
  attendance.push(attendanceRow("beto", "2026-09-20", "presente"));
  assert.deepEqual(calculateTeacherAlerts({ ...base, attendance: attendance.slice(0, 2) }).absences, []);
  const initial = calculateTeacherAlerts({ ...base, attendance });
  assert.deepEqual(initial.absences.map(({ student, count, total }) => [student.id, count, total]), [["ana", 3, 3]]);
  assert.deepEqual(calculateTeacherAlerts({ ...base, attendance, followUps: [{ alumnoId: "ana", trimestreId: "t2", ultimaFaltaAtendida: "2026-09-25" }] }).absences, []);
  const more = [...attendance, attendanceRow("ana", "2026-09-26", "falta")];
  assert.equal(calculateTeacherAlerts({ ...base, attendance: more, followUps: [{ alumnoId: "ana", trimestreId: "t2", ultimaFaltaAtendida: "2026-09-25" }] }).absences[0].count, 4);
  assert.deepEqual(calculateTeacherAlerts({ ...base, attendance: [...attendance, attendanceRow("ana", "2026-09-26", "licencia")] }).absences, []);
});

test("no confunde ausencia sin registro, otro curso ni otro trimestre", () => {
  const attendance = [
    attendanceRow("ana", "2026-09-22", "falta"),
    attendanceRow("beto", "2026-09-23", "falta"),
    attendanceRow("ana", "2026-09-24", "falta"),
    attendanceRow("ana", "2026-09-25", "falta"),
    attendanceRow("cesar", "2026-09-28", "falta"),
    { ...attendanceRow("ana", "2026-09-28", "falta"), trimestreId: "t1" }
  ];
  assert.deepEqual(calculateTeacherAlerts({ ...base, attendance }).absences, []);
});

test("cada alumno con actividades no presentadas requiere revision cerrada", () => {
  const activities = Array.from({ length: 10 }, (_, index) => activity(`a${index}`, {
    estadoRevision: "cerrada", regularizacionDesde: "2026-09-23"
  }));
  const initial = calculateTeacherAlerts({ ...base, activities });
  assert.equal(initial.studentAlerts.find((item) => item.student.id === "ana")?.missing.length, 10);
  const resolved = calculateTeacherAlerts({ ...base, activities, grades: [grade("ana", "a0", 80)] });
  assert.equal(resolved.studentAlerts.find((item) => item.student.id === "ana")?.missing.length, 9);
  const legacy = activities.map(({ estadoRevision, ...item }) => item);
  const legacyGrades = legacy.map((item) => grade("ana", item.id, 0));
  assert.equal(calculateTeacherAlerts({ ...base, activities: legacy, grades: legacyGrades }).studentAlerts.find((item) => item.student.id === "ana")?.missing.length, 10);
  assert.deepEqual(calculateTeacherAlerts({ ...base, activities: activities.map((item) => ({ ...item, estadoRevision: "en_proceso" })) }).studentAlerts, []);
});

test("cinco actividades no avisan; seis no presentadas o combinadas si avisan", () => {
  const closed = Array.from({ length: 6 }, (_, index) => activity(`c${index}`, {
    estadoRevision: "cerrada", regularizacionDesde: "2026-09-23"
  }));
  assert.deepEqual(calculateTeacherAlerts({ ...base, activities: closed.slice(0, 5) }).studentAlerts, []);
  assert.equal(calculateTeacherAlerts({ ...base, activities: closed }).studentAlerts[0].missing.length, 6);

  const pending = Array.from({ length: 3 }, (_, index) => activity(`p${index}`, { estadoRevision: "en_proceso" }));
  const attendance = [attendanceRow("ana", "2026-09-22", "presente")];
  const five = calculateTeacherAlerts({ ...base, activities: [...closed.slice(0, 3), ...pending.slice(0, 2)], attendance });
  assert.deepEqual(five.studentAlerts, []);
  const six = calculateTeacherAlerts({ ...base, activities: [...closed.slice(0, 3), ...pending], attendance });
  assert.deepEqual([six.studentAlerts[0].missing.length, six.studentAlerts[0].pending.length], [3, 3]);
});

test("pendientes de calificar aparecen por alumno y no equivalen a entregas confirmadas", () => {
  const gradingStudents = Array.from({ length: 6 }, (_, index) => ({ id: `s${index}`, nombre: `Alumno ${index}`, cursoId: "cuarto_a", activo: true }));
  const attendance = gradingStudents.map((student, index) => attendanceRow(student.id, "2026-09-22", index === 5 ? "falta" : index === 4 ? "atraso" : "presente"));
  const activities = Array.from({ length: 6 }, (_, index) => activity(`a${index}`, { estadoRevision: "en_proceso" }));
  const initial = calculateTeacherAlerts({ ...base, students: gradingStudents, attendance, activities });
  assert.equal(initial.studentAlerts.length, 5);
  assert.equal(initial.studentAlerts.every((item) => item.pending.length === 6 && !item.missing.length), true);
  assert.equal(calculateTeacherAlerts({ ...base, students: gradingStudents, attendance, activities, grades: [grade("s0", "a0", 0)] }).studentAlerts.length, 4);
  const closed = activities.map((item) => ({ ...item, estadoRevision: "cerrada", regularizacionDesde: "2026-09-23" }));
  assert.equal(calculateTeacherAlerts({ ...base, students: gradingStudents, attendance, activities: closed }).studentAlerts.every((item) => item.pending.length === 0), true);
});

test("las notas bajas y actividades no evaluables no crean avisos", () => {
  const activities = [activity("hacer"), activity("auto", { tipo: "auto" }), activity("otro", { cursoId: "tercero_a" })];
  const grades = [
    grade("ana", "hacer", 45),
    grade("ana", "auto", 5), grade("ana", "otro", 20),
    grade("beto", "hacer", 51), grade("cesar", "hacer", 20)
  ];
  const result = calculateTeacherAlerts({ ...base, activities, grades });
  assert.deepEqual(result.studentAlerts, []);
  assert.equal("lowGrades" in result, false);
});

test("abrir el modal oculta lo visto y un pendiente nuevo genera otro aviso", () => {
  const activities = Array.from({ length: 6 }, (_, index) => activity(`a${index}`, {
    estadoRevision: "cerrada", regularizacionDesde: "2026-09-23"
  }));
  const first = calculateTeacherAlerts({ ...base, activities }).studentAlerts[0];
  const seen = teacherAlertKeys(first);
  assert.equal(unseenTeacherAlerts([first], seen).length, 0);
  const next = calculateTeacherAlerts({ ...base, activities: [...activities, activity("a6", { estadoRevision: "cerrada", regularizacionDesde: "2026-09-23" })] }).studentAlerts[0];
  assert.equal(unseenTeacherAlerts([next], seen).length, 1);
  assert.equal(teacherAlertKeys(next).at(-1), "missing:ana:a6");
});

test("una falta nueva vuelve a avisar despues de abrir el modal", () => {
  const dates = ["2026-09-23", "2026-09-24", "2026-09-25"];
  const attendance = dates.map((date) => attendanceRow("ana", date, "falta"));
  const first = calculateTeacherAlerts({ ...base, attendance }).absences[0];
  const seen = teacherAlertKeys(first);
  assert.equal(unseenTeacherAlerts([first], seen).length, 0);
  const next = calculateTeacherAlerts({ ...base, attendance: [...attendance, attendanceRow("ana", "2026-09-26", "falta")] }).absences[0];
  assert.equal(unseenTeacherAlerts([next], seen).length, 1);
});
