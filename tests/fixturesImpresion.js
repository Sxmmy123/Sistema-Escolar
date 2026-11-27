import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { formatoCarta } from "../src/ui/impresion.js";
import { COURSES, SUBJECTS } from "../src/data/catalog.js";
import { documentoInformesCursoInicial } from "../src/modules/docente-inicial/ImpresionInformesInicial.js";
import { gradeByActivityAndStudent, studentActivityGrade, isSaberActivity, isMaterialActivity } from "../src/services/calculoAcademico.js";
import { e as escapeHtml } from "../src/modules/docente-inicial/ComponentesInicial.js";

const trimesterIds = ["t1", "t2", "t3"];
const terms = trimesterIds.map((id, index) => ({ id, label: `${["1er", "2do", "3er"][index]} trimestre` }));

export async function documentosImpresionPrueba({ cantidad = 40, trimestres = trimesterIds, nombres = [], notasPorTrimestre = {}, registro = {}, ubicacion = "http://localhost/", baseUrl = "/" } = {}) {
  const students = Array.from({ length: cantidad }, (_, index) => ({ id: `alumno_${index + 1}`, nombre: nombres[index] || `ESTUDIANTE ${String(index + 1).padStart(2, "0")} FLORES VARGAS` }));
  const course = COURSES.find((item) => item.id === "cuarto_a");
  const subject = SUBJECTS.find((item) => item.id === "matematica");
  const payload = { course, students, teacherName: "Docente de prueba", trimesterLabel: "1er trimestre", activities: [], gradesList: [], attendanceRows: [] };
  const documents = {};
  const location = new URL(ubicacion);
  const window = { location: { origin: location.origin, href: location.href }, open: () => ({ document: { open() {}, write(value) { documents.current = value; }, close() {} }, addEventListener() {} }) };
  const context = {
    formatoCarta, window, URL, SUBJECTS, TRIMESTERS: terms, gestionActual: () => "2026", icon: () => "", escapeHtml,
    gradeByActivityAndStudent, isMaterialActivity, isSaberActivity,
    activityHasGrades: () => true, studentActivityGrade,
    calculateStudentTerm: (student, activities) => ({ final: notasPorTrimestre[activities[0]?.id?.split("_")[0]] ?? (student.id === "alumno_1" ? 100 : student.id === "alumno_2" ? 48 : 79) }),
    attendanceShort: (value) => ({ presente: "P", falta: "F", atraso: "A", permiso: "L" })[value],
    normalizarEstadoAsistencia: (value) => value, alert(message) { throw new Error(message); }
  };
  async function getFunction(path, name) {
    const source = (await readFile(new URL(`../src/modules/${path}`, import.meta.url), "utf8"))
      .replace(/^\uFEFF/, "").replace(/^import[\s\S]*?;\r?\n/gm, "")
      .replace(/\bexport (?=(?:async )?function)/g, "").replace(/import\.meta\.env(?:\?)?\.BASE_URL/g, JSON.stringify(baseUrl));
    return vm.runInNewContext(`${source}; ${name}`, { ...context });
  }
  const printNotes = await getFunction("docente/imprimirNotasDocente.js", "printDocument");
  printNotes({ ...payload, ...registro, calculateStudentTerm: () => ({ asistencia100: 100, puntualidad100: 100, responsabilidad100: 100, ser100: 100, ser10: 10, saber100: 75, saber45: 34, hacer100: 75, hacer40: 30, auto5: 5, final: 79, ...registro.values }) }, registro.subjects || [subject]);
  documents.notas = documents.current;
  const printBulletin = await getFunction("docente/imprimirBoletinDocente.js", "printDocument");
  printBulletin({ ...payload, snapshotsByTerm: Object.fromEntries(trimestres.map((id) => [id, {
    activities: SUBJECTS.map((item) => ({ id: `${id}_${item.id}`, materiaId: item.id, tipo: "examen" })), gradesList: [], attendanceRows: []
  }])) }, trimestres);
  documents.boletin = documents.current;
  const printAttendance = await getFunction("docente/exportResumenAsistencia.js", "printAttendanceSummaryByMonth");
  const dates = Array.from({ length: 23 }, (_, index) => `2026-03-${String(index + 1).padStart(2, "0")}`);
  printAttendance({ ...payload, records: dates.flatMap((fecha) => students.map((student) => ({ fecha, alumnoId: student.id, estado: "presente" }))) });
  documents.asistencia = documents.current;
  const printMaterials = await getFunction("alumno/MaterialesAlumno.js", "printStudentMaterials");
  printMaterials({ ...payload, activity: { fecha: dates[0], materiales: [{ cantidad: 2, material: "Cartulinas de colores" }, { cantidad: 1, material: "Caja de lapices de colores" }] }, student: students[0], subject: subject.nombre });
  documents.materiales = documents.current;
  const description = "Comparte materiales y respeta turnos. Reconoce colores y figuras; recorta con autonomia y requiere apoyo para relacionar cantidades. Participa con interes y expresa sus ideas con seguridad.".padEnd(200, " ");
  documents.informes = documentoInformesCursoInicial({ rows: students.map((student) => ({ student, informes: Object.fromEntries(trimesterIds.map((id) => [id, description])) })), course: { nombre: "Preinicial" }, year: "2026", teacher: payload.teacherName });
  delete documents.current;
  return documents;
}
