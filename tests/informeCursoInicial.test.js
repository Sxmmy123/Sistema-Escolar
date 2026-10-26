import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { findCourse } from "../src/data/catalog.js";
import { establecerConfiguracion } from "../src/services/rutasFirestore.js";
import { firmaRegistrosInicial, validarEdicionBitacoraInicial } from "../src/services/modeloInicial.js";
import { ResumenesInicial, registrosCategoriaInicial, fichaResumenInicial, agruparRegistrosResumenInicial, materiasSeguimientoInicial } from "../src/modules/docente-inicial/ResumenesInicial.js";
import { recopilarInformesCursoInicial, selectorImpresionInformesInicial, documentoInformesCursoInicial } from "../src/modules/docente-inicial/ImpresionInformesInicial.js";
import { crearDatosInicial } from "../src/modules/docente-inicial/datosInicial.js";

const context = { uid: "docente", gestionId: "2026", courses: [findCourse("inicial")], trimestres: ["t1", "t2", "t3"] };
const student = { id: "a", nombre: "Ana <Prueba>" };
const journal = { id: "docente_bitacora", docenteUid: "docente", cursoId: "inicial", trimestreId: "t1", alumnoId: "a", tipo: "bitacora", materiaId: "", descripcion: "Comparte materiales", createdAt: { seconds: 100 } };
const evidence = ["ser", "saber", "hacer"].map((dimension) => ({ id: dimension, alumnoId: "a", tipo: "actividad", dimension, descripcion: `Registro ${dimension}`, materiaId: "lenguaje", criterio: `Criterio ${dimension}` }));

test("Resumen despliega solo el alumno y categoria elegidos y conserva los registros anteriores", () => {
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: true });
  const records = [...evidence, journal, { ...journal, id: "otro", alumnoId: "b", descripcion: "PRIVADO OTRO ALUMNO" }, { id: "anterior", tipo: "diario", alumnoId: "a", descripcion: "Registro anterior" }];
  const state = { context, courseId: "inicial", termId: "t1", soloContenido: true, route: "/docente/resumenes", summaryStudentId: "a", summaryCategory: "saber", data: { leer: (type) => type === "students" ? [student, { id: "b", nombre: "Bruno" }] : records } };
  assert.deepEqual(registrosCategoriaInicial(records, "a", "ser").map((item) => item.id), ["ser"]);
  assert.deepEqual(registrosCategoriaInicial(records, "a", "bitacora").map((item) => item.id), [journal.id]);
  assert.deepEqual(registrosCategoriaInicial(records, "a", "otros").map((item) => item.id), ["anterior"]);
  const saber = ResumenesInicial(state);
  assert.match(saber, /Registro saber/); assert.doesNotMatch(saber, /Registro hacer|Registro ser|PRIVADO OTRO ALUMNO/);
  assert.equal((saber.match(/aria-expanded="true"/g) || []).length, 1);
  assert.equal((saber.match(/data-initial-summary-student=/g) || []).length, 1);
  assert.equal((saber.match(/data-initial-summary-category=/g) || []).length, 4);
  assert.match(saber, /data-initial-summary-map/); assert.match(saber, /Registros anteriores/);
  for (const category of ["ser", "saber", "hacer", "bitacora"]) assert.match(saber, new RegExp(`data-initial-summary-category="${category}"`));
  state.summaryCategory = "bitacora";
  assert.match(ResumenesInicial(state), /data-initial-edit-journal="docente_bitacora"/);
  state.busy = true; assert.doesNotMatch(ResumenesInicial(state), /data-initial-edit-journal=/);
  state.busy = false; state.context = { ...context, uid: "otro" }; assert.doesNotMatch(ResumenesInicial(state), /data-initial-edit-journal=/);
  state.summaryStudentId = ""; assert.doesNotMatch(ResumenesInicial(state), /initial-summary-categories/);
});

