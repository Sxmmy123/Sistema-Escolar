import assert from "node:assert/strict";
import test from "node:test";
import {
  activityHasGrades, attendanceScore, calculateCourseTerm, calculateSubjectTerm,
  deliveryStateForActivity, gradeByActivityAndStudent, responsibilityContribution
} from "../src/services/calculoAcademico.js";
import { calculateSubjectTerm as teacherSubjectTerm } from "../src/modules/docente/AcademicoDocente.js";
import { fechaEscolarIso } from "../src/services/fechaEscolar.js";
import { claveActividad, idAutoevaluacion } from "../src/services/identificadoresActividad.js";
import { buildBulletin } from "../src/services/studentData.js";

const student = { id: "a", cursoId: "cuarto_a", activo: true };
const task = { id: "tarea", cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t2", tipo: "tarea", fecha: "2026-09-22", estadoRevision: "cerrada" };
const attendance = [{ alumnoId: "a", cursoId: "cuarto_a", trimestreId: "t2", fecha: task.fecha, estado: "presente" }];
const grade = { actividadId: task.id, alumnoId: "a", nota: 80, valor: 80, estadoEntrega: "a_tiempo", fechaEntrega: task.fecha };

test("docente y alumno usan exactamente el mismo calculo academico", () => {
  assert.equal(teacherSubjectTerm, calculateSubjectTerm);
});

test("la boleta real del alumno coincide con docente y director usando solo sus notas", () => {
  const exam = { ...task, id: "examen", tipo: "examen" };
  const activities = [task, exam];
  const grades = [grade, { ...grade, actividadId: exam.id, alumnoId: "b", nota: 100, valor: 100 }];
  const teacher = calculateSubjectTerm(student, "matematica", activities, gradeByActivityAndStudent(grades), attendance);
  const bulletin = buildBulletin({ student, activities, grades: [grade], attendance, trimesterId: "t2" }).find((subject) => subject.subjectId === "matematica");
  const director = calculateCourseTerm({ students: [student], activities, grades, attendanceRows: attendance, courseId: "cuarto_a", trimestreId: "t2" }).studentResults[0].subjectResults.matematica;
  for (const key of ["ser10", "saber45", "hacer40", "auto5", "final", "hasData"]) {
    assert.equal(bulletin[key], teacher[key], key);
    assert.equal(bulletin[key], director[key], key);
  }
});

test("las actividades agendadas sin revision no generan una nota", () => {
  const scheduled = { ...task, estadoRevision: "sin_iniciar" };
  assert.equal(calculateSubjectTerm(student, "matematica", [scheduled], {}, attendance).hasData, false);
});

test("una revision iniciada incluye 35 para el alumno aun no calificado", () => {
  const started = { ...task, estadoRevision: "en_proceso" };
  const result = calculateSubjectTerm(student, "matematica", [started], {}, attendance);
  assert.equal(result.hasData, true);
  assert.equal(result.hacer100, 35);
  assert.equal(result.pendingCount, 1);
});

test("una licencia regularizada aporta 100 a responsabilidad sin cambiar la nota de actividad", () => {
  const grades = gradeByActivityAndStudent([{ ...grade, estadoEntrega: "tardia", fechaEntrega: "2026-09-28" }]);
  const licensed = [{ ...attendance[0], estado: "permiso" }];
  const result = calculateSubjectTerm(student, "matematica", [task], grades, licensed);
  assert.equal(result.responsabilidad100, 100);
  assert.equal(result.hacer100, 80);
  assert.equal(responsibilityContribution(task, "a", grades, attendance), 50);
});

test("una licencia pendiente no penaliza responsabilidad de las otras tareas", () => {
  const second = { ...task, id: "segunda" };
  const grades = gradeByActivityAndStudent([grade]);
  const licensedTask = { ...second, fecha: "2026-09-23" };
  const records = [...attendance, { ...attendance[0], fecha: licensedTask.fecha, estado: "licencia" }];
  const result = calculateSubjectTerm(student, "matematica", [task, licensedTask], grades, records);
  assert.equal(result.responsabilidad100, 100);
});

test("entrega tardia guardada no cambia al revisar a los demas alumnos", () => {
  const late = { ...grade, estadoEntrega: "tardia", fechaEntrega: "2026-09-28" };
  const classmates = { a: late, b: { ...late, alumnoId: "b" }, c: { ...late, alumnoId: "c" } };
  assert.equal(deliveryStateForActivity(task, late, classmates), "tardia");
});

test("las notas antiguas usan el cierre de revision como referencia estable", () => {
  const closed = { ...task, revisionFinalizadaFecha: "2026-09-22" };
  const legacy = { valor: 80, nota: 80, fechaEntrega: "2026-09-28" };
  assert.equal(deliveryStateForActivity(closed, legacy, { a: legacy }), "tardia");
  assert.equal(deliveryStateForActivity(closed, legacy, { a: legacy, b: { ...legacy, fechaEntrega: "2026-09-22" } }), "tardia");
});

test("la falta de registro de un alumno no se convierte en una falta por registros de otro", () => {
  const records = [...attendance, { ...attendance[0], alumnoId: "b", fecha: "2026-09-23", estado: "falta" }];
  assert.equal(attendanceScore("a", records), 100);
  assert.equal(attendanceScore("a", records.filter((record) => record.alumnoId === "a")), 100);
});

test("SER SABER HACER y AUTO conservan sus pesos y omiten criterios SER sin nota", () => {
  const exam = { ...task, id: "examen", tipo: "examen" };
  const auto = { ...task, id: "auto", tipo: "auto", interno: true };
  const extra = { ...task, id: "ser", tipo: "ser", interno: true };
  const grades = gradeByActivityAndStudent([
    { ...grade, nota: 100, valor: 100 },
    { ...grade, actividadId: exam.id, nota: 50, valor: 50 },
    { ...grade, actividadId: auto.id, nota: 100, valor: 5 }
  ]);
  const result = calculateSubjectTerm(student, "matematica", [task, exam, auto, extra], grades, attendance);
  assert.deepEqual([result.ser10, result.saber45, result.hacer40, result.auto5, result.final], [10, 23, 40, 5, 78]);
});

test("el director muestra el final ponderado y separa cursos y trimestres", () => {
  const exam = { ...task, id: "examen", tipo: "examen" };
  const auto = { ...task, id: "auto", tipo: "auto", interno: true };
  const activities = [task, exam, auto, { ...task, id: "otro_trimestre", trimestreId: "t3" }, { ...task, id: "otro_curso", cursoId: "tercero_a" }];
  const grades = [{ ...grade, nota: 100, valor: 100 }, { ...grade, actividadId: exam.id, nota: 50, valor: 50 }, { ...grade, actividadId: auto.id, nota: 100, valor: 5 }];
  const direct = calculateSubjectTerm(student, "matematica", activities.slice(0, 3), gradeByActivityAndStudent(grades), attendance);
  const course = calculateCourseTerm({ students: [student], activities, grades, attendanceRows: attendance, courseId: "cuarto_a", trimestreId: "t2" });
  assert.equal(course.average, 78);
  assert.equal(course.studentResults[0].subjectResults.matematica.final, direct.final);
  assert.equal(course.pending, 0);
});

test("la carga historica ya revisada incluye alumnos sin nota sin depender de activo", () => {
  assert.equal(activityHasGrades({ ...task, estadoRevision: undefined, origen: "carga_historica" }, {}), true);
  assert.equal(activityHasGrades({ ...task, activo: false }, {}), false);
});

test("los registros antiguos conservan tipos en mayuscula y asistencia sin curso", () => {
  const auto = { ...task, id: "auto", tipo: "AUTO", interno: true };
  const extra = { ...task, id: "extra", tipo: "SER", interno: true };
  const grades = [grade, { ...grade, actividadId: auto.id, nota: 100, valor: 5 }, { ...grade, actividadId: extra.id, nota: 100, valor: 100 }];
  const legacyAttendance = [{ ...attendance[0], cursoId: undefined }];
  const course = calculateCourseTerm({ students: [student], activities: [task, auto, extra], grades, attendanceRows: legacyAttendance, courseId: "cuarto_a", trimestreId: "t2" });
  const result = course.studentResults[0].subjectResults.matematica;
  assert.equal(result.asistencia100, 100);
  assert.equal(result.auto5, 5);
  assert.equal(result.serCriteria.length, 1);
  assert.equal(result.gradedActivities.length, 1);
});

test("la clave de importacion conserva el titulo entero y separa trimestres", () => {
  const first = { ...task, titulo: "Cuestionario de ciencias naturales unidad 1" };
  const second = { ...first, titulo: "Cuestionario de ciencias naturales unidad 2" };
  assert.notEqual(claveActividad(first), claveActividad(second));
  assert.notEqual(claveActividad(first), claveActividad({ ...first, trimestreId: "t3" }));
  assert.equal(claveActividad(first), claveActividad({ ...first, titulo: "  Cuestionario de ciencias naturales unidad 1  " }));
});

test("la fecha escolar conserva el dia boliviano por la noche y al cambiar de mes", () => {
  assert.equal(fechaEscolarIso(new Date("2026-10-01T21:00:00-04:00")), "2026-10-01");
  assert.equal(fechaEscolarIso(new Date("2026-10-02T00:01:00-04:00")), "2026-10-02");
  assert.equal(fechaEscolarIso(new Date("2026-09-30T21:00:00-04:00"), 1), "2026-10-01");
  assert.equal(fechaEscolarIso(new Date("2026-01-01T00:00:00-04:00"), -1), "2025-12-31");
});

test("la autoevaluacion mantiene un identificador unico por curso materia y trimestre", () => {
  assert.equal(idAutoevaluacion("cuarto_a", "matematica", "t2"), "auto_t2_cuarto_a_matematica_autoevaluacion");
  assert.notEqual(idAutoevaluacion("cuarto_a", "matematica", "t2"), idAutoevaluacion("cuarto_a", "matematica", "t3"));
  assert.notEqual(idAutoevaluacion("cuarto_a", "matematica", "t2"), idAutoevaluacion("quinto_a", "matematica", "t2"));
  assert.notEqual(idAutoevaluacion("cuarto_a", "matematica", "t2"), idAutoevaluacion("cuarto_a", "lenguaje", "t2"));
});