test("Resumen cuenta por categoria y distingue informes vigentes, desactualizados y borradores", () => {
  const records = [...evidence, journal];
  const original = fichaResumenInicial(records, "a");
  assert.deepEqual(original.counts, { ser: 1, saber: 1, hacer: 1, bitacora: 1, otros: 0 });
  assert.equal(original.report.id, "missing");
  const report = { id: "informe", alumnoId: "a", tipo: "informe", descripcion: "Avanza con autonomia.", aprobado: true, fuentesFirma: firmaRegistrosInicial(records, "a") };
  assert.equal(fichaResumenInicial([...records, report], "a").report.id, "approved");
  assert.equal(fichaResumenInicial([...records, { ...report, aprobado: false }], "a").report.id, "draft");
  assert.equal(fichaResumenInicial([...records.filter((item) => item.id !== journal.id), { ...journal, descripcion: "Texto editado" }, report], "a").report.id, "outdated");
  assert.equal(fichaResumenInicial([...records, { ...report, descripcion: "x".repeat(201) }], "a").report.id, "outdated");
  assert.deepEqual(fichaResumenInicial([...records, report], "a").counts, original.counts);
});

test("Resumen busca sin tildes, mantiene orden alfabetico y no introduce controles de generacion", () => {
  const students = [{ id: "b", nombre: "Zulema" }, { id: "a", nombre: "\u00c1lvarez Ana" }];
  const state = { context, courseId: "inicial", termId: "t1", soloContenido: true, route: "/docente/resumenes", summarySearch: "alvarez", data: { leer: (type) => type === "students" ? students : [...evidence, journal] } };
  const html = ResumenesInicial(state);
  assert.match(html, /1 de 2 estudiantes/); assert.match(html, /data-initial-summary-student="a"/); assert.doesNotMatch(html, /data-initial-summary-student="b"/);
  assert.doesNotMatch(html, /initial-metrics|data-initial-action="generate-report"|data-initial-action="print-course-reports"/);
  assert.match(html, /is-ser">SER <b>1/); assert.match(html, /Sin informe/);
  state.summarySearch = "<script>";
  assert.match(ResumenesInicial(state), /No se encontraron alumnos/); assert.doesNotMatch(ResumenesInicial(state), /<script>/);
  state.summarySearch = "";
  const all = ResumenesInicial(state); assert.ok(all.indexOf('data-initial-summary-student="a"') < all.indexOf('data-initial-summary-student="b"'));
});

test("Seguimiento muestra todos los registros en el mapa y permite aislar materia y actividad", () => {
  const records = Array.from({ length: 9 }, (_, index) => ({ ...evidence[0], id: `registro-${index}`, materiaId: index % 2 ? "artes_plasticas" : "lenguaje", actividadId: index % 2 ? "a" : "b", actividadTitulo: index % 2 ? "Muneco de carton" : "Vocales", descripcion: `Detalle-${index}`, createdAt: { seconds: index + 1 } }));
  const grouped = agruparRegistrosResumenInicial(records);
  assert.equal(grouped.length, 2); assert.equal(grouped[0].subject.id, "lenguaje"); assert.equal(grouped[1].records.length, 4);
  const state = { context, courseId: "inicial", termId: "t1", soloContenido: true, route: "/docente/resumenes", summaryStudentId: "a", summaryCategory: "ser", summarySubjectId: "all", data: { leer: (type) => type === "students" ? [student] : records } };
  const page = ResumenesInicial(state);
  assert.equal((page.match(/data-initial-map-record=/g) || []).length, 9);
  assert.match(page, /Detalle-8/); assert.match(page, /Detalle-0/); assert.doesNotMatch(page, /data-initial-summary-more/);
  assert.match(page, /data-initial-summary-subject="lenguaje"/); assert.match(page, /data-initial-summary-subject="artes_plasticas"/);
  state.summarySubjectId = "lenguaje"; const language = ResumenesInicial(state);
  assert.equal((language.match(/data-initial-map-record=/g) || []).length, 5);
  assert.match(language, /Detalle-0/); assert.doesNotMatch(language, /Detalle-1|Muneco de carton/);
  assert.equal((language.match(/<h3>Vocales<\/h3>/g) || []).length, 1);
  state.summarySubjectId = "materia-inexistente"; assert.equal((ResumenesInicial(state).match(/data-initial-map-record=/g) || []).length, 9);
  assert.deepEqual(materiasSeguimientoInicial(records, "a", "ser").map((item) => [item.id, item.count]), [["artes_plasticas", 4], ["lenguaje", 5]]);
});

test("al seleccionar un alumno se recoge la lista y al volver se recuperan todos en orden", () => {
  const pupils = [student, { id: "b", nombre: "Bruno" }, { id: "c", nombre: "Camila" }];
  const state = { context, courseId: "inicial", termId: "t1", soloContenido: true, route: "/docente/resumenes", summaryStudentId: "b", summaryCategory: "ser", summarySearch: "Ana", data: { leer: (type) => type === "students" ? pupils : [...evidence, { ...evidence[0], id: "bruno", alumnoId: "b" }] } };
  const focused = ResumenesInicial(state);
  assert.equal((focused.match(/data-initial-summary-student=/g) || []).length, 1);
  assert.match(focused, /data-initial-summary-student="b"/); assert.doesNotMatch(focused, /data-initial-summary-search|initial-summary-totals/);
  assert.match(focused, /data-initial-map-record="bruno"/); assert.doesNotMatch(focused, /data-initial-map-record="ser"/);
  state.summaryStudentId = ""; state.summarySearch = ""; const restored = ResumenesInicial(state);
  assert.equal((restored.match(/data-initial-summary-student=/g) || []).length, 3); assert.doesNotMatch(restored, /data-initial-summary-map/);
  assert.ok(restored.indexOf('data-initial-summary-student="a"') < restored.indexOf('data-initial-summary-student="b"'));
});

test("Bitacora larga se despliega sin perder texto ni su opcion de editar", () => {
  const long = { ...journal, descripcion: "Observacion extensa sobre el progreso. ".repeat(18) + "<fin>" };
  const state = { context, courseId: "inicial", termId: "t1", soloContenido: true, route: "/docente/resumenes", summaryStudentId: "a", summaryCategory: "bitacora", data: { leer: (type) => type === "students" ? [student] : [long] } };
  const html = ResumenesInicial(state);
  assert.match(html, /<details class="initial-summary-note">/); assert.match(html, /Leer comentario/); assert.match(html, /&lt;fin&gt;/); assert.doesNotMatch(html, /<fin>/);
  assert.match(html, /data-initial-edit-journal="docente_bitacora"/);
});

test("el mapa de Bitacora agrupa por mes y conserva todos los comentarios del alumno", () => {
  const notes = [{ ...journal, id: "febrero", descripcion: "Comentario de febrero", createdAt: { seconds: Date.parse("2026-02-12T12:00:00Z") / 1000 } }, { ...journal, id: "marzo-a", descripcion: "Primer comentario de marzo", createdAt: { seconds: Date.parse("2026-03-10T12:00:00Z") / 1000 } }, { ...journal, id: "marzo-b", descripcion: "Segundo comentario de marzo", createdAt: { seconds: Date.parse("2026-03-15T12:00:00Z") / 1000 } }, { ...journal, id: "ajeno", alumnoId: "b", descripcion: "NO MOSTRAR COMENTARIO AJENO" }];
  const state = { context, courseId: "inicial", termId: "t1", soloContenido: true, route: "/docente/resumenes", summaryStudentId: "a", summaryCategory: "bitacora", data: { leer: (type) => type === "students" ? [student] : notes } };
  const html = ResumenesInicial(state);
  assert.equal((html.match(/data-initial-map-record=/g) || []).length, 3);
  assert.equal((html.match(/class="initial-map-branch"/g) || []).length, 2);
  assert.match(html, /<h3>Febrero<\/h3>/); assert.match(html, /<h3>Marzo<\/h3>/); assert.doesNotMatch(html, /NO MOSTRAR COMENTARIO AJENO/);
  assert.equal((html.match(/data-initial-edit-journal=/g) || []).length, 3);
});

test("un alumno sin observaciones conserva las cuatro categorias y nunca recibe un mapa inventado", () => {
  const state = { context, courseId: "inicial", termId: "t1", soloContenido: true, route: "/docente/resumenes", summaryStudentId: "a", summaryCategory: "ser", data: { leer: (type) => type === "students" ? [student] : [] } };
  const html = ResumenesInicial(state);
  assert.equal((html.match(/data-initial-summary-category=/g) || []).length, 4);
  assert.match(html, /Sin registros en esta categoria/); assert.doesNotMatch(html, /data-initial-summary-map|data-initial-map-record/);
});

test("el mapa horizontal es accesible y sus bordes y conexiones conservan el trazo reforzado", async () => {
  const state = { context, courseId: "inicial", termId: "t1", soloContenido: true, route: "/docente/resumenes", summaryStudentId: "a", summaryCategory: "ser", data: { leer: (type) => type === "students" ? [student] : evidence } };
  const html = ResumenesInicial(state);
  assert.match(html, /data-initial-map-viewport[^>]*tabindex="0" role="region"/);
  assert.match(html, /data-initial-map-pan="-1"/); assert.match(html, /data-initial-map-pan="1"/);
  assert.match(html, /Mapa horizontal de SER/);
  const css = await readFile(new URL("../src/modules/docente-inicial/inicial.css", import.meta.url), "utf8");
  assert.match(css, /\.initial-map-viewport\s*\{[^}]*overflow:auto/);
  assert.match(css, /\.initial-map-root\s*\{[^}]*border:2px/);
  assert.match(css, /\.initial-map-branch-label\s*\{[^}]*border:2px/);
  assert.match(css, /\.initial-map-leaves > \.initial-summary-entry\s*\{[^}]*border:2px/);
  assert.match(css, /\.initial-map-branch::before\s*\{[^}]*height:2px/);
  assert.doesNotMatch(css, /\.initial-map-viewport\s*\{[^}]*(scroll-snap-type|scrollbar-gutter)/);
  assert.doesNotMatch(css, /\.initial-summary-entry:last-child\s*\{[^}]*border-bottom:0/);
  assert.doesNotMatch(css, /\.initial-map-branch\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
});

test("editar Bitacora valida autor, curso, alumno, trimestre, texto y conflictos", () => {
  const input = { ...journal, descripcionAnterior: journal.descripcion, descripcion: "  Avanza con autonomia.  " };
  const valid = validarEdicionBitacoraInicial(context, input, journal);
  assert.equal(valid.descripcion, "Avanza con autonomia."); assert.equal(valid.tipo, "bitacora");
  for (const changed of [null, { ...journal, docenteUid: "otro" }, { ...journal, tipo: "informe" }, { ...journal, cursoId: "preinicial" }, { ...journal, alumnoId: "b" }, { ...journal, trimestreId: "t2" }, { ...journal, descripcion: "Comentario modificado en otra sesion" }]) assert.throws(() => validarEdicionBitacoraInicial(context, input, changed));
  for (const descripcion of [" ", "a".repeat(5001)]) assert.throws(() => validarEdicionBitacoraInicial(context, { ...input, descripcion }, journal));
  assert.throws(() => validarEdicionBitacoraInicial({ ...context, trimestres: ["t2"] }, input, journal));
});

test("editar una observacion actualiza la cache sin duplicarla y un fallo conserva el comentario", async () => {
  const data = crearDatosInicial(context, { listarRegistrosInicial: async () => [journal], editarBitacoraInicial: async (_, input) => {
    if (input.descripcion === "fallar") throw new Error("Sin conexion");
    return { ...journal, descripcion: input.descripcion };
  } });
  await data.cargar("records", "inicial", "t1");
  await data.editarBitacora({ ...journal, descripcion: "Observacion corregida" });
  const rows = data.leer("records", "inicial", "t1");
  assert.equal(rows.length, 1); assert.equal(rows[0].descripcion, "Observacion corregida"); assert.equal(rows[0].createdAt, journal.createdAt);
  await assert.rejects(data.editarBitacora({ ...journal, descripcion: "fallar" }));
  assert.equal(data.leer("records", "inicial", "t1")[0].descripcion, "Observacion corregida");
  data.desmontar(); await assert.rejects(data.editarBitacora(journal), /sesion/);
});

test("la transaccion de edicion cambia solo descripcion y updatedAt, nunca crea un documento", async () => {
  const source = await readFile(new URL("../src/services/registrosInicial.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("export async function editarBitacoraInicial")).replace("export async function", "async function");
  const writes = [];
  const edit = vm.runInNewContext(`${code}; editarBitacoraInicial`, { firestore: {}, auth: {}, comprobarSesion() {}, asegurarRegistroDocente() {}, validarEdicionBitacoraInicial, documentoGestion: (...args) => args, serverTimestamp: () => "servidor", Timestamp: { now: () => "ahora" }, runTransaction: async (_, operation) => operation({ get: async () => ({ exists: () => true, data: () => journal }), update: (reference, payload) => writes.push({ reference, payload }) }) });
  await edit(context, { ...journal, descripcionAnterior: journal.descripcion, descripcion: "Corregido" });
  assert.deepEqual(Object.keys(writes[0].payload), ["descripcion", "updatedAt"]);
  assert.equal(writes[0].payload.descripcion, "Corregido");
  await assert.rejects(edit(context, { ...journal, id: "otro_registro", descripcionAnterior: journal.descripcion, descripcion: "No" }));
  assert.equal(writes.length, 1);
});

function reportsFixture() {
  const byTerm = {};
  for (const id of ["t1", "t2", "t3"]) {
    const rows = [{ ...journal, id: `journal-${id}`, trimestreId: id }];
    rows.push({ id: `report-${id}`, tipo: "informe", alumnoId: "a", aprobado: true, descripcion: `Progreso ${id}`, fuentesFirma: firmaRegistrosInicial(rows, "a") });
    byTerm[id] = rows;
  }
  return byTerm;
}

test("la impresion reune tres trimestres aprobados y omite borradores o informes desactualizados", () => {
  const byTerm = reportsFixture();
  const rows = recopilarInformesCursoInicial([{ id: "b", nombre: "Bruno" }, student], byTerm);
  assert.equal(rows[0].student.id, "a"); assert.deepEqual(rows[0].informes, { t1: "Progreso t1", t2: "Progreso t2", t3: "Progreso t3" });
  assert.deepEqual(rows[1].informes, { t1: "", t2: "", t3: "" });
  byTerm.t2[1].aprobado = false; byTerm.t3[0].descripcion = "Texto corregido despues de aprobar";
  const changed = recopilarInformesCursoInicial([student], byTerm)[0];
  assert.deepEqual(changed.informes, { t1: "Progreso t1", t2: "", t3: "" });
  assert.notEqual(firmaRegistrosInicial(byTerm.t3, "a"), byTerm.t3[1].fuentesFirma);
});

test("la seleccion de impresion inicia con todos los alumnos y el documento tiene tres recuadros", () => {
  const rows = recopilarInformesCursoInicial([student, { id: "b", nombre: "Bruno" }], reportsFixture());
  const selector = selectorImpresionInformesInicial(rows);
  assert.equal((selector.match(/ checked/g) || []).length, rows.length + 1);
  assert.match(selector, /2\/2 seleccionados/); assert.match(selector, /data-initial-print-all/);
  const document = documentoInformesCursoInicial({ rows: [rows[0]], course: context.courses[0], year: "2026", teacher: "Docente <prueba>" });
  assert.match(document, /size:letter portrait/); assert.match(document, /1er trimestre/); assert.match(document, /2do trimestre/); assert.match(document, /3er trimestre/);
  assert.match(document, /Ana &lt;Prueba&gt;/); assert.match(document, /Docente &lt;prueba&gt;/); assert.doesNotMatch(document, /Bruno|Comparte materiales/);
  assert.match(document, /Progreso t1/); assert.match(document, /Progreso t2/); assert.match(document, /Progreso t3/);
  assert.throws(() => documentoInformesCursoInicial({ rows: [], course: context.courses[0] }));
  assert.throws(() => documentoInformesCursoInicial({ rows: [{ student, informes: { t1: "x".repeat(201) } }], course: context.courses[0] }));
});

test("la impresion usa carta vertical, justifica los informes y reserva margenes sin fecha ni hora", () => {
  const text = "Comparte materiales y respeta turnos. Reconoce colores y figuras; recorta con autonomia y requiere apoyo para relacionar cantidades. Participa con interes y expresa sus ideas con seguridad.".padEnd(200, " ");
  assert.equal(text.length, 200);
  const document = documentoInformesCursoInicial({ rows: [{ student, informes: { t1: text, t2: "", t3: "" } }], course: findCourse("preinicial"), year: "2026", teacher: "Docente de prueba" });
  assert.match(document, /@page\{size:letter portrait;margin:0 20mm\}/);
  assert.match(document, /\.report-value\{[^}]*text-align:justify;[^}]*text-align-last:left/);
  assert.match(document, /thead\{display:table-header-group\}/);
  assert.match(document, /tfoot\{display:table-footer-group\}/);
  assert.match(document, /thead \.report-heading\{[^}]*padding:20mm/);
  assert.match(document, /tfoot td\{height:20mm/);
  assert.match(document, /@media screen\{body\{width:215\.9mm;padding:0 20mm/);
  assert.match(document, /U\.E\. Ecologica Nueva Bolivia/);
  assert.match(document, /Informe trimestral cualitativo/);
  assert.match(document, /Educacion Inicial en Familia Comunitaria/);
  assert.match(document, /Curso: Preinicial/); assert.match(document, /Gestion: 2026/);
  assert.ok(document.includes(`<td class="report-value">${text}</td>`));
  assert.doesNotMatch(document, /Fecha:|Hora:|<time\b|new Date|letter landscape/);
});

test("los nombres impresos ocupan una linea por palabra y dan mas ancho a cada trimestre", () => {
  const document = documentoInformesCursoInicial({ rows: [{ student: { id: "a", nombre: "DANIEL   FLORES\nVARGAS" }, informes: { t1: "Reconoce colores y comparte materiales." } }, { student: { id: "b", nombre: "ANA <Prueba>" }, informes: {} }], course: context.courses[0], year: "2026", teacher: "Docente" });
  assert.match(document, /<span>DANIEL<\/span><span>FLORES<\/span><span>VARGAS<\/span>/);
  assert.match(document, /<span>ANA<\/span><span>&lt;Prueba&gt;<\/span>/);
  assert.doesNotMatch(document, /<Prueba>/);
  assert.match(document, /class="report-student" aria-label="DANIEL/);
  assert.match(document, /\.report-student span\{display:block\}/);
  assert.match(document, /col\.number\{width:4%\}col\.student\{width:15%\}col\.term\{width:27%\}/);
  assert.equal((document.match(/<td class="report-value/g) || []).length, 6);
  assert.match(document, /Reconoce colores y comparte materiales\./);
});
