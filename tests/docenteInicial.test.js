import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { findCourse, findSubject, periodsForCourse } from "../src/data/catalog.js";
import { PanelInicial } from "../src/modules/docente-inicial/PanelInicial.js";
import { AsistenciaInicial, guiaAsistenciaInicial } from "../src/modules/docente-inicial/AsistenciaInicial.js";
import { crearAccionesAsistenciaInicial } from "../src/modules/docente-inicial/AccionesAsistenciaInicial.js";
import { crearAccionesActividades } from "../src/modules/docente-inicial/AccionesActividadesInicial.js";
import { animarCambioAlumnoInicial, medirSeleccionAlumnoInicial } from "../src/modules/docente-inicial/AnimacionAlumnoInicial.js";
import { animarSelectorAlumnosInicial } from "../src/modules/docente-inicial/AnimacionSelectorAlumnoInicial.js";
import { animarSeleccionResumenInicial, aspirarAlumnoSeguimiento } from "../src/modules/docente-inicial/AnimacionResumenInicial.js";
import { crearNavegacionMapaInicial } from "../src/modules/docente-inicial/NavegacionMapaInicial.js";
import { ActividadesInicial } from "../src/modules/docente-inicial/ActividadesInicial.js";
import { RegistroInicial } from "../src/modules/docente-inicial/RegistroInicial.js";
import { BitacoraInicial } from "../src/modules/docente-inicial/BitacoraInicial.js";
import { InformeInicial, estadoInformeInicial, conteoFuentesInformeInicial, barrasFuentesInformeInicial } from "../src/modules/docente-inicial/InformeInicial.js";
import { alumnoInicial, historialInicial, selectorAlumnoInicial, cuadriculaAlumnosInicial } from "../src/modules/docente-inicial/SeguimientoInicial.js";
import { HorarioInicial } from "../src/modules/docente-inicial/HorarioInicial.js";
import { ResumenesInicial, listaResumenInicial, materiasSeguimientoInicial } from "../src/modules/docente-inicial/ResumenesInicial.js";
import { recopilarInformesCursoInicial, selectorImpresionInformesInicial } from "../src/modules/docente-inicial/ImpresionInformesInicial.js";
import { icon } from "../src/ui/dom.js";
import { crearDatosInicial } from "../src/modules/docente-inicial/datosInicial.js";
import { claveRegistroInicial, cursoInicial, escaparInicial, idRegistroInicial, inicioSemanaInicial, navegacionInicial, observacionesDiarias, resumirAsistenciaInicial, trimestresInicial, validarRegistroInicial } from "../src/services/modeloInicial.js";
import { rutaGestion, establecerConfiguracion } from "../src/services/rutasFirestore.js";
import { exigirTrimestreDocente, puedeRegistrarTrimestre, trimestresDeAsignacion } from "../src/services/relevoDocente.js";
import { criteriosInicial, dimensionesInicial, valoracionesInicial, materiasInicial, firmaRegistrosInicial, validarSeguimientoInicial } from "../src/services/modeloInicial.js";
import { generarConGemini, validarAccesoInforme, fuentesParaGemini, validarTextoInforme } from "../functions/informe-core.js";
import { geminiDevPlugin } from "../functions/dev-gemini.js";

const context = { uid: "docente-inicial", gestionId: "2026", courses: [findCourse("inicial"), findCourse("preinicial")] };
const daily = { cursoId: "inicial", trimestreId: "t1", tipo: "diario", fecha: "2026-03-10", alumnoId: "alumno-a", estado: "apoyo", descripcion: " Completo la actividad con ayuda. " };
const observation = { cursoId: "inicial", trimestreId: "t1", alumnoId: "alumno-a", tipo: "observacion", materiaId: "artes_plasticas", dimension: "ser", criterio: "Comparte sus materiales", valoracion: "logrado", descripcion: "Es amable con sus companeros." };

test("SER SABER HACER guardan valoraciones sin fecha manual y sin puntaje", () => {
  const result = validarSeguimientoInicial(context, { ...observation, fecha: "2026-03-01", puntaje: 100 });
  assert.equal(result.fecha, undefined);
  assert.equal(result.puntaje, undefined);
  assert.equal(result.materiaId, "artes_plasticas");
  for (const change of [{ cursoId: "cuarto_a" }, { trimestreId: "t4" }, { alumnoId: "" }, { dimension: "ser2" }, { materiaId: "inventada" }, { valoracion: "100" }, { criterio: "" }, { criterio: "a".repeat(201) }, { descripcion: "a".repeat(1001) }]) assert.throws(() => validarSeguimientoInicial(context, { ...observation, ...change }));
  assert.ok(criteriosInicial("saber", "lenguaje").includes("Identifica las vocales"));
  assert.ok(criteriosInicial("hacer", "artes_plasticas").includes("Recorta con tijera"));
});
test("bitacora admite comentarios largos y el informe nunca supera 200 caracteres", () => {
  assert.equal(validarSeguimientoInicial(context, { ...observation, tipo: "bitacora", materiaId: "", descripcion: "a".repeat(5000) }).descripcion.length, 5000);
  assert.throws(() => validarSeguimientoInicial(context, { ...observation, tipo: "bitacora", descripcion: "a".repeat(5001) }));
  const report = { ...observation, tipo: "informe", descripcion: "a".repeat(200), aprobado: false, origen: "docente", fuentesFirma: "1-abcd" };
  assert.equal(validarSeguimientoInicial(context, report).descripcion.length, 200);
  for (const change of [{ descripcion: "a".repeat(201) }, { descripcion: " " }, { aprobado: "si" }, { origen: "otro" }, { fuentesFirma: "" }]) assert.throws(() => validarSeguimientoInicial(context, { ...report, ...change }));
});
test("la firma de fuentes separa alumnos, detecta cambios y no depende del orden", () => {
  const records = [{ ...observation, id: "a" }, { ...observation, id: "b", tipo: "bitacora", descripcion: "Necesita apoyo al recortar." }, { ...observation, id: "c", alumnoId: "otro" }];
  assert.equal(firmaRegistrosInicial(records, "alumno-a"), firmaRegistrosInicial([...records].reverse(), "alumno-a"));
  assert.notEqual(firmaRegistrosInicial(records, "alumno-a"), firmaRegistrosInicial([...records, { ...observation, id: "nuevo" }], "alumno-a"));
  assert.equal(firmaRegistrosInicial(records, "alumno-a"), firmaRegistrosInicial([...records, { id: "informe", tipo: "informe", alumnoId: "alumno-a" }], "alumno-a"));
});
test("Gemini recibe todas las observaciones sin la ficha ni identificadores y no aprueba informes", async () => {
  let sent;
  const records = [{ ...observation, id: "interno", ci: "CI-PRIVADO", alumnoId: "ID-PRIVADO", nombre: "NOMBRE-PRIVADO" }, { ...observation, tipo: "bitacora", descripcion: "Requiere apoyo en motricidad fina." }];
  const result = await generarConGemini({ records, apiKey: "clave-de-prueba", model: "modelo-de-prueba", fetcher: async (_, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ texto: "Comparte sus materiales y participa con entusiasmo. Necesita apoyo en motricidad fina." }) }] } }] }) }; } });
  assert.ok(result.texto.length <= 200);
  assert.equal(result.aprobado, undefined);
  assert.match(sent.contents[0].parts[0].text, /motricidad fina/);
  assert.match(sent.contents[0].parts[0].text, /Comparte sus materiales/);
  assert.doesNotMatch(JSON.stringify(sent), /CI-PRIVADO|ID-PRIVADO|NOMBRE-PRIVADO/);
  assert.match(sent.systemInstruction.parts[0].text, /no confiables/);
  assert.match(sent.systemInstruction.parts[0].text, /tercera persona del presente y sujeto omitido/);
  assert.match(sent.systemInstruction.parts[0].text, /No comiences con El estudiante/);
  assert.match(sent.systemInstruction.parts[0].text, /No escribas consejos futuros/);
  assert.match(sent.systemInstruction.parts[0].text, /no copies capacidades de un modelo de informe/);
  assert.match(sent.systemInstruction.parts[0].text, /ausencia de registros no significa/);
  assert.throws(() => fuentesParaGemini([]));
});
test("Gemini recibe la fecha interna para interpretar avances sin pedir una fecha manual", () => {
  const rows = JSON.parse(fuentesParaGemini([
    { ...observation, createdAt: { seconds: 1772445600 } },
    { ...observation, tipo: "bitacora", createdAt: { toMillis: () => 1775037600000 } },
    { ...daily }
  ]));
  assert.equal(rows[0].fecha, new Date(1772445600000).toISOString());
  assert.equal(rows[1].fecha, new Date(1775037600000).toISOString());
  assert.equal(rows[2].fecha, daily.fecha);
  assert.equal(rows[0].alumnoId, undefined);
});
test("Gemini reintenta un texto largo sin recortarlo y rechaza respuestas vacias o bloqueadas", async () => {
  let attempts = 0;
  const result = await generarConGemini({ records: [observation], apiKey: "prueba", model: "modelo", fetcher: async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ texto: ++attempts === 1 ? "a".repeat(201) : "Avanza con apoyo y participa de manera respetuosa." }) }] } }] }) }) });
  assert.equal(attempts, 2);
  assert.ok(result.texto.length < 200);
  await assert.rejects(generarConGemini({ records: [observation], apiKey: "prueba", model: "modelo", fetcher: async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: "SAFETY" }] }) }) }), /completo/);
  await assert.rejects(generarConGemini({ records: [observation], apiKey: "prueba", model: "modelo", fetcher: async () => ({ ok: false, status: 429 }) }), /limite/);
  assert.throws(() => validarTextoInforme("a".repeat(201)));
});
test("el servidor valida identidad, modalidad, matricula, gestion y trimestre antes de consultar Gemini", () => {
  const args = { uid: "docente", profile: { rol: "docente", activo: true }, config: { versionModelo: 2, gestionHabilitada: true, gestionActivaId: "2026" }, assignment: { cursos: { inicial: { materias: [] } }, trimestres: ["t2"] }, enrollment: { cursoId: "inicial", estado: "activo" }, input: { gestionId: "2026", cursoId: "inicial", trimestreId: "t2", alumnoId: "a" }, year: "2026" };
  validarAccesoInforme(args);
  for (const change of [{ uid: "" }, { profile: { rol: "alumno", activo: true } }, { profile: { rol: "docente", activo: false } }, { year: "2027" }, { enrollment: { cursoId: "inicial", estado: "retirado" } }, { enrollment: { cursoId: "preinicial", estado: "activo" } }, { assignment: { cursos: { inicial: {}, cuarto_a: {} } } }, { input: { ...args.input, trimestreId: "t1" } }]) assert.throws(() => validarAccesoInforme({ ...args, ...change }));
});
test("la API local autentica, conserva las reglas, valida el documento anual y envia solo al alumno elegido", async () => {
  let handler, prompt = "";
  const plugin = geminiDevPlugin({ GEMINI_API_KEY: "secreto-de-prueba", GEMINI_MODEL: "modelo" }, { apiKey: "publica", projectId: "demo-test" });
  plugin.configureServer({ middlewares: { use: (_, callback) => { handler = callback; } } });
  const encode = (value) => typeof value === "string" ? { stringValue: value } : typeof value === "boolean" ? { booleanValue: value } : typeof value === "number" ? { integerValue: String(value) } : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } } : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  const document = (data) => ({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)])) });
  const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/La_Paz" }).format(new Date());
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    let data;
    if (url.includes("accounts:lookup")) data = { users: [{ localId: "docente" }] };
    else if (url.endsWith("usuarios/docente")) data = document({ rol: "docente", activo: true });
    else if (url.endsWith("configuracion/sistema")) data = document({ versionModelo: 2, gestionActivaId: year });
    else if (url.endsWith(`gestiones/${year}`)) data = document({ ano: Number(year) });
    else if (url.includes("asignaciones/")) data = document({ cursos: { inicial: { materias: [] } } });
    else if (url.includes("matriculas/")) data = document({ cursoId: "inicial", estado: "activo" });
    else if (url.includes(":runQuery")) data = [{ document: { name: "docs/uno", ...document({ ...observation, alumnoId: "a" }) } }, { document: { name: "docs/dos", ...document({ ...observation, alumnoId: "b", descripcion: "NO ENVIAR OTRO ALUMNO" }) } }];
    else if (url.includes("generativelanguage.googleapis.com")) { prompt = options.body; data = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"texto":"Comparte sus materiales y participa con respeto."}' }] } }] }; }
    else assert.fail(`Solicitud inesperada: ${url}`);
    return { ok: true, json: async () => data };
  };
  const call = (token = "Bearer token-de-prueba") => new Promise((resolve) => {
    const input = { gestionId: year, cursoId: "inicial", trimestreId: "t1", alumnoId: "a" };
    const request = { method: "POST", headers: { authorization: token, origin: "http://127.0.0.1:5192", host: "127.0.0.1:5192" }, socket: { remoteAddress: "127.0.0.1" }, async *[Symbol.asyncIterator]() { yield JSON.stringify(input); } };
    const response = { statusCode: 200, setHeader() {}, end(body) { resolve({ status: this.statusCode, data: JSON.parse(body) }); } };
    handler(request, response);
  });
  try {
    assert.equal((await call("")).status, 401);
    const result = await call();
    assert.equal(result.status, 200);
    assert.ok(result.data.texto.length <= 200);
    assert.match(prompt, /Comparte sus materiales/);
    assert.doesNotMatch(prompt, /NO ENVIAR OTRO ALUMNO/);
    assert.equal((await call()).status, 429);
  } finally { globalThis.fetch = originalFetch; }
});
test("el informe genera, limita a 200 caracteres y separa la impresion del curso", () => {
  const state = visualState("/docente/informe");
  const records = [{ ...observation, id: "a", alumnoId: "a" }];
  const signature = firmaRegistrosInicial(records, "a");
  records.push({ id: "informe", tipo: "informe", alumnoId: "a", descripcion: "Comparte sus materiales.", origen: "docente", aprobado: true, fuentesFirma: signature });
  const original = state.data.leer;
  state.data.leer = (type, ...args) => type === "records" ? records : original(type, ...args);
  const draft = { descripcion: "Comparte sus materiales.", origen: "docente", fuentesFirma: signature };
  state.reportDraft = () => draft;
  assert.equal(estadoInformeInicial(state).printable, true);
  assert.match(InformeInicial(state), /maxlength="200"/);
  assert.match(InformeInicial(state), /\/200 caracteres/);
  assert.doesNotMatch(InformeInicial(state), /data-initial-action="load"/);
  assert.match(InformeInicial(state), /data-initial-action="print-course-reports"/);
  assert.match(InformeInicial(state), /Aprobar y guardar/);
  assert.doesNotMatch(InformeInicial(state), /data-initial-action="print-report"|data-initial-action="save-report"|initial-report-sources/);
  draft.descripcion = "Cambio pendiente";
  assert.equal(estadoInformeInicial(state).printable, false);
  draft.descripcion = "Comparte sus materiales.";
  records.push({ ...observation, id: "nuevo", alumnoId: "a" });
  assert.equal(estadoInformeInicial(state).printable, false);
});

test("las barras de Informe representan exactamente 3 SER, 8 SABER, 10 HACER y 2 Bitacora", () => {
  const sources = Object.entries({ ser: 3, saber: 8, hacer: 10, bitacora: 2 }).flatMap(([category, count]) => Array.from({ length: count }, (_, index) => ({ id: `${category}-${index}`, alumnoId: "a", tipo: category === "bitacora" ? "bitacora" : "actividad", dimension: category, descripcion: "Evidencia registrada", valoracion: "logrado" })));
  const counts = conteoFuentesInformeInicial(sources);
  assert.equal(counts.total, 23); assert.equal(counts.excluded, 0);
  assert.deepEqual(counts.groups.map((group) => [group.id, group.records.length]), [["ser", 3], ["saber", 8], ["hacer", 10], ["bitacora", 2]]);
  const html = barrasFuentesInformeInicial(sources);
  assert.equal((html.match(/class="initial-report-evidence-segment"/g) || []).length, 23);
  for (const [label, count] of [["SER", 3], ["SABER", 8], ["HACER", 10], ["Bitacora", 2]]) assert.match(html, new RegExp(`aria-label="${label}: ${count} registros"`));
  assert.doesNotMatch(html, /progressbar|%|puntaje/);
});

test("las cantidades de Informe cambian con el alumno y trimestre y nunca cuentan el propio informe", () => {
  const state = visualState("/docente/informe"); state.termId = "t1"; state.studentId = "a";
  const records = [{ id: "ser-a", alumnoId: "a", tipo: "actividad", dimension: "ser" }, { id: "nota-b", alumnoId: "b", tipo: "bitacora", descripcion: "Otro alumno" }, { id: "report-a", alumnoId: "a", tipo: "informe", descripcion: "Informe existente" }];
  state.data.leer = (type, _, term) => type === "students" ? [{ id: "a", nombre: "Ana" }, { id: "b", nombre: "Bruno" }] : term === "t1" ? records : [];
  let html = InformeInicial(state);
  assert.match(html, /aria-label="SER: 1 registro"/); assert.match(html, /aria-label="Bitacora: 0 registros"/);
  assert.equal((html.match(/class="initial-report-evidence-segment"/g) || []).length, 1);
  state.studentId = "b"; html = InformeInicial(state);
  assert.match(html, /aria-label="SER: 0 registros"/); assert.match(html, /aria-label="Bitacora: 1 registro"/);
  state.termId = "t2"; html = InformeInicial(state);
  assert.equal((html.match(/class="initial-report-evidence-segment"/g) || []).length, 0);
  assert.equal((html.match(/is-empty" role="img"/g) || []).length, 4);
});

test("las barras usan las mismas evidencias que Gemini e incluyen fuentes anteriores sin confundir Sin observar", () => {
  const sources = [{ id: "no-observado", tipo: "actividad", dimension: "ser", valoracion: "no_observado", descripcion: "  " }, { id: "comentado", tipo: "actividad", dimension: "saber", valoracion: "no_observado", descripcion: "Reconoce las vocales con ayuda." }, { id: "semanal", tipo: "semanal", descripcion: "Observacion de bitacora anterior" }, { id: "diario", tipo: "diario", descripcion: "Registro anterior" }];
  const counts = conteoFuentesInformeInicial(sources);
  assert.equal(counts.total, JSON.parse(fuentesParaGemini(sources)).length); assert.equal(counts.total, 3); assert.equal(counts.excluded, 1);
  assert.deepEqual(counts.groups.map((group) => [group.id, group.records.length]), [["ser", 0], ["saber", 1], ["hacer", 0], ["bitacora", 1], ["anteriores", 1]]);
  assert.match(barrasFuentesInformeInicial(sources), /1 sin evidencia/);
  assert.equal(conteoFuentesInformeInicial([...sources, { tipo: "informe", descripcion: "No es fuente" }]).total, 3);
  const state = visualState("/docente/informe"), read = state.data.leer;
  state.iaAvailable = true; state.data.leer = (type, ...args) => type === "records" ? [{ ...sources[0], alumnoId: "a" }] : read(type, ...args);
  assert.match(InformeInicial(state).match(/<button[^>]*data-initial-action="generate-report"[^>]*>/)[0], /disabled/);
});

test("las barras de Informe no recortan cantidades grandes ni inventan segmentos vacios", () => {
  const sources = Array.from({ length: 240 }, (_, index) => ({ id: `ser-${index}`, tipo: "observacion", dimension: "ser", valoracion: "logrado" }));
  const html = barrasFuentesInformeInicial(sources);
  assert.equal((html.match(/class="initial-report-evidence-segment"/g) || []).length, 240);
  assert.match(html, /aria-label="SER: 240 registros"/);
  assert.equal((barrasFuentesInformeInicial([]).match(/class="initial-report-evidence-segment"/g) || []).length, 0);
});

function visualState(route) {
  const schedule = { periodos: periodsForCourse("inicial"), clases: { p1: { lunes: "matematica", martes: "lenguaje", miercoles: "ciencias_naturales", jueves: "educacion_fisica", viernes: "religion" } } };
  return { context, courseId: "inicial", termId: "t2", route, date: "2026-03-09", subjectId: "lenguaje", dimension: "ser", soloContenido: true, observationDraft: () => ({ entries: {} }), noteDraft: () => ({ descripcion: "" }), reportDraft: () => ({ descripcion: "", origen: "docente", fuentesFirma: firmaRegistrosInicial([], "a") }), drafts: () => ({}), data: { leer: (type) => type === "schedule" ? schedule : type === "students" ? [{ id: "a", nombre: "Estudiante de prueba" }] : type === "attendance" ? {} : [] } };
}

test("Informe usa un nombre compacto que abre la cuadricula alfabetica completa", async () => {
  const state = visualState("/docente/informe"), read = state.data.leer;
  const pupils = [{ id: "z", nombre: "Zulema de prueba" }, { id: "a", nombre: "Ana <prueba>" }, { id: "b", nombre: "Bruno de prueba" }];
  state.data.leer = (type, ...args) => type === "students" ? pupils : read(type, ...args);
  state.studentId = "b";
  const html = InformeInicial(state), selector = selectorAlumnoInicial(state), grid = cuadriculaAlumnosInicial(state);
  assert.match(html, /data-initial-action="select-student"/);
  assert.doesNotMatch(html, /data-initial-student|<select/);
  assert.match(selector, /Bruno de prueba/); assert.doesNotMatch(selector, /Zulema|Ana/);
  assert.match(selector, /aria-haspopup="dialog"/);
  assert.equal((grid.match(/data-initial-picker-student=/g) || []).length, pupils.length);
  assert.ok(grid.indexOf("Ana &lt;prueba&gt;") < grid.indexOf("Bruno de prueba") && grid.indexOf("Bruno de prueba") < grid.indexOf("Zulema de prueba"));
  assert.match(grid, /data-initial-picker-student="b" aria-pressed="true"/);
  assert.equal((grid.match(/aria-pressed="true"/g) || []).length, 1);
  state.busy = true; assert.match(selectorAlumnoInicial(state), /disabled/);
  const css = await readFile(new URL("../src/modules/docente-inicial/inicial.css", import.meta.url), "utf8");
  assert.match(css, /\.initial-report-student-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/);
});

test("Bitacora e Informe comparten selector compacto sin desplegable antiguo", () => {
  const state = visualState("/docente/bitacora"), selector = selectorAlumnoInicial(state);
  const journal = BitacoraInicial(state), report = InformeInicial(state);
  assert.ok(journal.includes(selector)); assert.ok(report.includes(selector));
  assert.doesNotMatch(journal, /<select|data-initial-student/);
  assert.match(journal, /data-initial-action="select-student"/);
  assert.match(journal, /data-initial-journal-note/);
  assert.match(journal, /Observaciones del estudiante/);
});

function attendanceFixture() {
  const notes = new Map(), records = {}, writes = [], jobs = [], modals = [];
  let fail = false, permitted = true, current = true;
  const state = { ...visualState("/docente/asistencia"), attendanceMode: "lista", attendanceStudentId: "a", attendanceGuidedIndex: 0,
    attendanceNote(id) { if (!notes.has(id)) notes.set(id, { observacion: records[id]?.observacion || "" }); return notes.get(id); }
  };
  const pupils = [{ id: "b", nombre: "Bruno" }, { id: "a", nombre: "Ana" }];
  const data = { leer: (type) => type === "students" ? pupils : records, async guardarAsistencia(...args) {
    writes.push(args); if (fail) throw new Error("Sin conexion"); records[args[1].id] = { estado: args[4], observacion: args[5] };
  } };
  state.data = data;
  const actions = crearAccionesAsistenciaInicial({ state, data, draw() {}, dialog: (...args) => modals.push(args), assertWritable: () => { if (!permitted) throw new Error("Sin permiso"); }, run: (operation) => {
    if (state.busy) return; state.busy = true;
    jobs.push(operation(() => current).catch((error) => { state.error = true; state.message = error.message; }).finally(() => { state.busy = false; }));
  } });
  const click = (dataset = {}, attribute = "") => actions.click({ dataset, hasAttribute: (name) => name === attribute });
  return { state, actions, click, writes, records, modals, settle: () => Promise.all(jobs), fail: (value) => { fail = value; }, permitted: (value) => { permitted = value; }, current: (value) => { current = value; } };
}
test("Asistencia Inicial usa lista desplegable y guia como Primaria sin guardado por lotes", () => {
  const fixture = attendanceFixture(), html = AsistenciaInicial(fixture.state);
  assert.match(html, /data-initial-attendance-mode="lista"/); assert.match(html, /data-initial-attendance-mode="guia"/);
  assert.match(html, /initial-attendance-list/); assert.ok(html.indexOf(">Ana<") < html.indexOf(">Bruno<"));
  assert.equal((html.match(/data-initial-attendance="/g) || []).length, 4);
  assert.match(html, /Sin registrar: 2/); assert.doesNotMatch(html, /<table|save-attendance|Restantes presentes|Por guardar/);
  const saved = attendanceFixture(); saved.records.a = { estado: "permiso", observacion: "Permiso familiar" };
  assert.match(AsistenciaInicial(saved.state), /Permiso: 1/);
  assert.match(AsistenciaInicial(saved.state), /value="Permiso familiar"/);
});
test("pulsar de nuevo al alumno retrae su asistencia sin perder la observacion ni guardar", () => {
  const fixture = attendanceFixture();
  fixture.actions.input({ dataset: { initialAttendanceNote: "a" }, value: "Observacion pendiente" });
  fixture.click({ initialAttendanceOpen: "a" });
  assert.equal(fixture.state.attendanceStudentId, "");
  assert.doesNotMatch(AsistenciaInicial(fixture.state), /aria-expanded="true"|class="initial-attendance-editor"/);
  fixture.click({ initialAttendanceOpen: "a" });
  assert.equal(fixture.state.attendanceStudentId, "a");
  assert.match(AsistenciaInicial(fixture.state), /value="Observacion pendiente"/);
  assert.doesNotMatch(AsistenciaInicial(fixture.state), /data-initial-attendance-close|Cerrar asistencia/);
  fixture.click({ initialAttendanceOpen: "b" });
  assert.equal(fixture.state.attendanceStudentId, "b");
  assert.equal((AsistenciaInicial(fixture.state).match(/aria-expanded="true"/g) || []).length, 1);
  fixture.state.busy = true;
  fixture.click({ initialAttendanceOpen: "b" });
  assert.equal(fixture.state.attendanceStudentId, "b");
  fixture.state.busy = false;
  fixture.click({ initialAttendanceOpen: "b" });
  assert.equal(fixture.state.attendanceStudentId, "");
  assert.equal(fixture.writes.length, 0);
});

test("marcar asistencia guarda inmediatamente el alumno, fecha, trimestre y observacion", async () => {
  const fixture = attendanceFixture(); fixture.actions.input({ dataset: { initialAttendanceNote: "a" }, value: "Llego con su familia" });
  fixture.click({ initialAttendance: "atraso", student: "a" }); await fixture.settle();
  assert.equal(fixture.writes.length, 1);
  assert.deepEqual([fixture.writes[0][0], fixture.writes[0][1].id, ...fixture.writes[0].slice(2)], ["inicial", "a", "2026-03-09", "t2", "atraso", "Llego con su familia"]);
  assert.equal(fixture.state.attendanceStudentId, ""); assert.equal(fixture.records.a.estado, "atraso");
});
test("la guia avanza solo despues de guardar y vuelve a lista tras el ultimo alumno", async () => {
  const fixture = attendanceFixture(); fixture.click({ initialAttendanceMode: "guia" }); fixture.actions.renderGuide();
  assert.match(fixture.modals[0][1], /Alumno 1 de 2/); assert.match(fixture.modals[0][1], /Ana/);
  assert.equal(fixture.writes.length, 0);
  fixture.click({ initialAttendance: "presente", student: "a" }); await fixture.settle();
  assert.equal(fixture.state.attendanceGuidedIndex, 1); assert.equal(fixture.state.attendanceMode, "guia");
  fixture.click({ initialAttendance: "licencia", student: "b" }); await fixture.settle();
  assert.equal(fixture.state.attendanceMode, "lista"); assert.equal(fixture.state.attendanceGuidedIndex, 0);
  assert.deepEqual(Object.keys(fixture.records).sort(), ["a", "b"]);
});
test("un fallo conserva la observacion y no cierra ni avanza al alumno", async () => {
  const fixture = attendanceFixture(); fixture.state.attendanceMode = "guia"; fixture.fail(true);
  fixture.actions.input({ dataset: { initialAttendanceNote: "a" }, value: "Observacion pendiente" });
  fixture.click({ initialAttendance: "licencia", student: "a" }); await fixture.settle();
  assert.equal(fixture.state.attendanceGuidedIndex, 0); assert.equal(fixture.state.attendanceStudentId, "a"); assert.deepEqual(fixture.records, {});
  assert.match(guiaAsistenciaInicial(fixture.state), /Sin conexion/);
  assert.equal(fixture.state.attendanceNote("a").observacion, "Observacion pendiente");
  fixture.fail(false); fixture.click({ initialAttendance: "licencia", student: "a" }); await fixture.settle();
  assert.equal(fixture.records.a.observacion, "Observacion pendiente"); assert.equal(fixture.state.attendanceGuidedIndex, 1);
});
test("cerrar o navegar en guia no crea faltas ni registros y rechaza estados o alumnos invalidos", async () => {
  const fixture = attendanceFixture(); fixture.state.attendanceMode = "guia";
  fixture.click({}, "data-initial-attendance-next"); assert.equal(fixture.state.attendanceGuidedIndex, 1);
  fixture.click({}, "data-initial-attendance-prev"); assert.equal(fixture.state.attendanceGuidedIndex, 0);
  fixture.actions.renderGuide(); fixture.modals[0][2](); assert.equal(fixture.state.attendanceMode, "lista");
  assert.equal(fixture.click({ initialAttendance: "inventado", student: "a" }), false);
  assert.equal(fixture.click({ initialAttendance: "falta", student: "otro" }), false);
  assert.equal(fixture.writes.length, 0); assert.match(guiaAsistenciaInicial(fixture.state), /Sin registrar/);
  fixture.permitted(false); fixture.click({ initialAttendance: "presente", student: "a" }); await fixture.settle();
  assert.equal(fixture.writes.length, 0); assert.match(fixture.state.message, /Sin permiso/);
});

test("solo el Panel permite seleccionar trimestre; los otros seis modulos muestran el trimestre activo", () => {
  const panel = PanelInicial(visualState("/docente"));
  assert.equal((panel.match(/data-initial-select-term=/g) || []).length, 3);
  assert.match(panel, /aria-label="Trimestre activo"/);
  for (const [route, view] of [["asistencia", AsistenciaInicial], ["actividades", ActividadesInicial], ["registro", RegistroInicial], ["bitacora", BitacoraInicial], ["informe", InformeInicial], ["horario", HorarioInicial], ["resumenes", ResumenesInicial]]) {
    const html = view(visualState(`/docente/${route}`));
    assert.doesNotMatch(html, /data-initial-select-term|data-initial-term/);
    assert.match(html, /data-initial-active-term/);
    assert.match(html, /2do trimestre/);
    assert.match(html, /teacher-module-surface teacher-module-header/);
  }
});

test("Seguimiento reemplaza el nombre visible de Resumen sin cambiar su ruta", () => {
  assert.deepEqual(navegacionInicial.find((item) => item[1] === "#/docente/resumenes"), ["Seguimiento", "#/docente/resumenes", "chart-no-axes-combined"]);
  const state = visualState("/docente/resumenes");
  const ready = ResumenesInicial(state);
  assert.match(ready, /teacher-module-title">Seguimiento<\/h1>/);
  assert.match(ready, /Actualizar seguimiento/);
  assert.doesNotMatch(ready, />Resumen<|Cargar resumen|Actualizar resumen/);
  state.data.leer = () => undefined;
  assert.match(ResumenesInicial(state), /Seguimiento del trimestre/);
  assert.match(ResumenesInicial(state), /Cargar seguimiento/);
  state.loading = true;
  assert.match(ResumenesInicial(state), /Cargando seguimiento/);
});

test("Panel y Horario usan los mismos colores de materias del catalogo de Primaria", () => {
  const panel = PanelInicial(visualState("/docente"));
  const timetable = HorarioInicial(visualState("/docente/horario"));
  for (const id of ["matematica", "lenguaje"]) assert.ok(panel.includes(`--initial-subject-color:${findSubject(id).color}`));
  for (const id of ["matematica", "lenguaje", "ciencias_naturales", "educacion_fisica", "religion"]) assert.ok(timetable.includes(`--initial-subject-color:${findSubject(id).color}`));
  assert.doesNotMatch(timetable, /border-left-color/);
  assert.match(timetable, /Materias del horario/);
});

test("Inicial tiene registro cualitativo, bitacora e informe separados de Primaria", async () => {
  assert.deepEqual(navegacionInicial.map((item) => item[0]), ["Panel", "Asistencia", "Actividades", "Registro", "Bitacora", "Horario", "Seguimiento", "Informe trimestral"]);
  assert.ok(!navegacionInicial.some((item) => /calificar|regularizacion|notas|boletin/.test(item[1])));
  const entry = await readFile(new URL("../src/modules/docente/EntradaDocente.js", import.meta.url), "utf8");
  assert.match(entry, /import\("\.\.\/docente-inicial\/EntradaInicialDocente\.js"\)/);
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2 });
  assert.deepEqual(rutaGestion("registros_inicial"), ["gestiones", "2026", "registros_inicial"]);
});
test("un docente usa Inicial, Preinicial o ambos sin convertir cursos de Primaria", () => {
  assert.equal(cursoInicial(context, "preinicial").id, "preinicial");
  assert.throws(() => cursoInicial({ ...context, courses: [findCourse("inicial")] }, "preinicial"));
  assert.throws(() => cursoInicial({ ...context, courses: [...context.courses, findCourse("cuarto_a")] }, "inicial"));
  assert.throws(() => cursoInicial({ ...context, errorModalidad: "Revisar" }, "inicial"));
});
test("el registro diario guarda observacion, no nota, y valida alumno, estado, trimestre y fecha", () => {
  const result = validarRegistroInicial(context, { ...daily, puntaje: 100, maximo: 100 });
  assert.equal(result.descripcion, "Completo la actividad con ayuda.");
  assert.equal(result.fecha, daily.fecha);
  assert.equal(Object.hasOwn(result, "puntaje"), false);
  for (const changes of [{ estado: "100" }, { alumnoId: "" }, { trimestreId: "t4" }, { fecha: "2027-03-10" }, { fecha: "2026-02-30" }, { descripcion: "x".repeat(1501) }, { cursoId: "cuarto_a" }]) assert.throws(() => validarRegistroInicial(context, { ...daily, ...changes }));
});
test("la bitacora semanal es opcional por alumno o curso y editar la misma semana usa el mismo ID", () => {
  const monday = validarRegistroInicial(context, { ...daily, tipo: "semanal", alumnoId: "", fecha: "2026-03-09" });
  const friday = validarRegistroInicial(context, { ...daily, tipo: "semanal", alumnoId: "", fecha: "2026-03-13" });
  assert.equal(friday.estado, "");
  assert.equal(friday.fecha, "2026-03-09");
  assert.equal(idRegistroInicial(context.uid, monday), idRegistroInicial(context.uid, friday));
  assert.throws(() => validarRegistroInicial(context, { ...daily, tipo: "semanal", descripcion: "   " }));
  assert.equal(inicioSemanaInicial("2026-01-01"), "2026-01-01");
  assert.notEqual(idRegistroInicial(context.uid, daily), idRegistroInicial("otro-docente", daily));
  assert.notEqual(claveRegistroInicial(daily), claveRegistroInicial({ ...daily, alumnoId: "otro" }));
});
test("los alumnos sin registro no se cuentan como faltas y licencia conserva permiso anterior", () => {
  assert.deepEqual(resumirAsistenciaInicial([{ id: "a" }, { id: "b" }, { id: "c" }], { a: { estado: "permiso" } }, { b: "atraso" }), { presente: 0, falta: 0, atraso: 1, licencia: 1, sinRegistro: 1 });
  assert.equal(escaparInicial('<img onerror="x">'), "&lt;img onerror=&quot;x&quot;&gt;");
});
test("navegar solo consulta la cache; las cargas iguales en paralelo se comparten", async () => {
  let requests = 0;
  const data = crearDatosInicial(context, { getTeacherStudents: async () => { requests++; return [{ id: "a" }]; } });
  assert.equal(data.leer("students", "inicial"), undefined);
  assert.equal(requests, 0);
  const [first, second] = await Promise.all([data.cargar("students", "inicial"), data.cargar("students", "inicial")]);
  assert.deepEqual(first, second);
  await data.cargar("students", "inicial");
  assert.equal(requests, 1);
  await data.cargar("students", "inicial", "", "", true);
  assert.equal(requests, 2);
  assert.equal(data.leer("students", "preinicial"), undefined);
  await assert.rejects(data.cargar("students", "cuarto_a"));
});
test("cache separa fechas, cursos y trimestres y permite reintentar una carga fallida", async () => {
  let attempts = 0;
  const data = crearDatosInicial(context, { listAttendanceForCourseDate: async (courseId, fecha, term) => {
    if (++attempts === 1) throw new Error("Sin conexion");
    return { courseId, fecha, term };
  } });
  await assert.rejects(data.cargar("attendance", "inicial", "t1", "2026-03-10"));
  await data.cargar("attendance", "inicial", "t1", "2026-03-10");
  assert.equal(attempts, 2);
  assert.equal(data.leer("attendance", "inicial", "t2", "2026-03-10"), undefined);
  assert.equal(data.leer("attendance", "inicial", "t1", "2026-03-11"), undefined);
  assert.equal(data.leer("attendance", "preinicial", "t1", "2026-03-10"), undefined);
});
test("guardar actualiza la cache sin duplicar entradas y una falla no inventa un registro", async () => {
  const data = crearDatosInicial(context, {
    listarRegistrosInicial: async () => [], guardarRegistroInicial: async (_, input) => { if (input.estado === "fallar") throw new Error("No guardado"); return { id: "estable", ...input }; },
    listAttendanceForCourseDate: async () => ({}), saveAttendance: async (input) => ({ id: "asistencia", alumnoId: input.student.id, estado: input.estado })
  });
  await data.cargar("records", "inicial", "t1");
  await data.guardarRegistro(daily);
  await data.guardarRegistro({ ...daily, descripcion: "Actualizado" });
  assert.equal(data.leer("records", "inicial", "t1").length, 1);
  await assert.rejects(data.guardarRegistro({ ...daily, estado: "fallar" }));
  assert.equal(data.leer("records", "inicial", "t1")[0].descripcion, "Actualizado");
  await data.cargar("attendance", "inicial", "t1", daily.fecha);
  await data.guardarAsistencia("inicial", { id: "a" }, daily.fecha, "t1", "licencia");
  assert.equal(data.leer("attendance", "inicial", "t1", daily.fecha).a.estado, "licencia");
});
test("cerrar sesion descarta datos pendientes y bloquea escrituras de la cuenta anterior", async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const data = crearDatosInicial(context, { getTeacherStudents: () => pending });
  const request = data.cargar("students", "inicial");
  await new Promise((done) => setImmediate(done));
  data.desmontar();
  resolve([{ id: "privado" }]);
  await assert.rejects(request, /sesion cambio/);
  assert.equal(data.leer("students", "inicial"), undefined);
  await assert.rejects(data.guardarRegistro(daily), /sesion cambio/);
});

async function controllerFixture(save, dependencies = {}) {
  const source = await readFile(new URL("../src/modules/docente-inicial/ControladorInicial.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("export function crearControladorInicial")).replace("export function", "function");
  const listeners = new Map();
  const modalListeners = new Map(), modalControls = new Map();
  const trigger = { focused: 0, focus() { this.focused++; } };
  const modalControl = (selector) => {
    if (!modalControls.has(selector)) modalControls.set(selector, { focus() {}, addEventListener(type, handler, { signal }) {
      this[type] = handler; signal.addEventListener("abort", () => { this[type] = null; }, { once: true });
    } });
    return modalControls.get(selector);
  };
  const modal = { innerHTML: "", querySelector: (selector) => selector === ".initial-dialog" ? { classList: { add() {} }, querySelectorAll: () => [] } : modalControl(selector), querySelectorAll: (selector) => selector === "[data-initial-print-student]" ? [...modalControls.values()].filter((item) => item.dataset?.initialPrintStudent) : [], addEventListener(type, handler, { signal }) {
    modalListeners.set(type, handler); signal.addEventListener("abort", () => { if (modalListeners.get(type) === handler) modalListeners.delete(type); }, { once: true });
  } };
  const main = { innerHTML: "", querySelector: (selector) => selector === "[data-initial-dialog-host]" ? modal : selector === '[data-initial-action="select-student"]' ? trigger : null, addEventListener(type, handler, { signal }) {
    listeners.set(type, handler);
    signal.addEventListener("abort", () => { if (listeners.get(type) === handler) listeners.delete(type); }, { once: true });
  } };
  const document = { activeElement: trigger, querySelector: (selector) => selector === "[data-teacher-ui]" ? main : null, querySelectorAll: () => [], addEventListener() {} };
  const create = vm.runInNewContext(`${code}; crearControladorInicial`, { document, crearAccionesActividades, crearAccionesAsistenciaInicial, animarCambioAlumnoInicial, medirSeleccionAlumnoInicial, animarSelectorAlumnosInicial, animarSeleccionResumenInicial, crearNavegacionMapaInicial, listaResumenInicial, materiasSeguimientoInicial, structuredClone, AbortController, todayIso: () => "2026-03-10", puedeRegistrarInicial: () => true, activeCommunications: () => [], exigirTrimestreDocente, puedeRegistrarTrimestre, trimestresDeAsignacion, trimestresInicial, geminiInicialDisponible: () => false, generarInformeConIA: () => {}, alumnoInicial, criteriosInicial, dimensionesInicial, materiasInicial, valoracionesInicial, firmaRegistrosInicial, cuadriculaAlumnosInicial, recopilarInformesCursoInicial, selectorImpresionInformesInicial, e: escaparInicial, icon });
  let sequence = 0;
  const activity = { id: "actividad-a", cursoId: "inicial", trimestreId: "t1", estado: "pendiente", prioritaria: true, criterios: Object.fromEntries(["ser", "saber", "hacer"].map((id) => [id, { criterio: id, opciones: { logrado: "Lo logra", en_proceso: "En proceso", requiere_apoyo: "Requiere apoyo", no_observado: "Sin observar" } }])) };
  let stored = [];
  const data = { nuevoId: () => `docente_${++sequence}`, leer: (type) => type === "students" ? [{ id: "a", nombre: "Ana" }, { id: "b", nombre: "Bruno" }] : type === "activities" ? [activity] : stored, guardarAvance: async (activity, studentId, entries) => {
    await save({ activity, studentId, entries });
    for (const [dimension, entry] of Object.entries(entries)) {
      const id = `${activity.id}_${studentId}_${dimension}`;
      stored = [...stored.filter((item) => item.id !== id), { id, tipo: "actividad", actividadId: activity.id, alumnoId: studentId, dimension, ...entry }];
    }
  }, cargar: async () => [], guardarRegistro: save, desmontar() {} };
  const views = Object.fromEntries(["/docente", "/docente/registro", "/docente/resumenes", "/docente/informe", "/docente/bitacora"].map((route) => [route, () => "Vista cualitativa"]));
  const controller = create(context, views, { data, saveTerm: async () => {}, watchCommunications: () => () => {}, ...dependencies });
  controller.state.activityId = "actividad-a";
  controller.state.studentId = "a";
  controller.state.registrationStudentSelected = true;
  controller.vincular("/docente/registro");
  const click = (action) => listeners.get("click")({ target: { closest: () => ({ hasAttribute: () => false, disabled: false, dataset: typeof action === "string" ? { initialAction: action } : action }) } });
  return { controller, click, modal, trigger, control: modalControl,
    input: (selector, value) => listeners.get("input")({ target: { value, matches: (candidate) => candidate === selector } }),
    changePrint: (target) => modalListeners.get("change")?.({ target }),
    pickStudent: (id) => modalListeners.get("click")?.({ target: { closest: () => ({ dataset: { initialPickerStudent: id } }) } }),
    escape: () => modalListeners.get("keydown")?.({ key: "Escape" })
  };
}
const settle = () => new Promise((done) => setImmediate(done));

test("Resumen alterna alumno y categoria sin guardar registros", async () => {
  const fixture = await controllerFixture(async () => assert.fail("Consultar Resumen no guarda registros"));
  fixture.controller.vincular("/docente/resumenes");
  fixture.click({ initialSummaryStudent: "a" }); assert.equal(fixture.controller.state.summaryStudentId, "a");
  fixture.click({ initialSummaryCategory: "saber" }); assert.equal(fixture.controller.state.summaryCategory, "saber");
  fixture.controller.state.summarySubjectId = "lenguaje";
  fixture.click({ initialSummaryStudent: "b" }); assert.equal(fixture.controller.state.summaryStudentId, "b");
  assert.equal(fixture.controller.state.summarySubjectId, "all");
  fixture.click({ initialSummaryCategory: "no-valido" }); assert.equal(fixture.controller.state.summaryCategory, "saber");
  fixture.click({ initialSummaryStudent: "b" }); assert.equal(fixture.controller.state.summaryStudentId, "");
  fixture.input("[data-initial-summary-search]", "Bruno"); assert.equal(fixture.controller.state.summarySearch, "Bruno");
  fixture.controller.desmontar();
});

test("Seguimiento recoge alumnos hacia el seleccionado y los despliega por el recorrido inverso", async () => {
  assert.equal(animarSeleccionResumenInicial(null, null), null);
  const frames = aspirarAlumnoSeguimiento({ left: 0, top: 100, width: 400, height: 60 }, { left: 0, top: 220, width: 400, height: 60 }, 1);
  assert.match(frames.at(-1).transform, /translate\(0px, 120px\).*scale\(\.08\)/); assert.equal(frames.at(-1).opacity, 0);
  let focused = false; const animations = [], attributes = new Map();
  const classList = { add() {}, remove() {}, contains: () => focused };
  const make = (id, top) => {
    const row = { style: { visibility: "visible" }, classList, getBoundingClientRect: () => ({ left: 0, top, width: 500, height: 64 }), animate(frames, options) { animations.push({ frames, options }); return { finished: Promise.resolve(), cancel() {} }; } };
    row.button = { dataset: { initialSummaryStudent: id }, closest: () => row }; row.querySelector = () => row.button; return row;
  };
  const rows = [make("a", 100), make("b", 164), make("c", 228)], chosen = make("b", 100);
  const list = { classList, querySelectorAll: () => focused ? [chosen] : rows, getAttribute: (key) => attributes.get(key) ?? null, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: (key) => attributes.delete(key) };
  const workspace = { ...make("workspace", 80), style: { overflow: "auto" } };
  const root = { querySelector: (selector) => selector === ".initial-summary-list" ? list : selector === ".initial-summary-section" ? workspace : focused ? chosen : null, querySelectorAll: (selector) => selector === "[data-initial-summary-student]" ? (focused ? [chosen] : rows).map((row) => row.button) : focused ? [chosen] : rows };
  const opening = animarSeleccionResumenInicial(root, rows[1].button);
  assert.equal(attributes.get("aria-busy"), "true"); assert.equal(await opening.finished, true);
  assert.equal(animations.length, 2); focused = true; assert.equal(await opening.reveal(root), true); opening.cancel();
  assert.equal(workspace.style.overflow, "auto"); assert.equal(attributes.has("aria-busy"), false);
  animations.length = 0; const returning = animarSeleccionResumenInicial(root, chosen.button); await returning.finished;
  focused = false; await returning.reveal(root); returning.cancel();
  assert.equal(animations.filter((item) => item.options.direction === "reverse").length, 2);
  const cancelled = animarSeleccionResumenInicial(root, rows[1].button); cancelled.cancel(); assert.equal(await cancelled.finished, false);
  const previous = globalThis.matchMedia;
  try { globalThis.matchMedia = () => ({ matches: true }); assert.equal(animarSeleccionResumenInicial(root, rows[1].button), null); }
  finally { if (previous) globalThis.matchMedia = previous; else delete globalThis.matchMedia; }
});

test("cambiar de ruta durante la aspiracion no selecciona un alumno ni guarda datos", async () => {
  let finish, cancelled = 0, reveals = 0;
  const fixture = await controllerFixture(async () => assert.fail("La navegacion no guarda registros"), { animateSummary: () => ({ finished: new Promise((resolve) => { finish = resolve; }), reveal: async () => { reveals++; return true; }, cancel() { cancelled++; } }) });
  fixture.controller.vincular("/docente/resumenes"); fixture.click({ initialSummaryStudent: "a" });
  assert.equal(fixture.controller.state.summaryStudentId, ""); fixture.controller.vincular("/docente/informe");
  finish(true); await settle(); assert.equal(fixture.controller.state.summaryStudentId, ""); assert.equal(reveals, 0); assert.ok(cancelled > 0);
  fixture.controller.desmontar();
});

test("el filtro de materias de Seguimiento solo acepta materias con registros del alumno y categoria", async () => {
  const rows = [{ id: "ser-a", alumnoId: "a", tipo: "actividad", dimension: "ser", materiaId: "matematica" }, { id: "saber-a", alumnoId: "a", tipo: "actividad", dimension: "saber", materiaId: "lenguaje" }, { id: "ser-b", alumnoId: "b", tipo: "actividad", dimension: "ser", materiaId: "musica" }];
  const data = { nuevoId: () => "id", leer: (type) => type === "students" ? [{ id: "a", nombre: "Ana" }, { id: "b", nombre: "Bruno" }] : rows, cargar: async () => [], desmontar() {} };
  const fixture = await controllerFixture(async () => assert.fail("Filtrar no guarda registros"), { data });
  fixture.controller.vincular("/docente/resumenes"); fixture.click({ initialSummaryStudent: "a" }); fixture.click({ initialSummarySubject: "matematica" });
  assert.equal(fixture.controller.state.summarySubjectId, "matematica");
  fixture.click({ initialSummarySubject: "musica" }); assert.equal(fixture.controller.state.summarySubjectId, "matematica");
  fixture.click({ initialSummaryCategory: "saber" }); assert.equal(fixture.controller.state.summarySubjectId, "all");
  fixture.click({ initialSummarySubject: "lenguaje" }); assert.equal(fixture.controller.state.summarySubjectId, "lenguaje");
  fixture.click({ initialSummaryStudent: "b" }); assert.equal(fixture.controller.state.summarySubjectId, "all"); fixture.controller.desmontar();
});

test("las flechas recorren el mapa horizontal y se deshabilitan en sus extremos", () => {
  let offset = 0; const movements = [], left = {}, right = {};
  const viewport = { dataset: { initialMapKey: "alumno-a-ser" }, clientWidth: 320, scrollWidth: 760, scrollTop: 0, get scrollLeft() { return offset; }, set scrollLeft(value) { offset = Math.min(Math.max(0, value), this.scrollWidth - this.clientWidth); }, scrollBy(options) { movements.push(options); this.scrollLeft += options.left; } };
  const root = { querySelector: (selector) => selector === "[data-initial-map-viewport]" ? viewport : selector.includes('"-1"') ? left : right };
  const navigation = crearNavegacionMapaInicial({ Observer: null, reduceMotion: () => false });
  navigation.vincular(root); assert.equal(left.disabled, true); assert.equal(right.disabled, false);
  navigation.desplazar(1); navigation.alDesplazar(viewport); assert.equal(viewport.scrollLeft, 272); assert.equal(movements[0].behavior, "smooth"); assert.equal(left.disabled, false);
  navigation.desplazar(1); navigation.alDesplazar(viewport); assert.equal(viewport.scrollLeft, 440); assert.equal(right.disabled, true);
  navigation.desplazar(-1); navigation.alDesplazar(viewport); assert.equal(right.disabled, false);
  navigation.desplazar("invalido"); assert.equal(movements.length, 3); navigation.desmontar();
});

test("el mapa conserva su posicion al redibujar y la separa por alumno y materia", () => {
  let viewport = { dataset: { initialMapKey: "a-ser-matematica" }, clientWidth: 300, scrollWidth: 760, scrollLeft: 0, scrollTop: 0 };
  const left = {}, right = {}, observations = []; let disconnected = 0, resized;
  class Observer { constructor(callback) { resized = callback; } observe(element) { observations.push(element); } disconnect() { disconnected++; } }
  const root = { querySelector: (selector) => selector === "[data-initial-map-viewport]" ? viewport : selector.includes('"-1"') ? left : right };
  const navigation = crearNavegacionMapaInicial({ Observer }); navigation.vincular(root);
  viewport.scrollLeft = 350; viewport.scrollTop = 120; navigation.guardarPosicion();
  viewport = { ...viewport, dataset: { initialMapKey: "b-saber-lenguaje" }, scrollLeft: 0, scrollTop: 0 }; navigation.vincular(root); assert.equal(viewport.scrollLeft, 0);
  viewport = { ...viewport, dataset: { initialMapKey: "a-ser-matematica" }, scrollLeft: 0, scrollTop: 0 }; navigation.vincular(root); assert.equal(viewport.scrollLeft, 350); assert.equal(viewport.scrollTop, 120);
  viewport.clientWidth = 800; viewport.scrollWidth = 800; viewport.scrollLeft = 0; resized(); assert.equal(left.disabled, true); assert.equal(right.disabled, true);
  assert.equal(observations.length, 3); navigation.desmontar(); assert.ok(disconnected >= 3);
  viewport.scrollLeft = 0; viewport.scrollTop = 0; navigation.vincular(root); assert.equal(viewport.scrollLeft, 0); navigation.desmontar();
});

test("movimiento reducido evita el desplazamiento animado del mapa y desmontar retira el acceso", () => {
  const movements = [];
  const viewport = { dataset: { initialMapKey: "mapa" }, clientWidth: 300, scrollWidth: 760, scrollLeft: 0, scrollBy: (options) => movements.push(options) };
  const root = { querySelector: (selector) => selector === "[data-initial-map-viewport]" ? viewport : null };
  const navigation = crearNavegacionMapaInicial({ Observer: null, reduceMotion: () => true });
  navigation.desplazar(1); assert.equal(movements.length, 0); navigation.vincular(root); navigation.desplazar(1); assert.equal(movements[0].behavior, "auto");
  navigation.desmontar(); navigation.desplazar(1); assert.equal(movements.length, 1);
});

test("editar Bitacora desde Resumen conserva el texto si falla y guarda sin duplicar al reintentar", async () => {
  const record = { id: "docente-inicial_nota", tipo: "bitacora", docenteUid: context.uid, alumnoId: "a", cursoId: "inicial", trimestreId: "t1", descripcion: "Texto anterior" };
  let fail = true, writes = 0;
  const data = { nuevoId: () => "nuevo", leer: (type) => type === "students" ? [{ id: "a", nombre: "Ana" }] : [record], cargar: async () => [], desmontar() {}, async editarBitacora(input) { writes++; if (fail) throw new Error("Sin conexion"); assert.equal(input.descripcionAnterior, "Texto anterior"); record.descripcion = input.descripcion; } };
  const fixture = await controllerFixture(async () => {}, { data });
  fixture.controller.vincular("/docente/resumenes"); fixture.click({ initialEditJournal: record.id });
  const text = fixture.control("[data-initial-edit-journal-text]"), save = fixture.control("[data-initial-confirm-edit-journal]"), error = fixture.control("[data-initial-edit-journal-error]");
  text.value = "Texto corregido"; text.input(); assert.equal(save.disabled, false);
  await save.click(); assert.equal(writes, 1); assert.equal(error.hidden, false); assert.equal(text.value, "Texto corregido"); assert.notEqual(fixture.modal.innerHTML, "");
  fail = false; await save.click(); assert.equal(writes, 2); assert.equal(record.descripcion, "Texto corregido"); assert.equal(fixture.modal.innerHTML, "");
  fixture.controller.desmontar();
});

test("imprimir informes consulta tres trimestres, selecciona todos y permite un subconjunto", async () => {
  const pupils = [{ id: "a", nombre: "Ana" }, { id: "b", nombre: "Bruno" }], calls = [], printed = [];
  const records = Object.fromEntries(trimestresInicial.map((term) => [term.id, pupils.map((pupil) => ({ id: `${pupil.id}-${term.id}`, alumnoId: pupil.id, tipo: "informe", aprobado: true, descripcion: `${pupil.nombre} ${term.id}`, fuentesFirma: firmaRegistrosInicial([], pupil.id) }))]));
  const data = { nuevoId: () => "nuevo", leer: (type, _, term) => type === "students" ? pupils : records[term] || [], cargar: async (type, _, term) => { calls.push([type, term]); return type === "students" ? pupils : records[term] || []; }, desmontar() {} };
  const fixture = await controllerFixture(async () => {}, { data, printReports: (payload) => printed.push(payload) });
  fixture.controller.vincular("/docente/informe"); await settle(); calls.length = 0;
  for (const pupil of pupils) Object.assign(fixture.control(`[data-initial-print-student="${pupil.id}"]`), { dataset: { initialPrintStudent: pupil.id }, matches: () => true });
  fixture.click("print-course-reports"); await settle();
  assert.deepEqual(calls.map((item) => item[1]), ["t1", "t2", "t3"]);
  const all = fixture.control("[data-initial-print-all]"), print = fixture.control("[data-initial-confirm-print]");
  assert.equal(all.checked, true); assert.equal(print.disabled, false); assert.match(fixture.modal.innerHTML, /Imprimir informes del curso/);
  all.checked = false; fixture.changePrint(all); assert.equal(print.disabled, true);
  const ana = fixture.control('[data-initial-print-student="a"]'); ana.checked = true; fixture.changePrint(ana);
  assert.equal(all.indeterminate, true); assert.equal(print.disabled, false);
  print.click(); assert.equal(printed.length, 1); assert.equal(printed[0].rows.length, 1); assert.equal(printed[0].rows[0].student.id, "a"); assert.equal(printed[0].rows[0].informes.t3, "Ana t3");
  fixture.controller.desmontar();
});

test("seleccionar alumno del informe cierra la cuadricula y conserva los borradores sin guardar", async () => {
  const fixture = await controllerFixture(async () => assert.fail("Seleccionar un alumno no guarda datos"));
  const { controller, click, modal, trigger, pickStudent, escape } = fixture;
  controller.vincular("/docente/informe"); await settle();
  controller.state.studentId = "a"; controller.state.reportDraft().descripcion = "Borrador de Ana";
  click("select-student"); assert.match(modal.innerHTML, /data-initial-picker-student="a" aria-pressed="true"/);
  pickStudent("no-pertenece"); assert.equal(controller.state.studentId, "a"); assert.notEqual(modal.innerHTML, "");
  pickStudent("b"); assert.equal(controller.state.studentId, "b"); assert.equal(modal.innerHTML, "");
  assert.ok(trigger.focused > 0); assert.equal(controller.state.reportDraft().descripcion, "");
  controller.state.reportDraft().descripcion = "Borrador de Bruno";
  click("select-student"); assert.match(modal.innerHTML, /data-initial-picker-student="b" aria-pressed="true"/);
  pickStudent("a"); assert.equal(controller.state.reportDraft().descripcion, "Borrador de Ana");
  click("select-student"); pickStudent("a"); assert.equal(modal.innerHTML, "");
  click("select-student"); escape(); assert.equal(modal.innerHTML, ""); assert.equal(controller.state.studentId, "a");
  click("select-student"); controller.vincular("/docente/registro"); pickStudent("b");
  assert.equal(controller.state.studentId, "a");
  controller.desmontar();
});

test("el selector de informe no abre otra ruta ni cambia de alumno durante una operacion", async () => {
  const fixture = await controllerFixture(async () => {});
  await settle(); fixture.click("select-student"); assert.equal(fixture.modal.innerHTML, "");
  fixture.controller.vincular("/docente/informe"); await settle();
  fixture.controller.state.busy = true; fixture.click("select-student"); assert.equal(fixture.modal.innerHTML, "");
  fixture.controller.state.busy = false; fixture.click("select-student");
  fixture.controller.state.busy = true; fixture.pickStudent("b"); assert.equal(fixture.controller.state.studentId, "a");
  fixture.controller.state.busy = false; fixture.escape(); fixture.controller.desmontar();
});

test("Bitacora cambia de alumno con el mismo modal y conserva observaciones sin guardarlas", async () => {
  const fixture = await controllerFixture(async () => assert.fail("Cambiar de alumno no guarda observaciones"));
  const { controller, click, modal, pickStudent, escape } = fixture;
  controller.vincular("/docente/bitacora"); await settle();
  controller.state.studentId = "a";
  const first = controller.state.noteDraft(); first.descripcion = "Observacion pendiente de Ana";
  click("select-student"); await settle(); assert.match(modal.innerHTML, /data-initial-picker-student="a" aria-pressed="true"/);
  pickStudent("otro-curso"); assert.equal(controller.state.studentId, "a");
  pickStudent("b"); await settle(); assert.equal(modal.innerHTML, ""); assert.equal(controller.state.studentId, "b");
  const second = controller.state.noteDraft(); assert.equal(second.descripcion, ""); assert.notEqual(second.id, first.id);
  second.descripcion = "Observacion pendiente de Bruno";
  click("select-student"); await settle(); pickStudent("a"); await settle(); assert.equal(controller.state.noteDraft().descripcion, first.descripcion);
  click("select-student"); await settle(); escape(); await settle(); assert.equal(modal.innerHTML, ""); assert.equal(controller.state.studentId, "a");
  click("select-student"); await settle(); pickStudent("b"); await settle(); assert.equal(controller.state.noteDraft().descripcion, second.descripcion);
  controller.vincular("/docente/informe"); await settle(); assert.equal(controller.state.reportDraft().descripcion, "");
  controller.vincular("/docente/bitacora"); await settle(); assert.equal(controller.state.noteDraft().descripcion, second.descripcion);
  controller.desmontar();
});

test("Bitacora espera la recogida, evita dobles selecciones y cancela animaciones al navegar", async () => {
  const motions = [];
  const fixture = await controllerFixture(async () => assert.fail("La animacion no guarda observaciones"), { animateStudentPicker: (_, __, reverse) => {
    let resolve; const motion = { reverse, cancelled: false, finished: new Promise((done) => { resolve = done; }), finish: () => resolve(true), cancel() { this.cancelled = true; resolve(false); } };
    motions.push(motion); return motion;
  } });
  const { controller, click, pickStudent, modal, escape } = fixture;
  controller.vincular("/docente/informe"); await settle(); click("select-student"); assert.equal(motions.length, 0); escape();
  controller.vincular("/docente/bitacora"); await settle();
  click("select-student"); click("select-student"); assert.equal(motions.length, 1); assert.equal(motions[0].reverse, false);
  pickStudent("b"); assert.equal(controller.state.studentId, "a");
  motions[0].finish(); await settle(); pickStudent("b"); await settle();
  assert.equal(motions.length, 2); assert.equal(motions[1].reverse, true); assert.equal(controller.state.studentId, "a");
  pickStudent("a"); motions[1].finish(); await settle(); assert.equal(controller.state.studentId, "b"); assert.equal(modal.innerHTML, "");
  click("select-student"); controller.vincular("/docente/registro"); await settle();
  assert.equal(motions[2].cancelled, true); pickStudent("a"); assert.equal(controller.state.studentId, "b");
  controller.vincular("/docente/bitacora"); await settle(); click("select-student"); escape(); await settle();
  assert.equal(motions[3].cancelled, true); assert.equal(motions[4].reverse, true);
  motions[4].finish(); await settle(); assert.equal(modal.innerHTML, ""); assert.equal(controller.state.studentId, "b");
  click("select-student"); motions[5].finish(); await settle();
  escape(); controller.vincular("/docente/registro"); await settle();
  assert.equal(motions.length, 6); assert.equal(controller.state.studentId, "b");
  controller.desmontar();
});

test("la seleccion espera la animacion, evita dobles clics y no abre otra ruta al terminar", async () => {
  let finish, finishReveal, calls = 0, cancelled = 0;
  const { controller, click } = await controllerFixture(async () => assert.fail("La navegacion no guarda datos"), { animateActivity: () => { calls++; return { finished: new Promise((resolve) => { finish = resolve; }), reveal: () => new Promise((resolve) => { finishReveal = resolve; }), cancel: () => { cancelled++; } }; } });
  await settle(); controller.state.activityId = "";
  click({ activityOpen: "actividad-a" }); click({ activityOpen: "otra" });
  assert.equal(calls, 1); assert.equal(controller.state.activityId, "");
  finish(true); await settle(); assert.equal(controller.state.activityId, "actividad-a");
  click({ activityOpen: "otra" }); assert.equal(calls, 1);
  finishReveal(true); await settle();
  controller.state.activityId = ""; click({ activityOpen: "actividad-a" });
  controller.vincular("/docente/resumenes"); finish(true); await settle();
  assert.equal(controller.state.activityId, ""); assert.ok(cancelled >= 2);
  controller.desmontar();
});

async function termControllerFixture(saveTerm, terms = ["t1", "t2", "t3"]) {
  const source = await readFile(new URL("../src/modules/docente-inicial/ControladorInicial.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("export function crearControladorInicial")).replace("export function", "function");
  const listeners = new Map();
  const controls = new Map();
  const control = (name) => {
    if (!controls.has(name)) controls.set(name, { focus() {}, addEventListener(type, handler, { signal } = {}) {
      this[type] = handler;
      signal?.addEventListener("abort", () => { this[type] = null; }, { once: true });
    } });
    return controls.get(name);
  };
  const host = { innerHTML: "", addEventListener() {}, querySelector: (selector) => selector === ".initial-dialog" ? { querySelectorAll: () => [] } : selector === "textarea" ? null : control(selector) };
  const main = { innerHTML: "", querySelector: (selector) => selector === "[data-initial-dialog-host]" ? host : null, addEventListener(type, handler) { listeners.set(type, handler); } };
  const document = { activeElement: null, querySelector: (selector) => selector === "[data-teacher-ui]" ? main : null, querySelectorAll: () => [], addEventListener() {} };
  const create = vm.runInNewContext(`${code}; crearControladorInicial`, { document, crearAccionesActividades, crearAccionesAsistenciaInicial, animarCambioAlumnoInicial, medirSeleccionAlumnoInicial, crearNavegacionMapaInicial, structuredClone, AbortController, todayIso: () => "2026-03-09", puedeRegistrarInicial: () => true, activeCommunications: () => [], exigirTrimestreDocente, puedeRegistrarTrimestre, trimestresDeAsignacion, trimestresInicial, e: escaparInicial, icon, geminiInicialDisponible: () => false, generarInformeConIA: () => {}, materiasInicial });
  const ownContext = { ...context, profile: { trimestreActivo: "t2" }, trimestres: terms };
  const views = { "/docente": () => "Panel", "/docente/asistencia": () => "Asistencia" };
  const controller = create(ownContext, views, { data: { leer: () => [], cargar: async () => [], desmontar() {} }, saveTerm, watchCommunications: () => () => {} });
  return { controller, host, control, select: (term) => listeners.get("click")({ target: { closest: () => ({ hasAttribute: () => false, disabled: false, dataset: { initialSelectTerm: term } }) } }) };
}

test("cambiar el trimestre exige confirmacion desde Panel y se conserva al navegar", async () => {
  const writes = [];
  const { controller, host, control, select } = await termControllerFixture(async (...args) => { writes.push(args); });
  controller.vincular("/docente/asistencia");
  select("t3");
  assert.equal(host.innerHTML, "");
  controller.vincular("/docente");
  select("t3");
  assert.match(host.innerHTML, /Cambiar trimestre activo/);
  assert.equal(controller.state.termId, "t2");
  control("[data-initial-cancel-term]").click();
  assert.equal(controller.state.termId, "t2");
  assert.equal(writes.length, 0);
  select("t3");
  control("[data-initial-confirm-term]").click();
  await settle();
  assert.equal(controller.state.termId, "t3");
  assert.deepEqual(writes, [[context.uid, "t3"]]);
  controller.vincular("/docente/asistencia");
  assert.equal(controller.state.termId, "t3");
  controller.desmontar();
});

test("si falla guardar el trimestre o no esta asignado no se cambia el trimestre de registro", async () => {
  const failure = await termControllerFixture(async () => { throw new Error("Sin conexion"); });
  failure.controller.vincular("/docente");
  failure.select("t3");
  failure.control("[data-initial-confirm-term]").click();
  await settle();
  assert.equal(failure.controller.state.termId, "t2");
  assert.equal(failure.controller.state.error, true);
  failure.controller.desmontar();
  const restricted = await termControllerFixture(async () => assert.fail("No debe guardar"), ["t2"]);
  restricted.controller.vincular("/docente");
  restricted.select("t1");
  assert.equal(restricted.host.innerHTML, "");
  assert.equal(restricted.controller.state.termId, "t2");
  restricted.controller.desmontar();
});

test("cambiar los trimestres asignados de Inicial descarta el controlador y sus borradores anteriores", async () => {
  const source = await readFile(new URL("../src/modules/docente-inicial/EntradaInicialDocente.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("export function preparar"), source.indexOf("export const vincular")).replace("export function", "function");
  let created = 0;
  let stopped = 0;
  const module = vm.runInNewContext(`let controller = null, key = '', rutas = {}; const views = {}; const actualizarIconos = () => {}; ${code}; ({ preparar })`, { crearControladorInicial: () => { created++; return { desmontar() { stopped++; }, vista() {} }; } });
  module.preparar(context);
  module.preparar(context);
  assert.equal(created, 1);
  module.preparar({ ...context, trimestres: ["t1"], reemplazadoPorUid: "nuevo" });
  assert.equal(created, 2);
  assert.equal(stopped, 1);
});
test("cada recuadro se guarda automaticamente y recorre SER SABER HACER antes del siguiente alumno", async () => {
  const writes = [];
  const { controller, click } = await controllerFixture(async (input) => { writes.push(input); });
  click({ activityRate: "logrado" }); await settle();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].activity.id, "actividad-a");
  assert.equal(writes[0].studentId, "a");
  assert.equal(writes[0].entries.ser.valoracion, "logrado");
  assert.equal(controller.state.studentId, "a");
  assert.equal(controller.state.dimension, "saber");
  click({ activityRate: "en_proceso" }); await settle();
  assert.equal(controller.state.studentId, "a"); assert.equal(controller.state.dimension, "hacer");
  click({ activityRate: "requiere_apoyo" }); await settle();
  assert.equal(writes.length, 3); assert.equal(controller.state.studentId, "b"); assert.equal(controller.state.dimension, "ser");
  assert.equal(Object.keys(controller.state.advanceDraft()).length, 0);
  controller.desmontar();
});

test("los modulos cargan solos y Resumen conserva la carga manual", async () => {
  const { controller } = await controllerFixture(async () => {});
  await settle();
  const calls = [];
  controller.state.data.cargar = async (...args) => { calls.push(args); return []; };
  controller.vincular("/docente/registro"); await settle();
  assert.deepEqual(calls.map((item) => item[0]).sort(), ["activities", "records", "students"]);
  assert.ok(calls.every((item) => item.at(-1) === false));
  calls.length = 0;
  controller.vincular("/docente/resumenes"); await settle();
  assert.equal(calls.length, 0);
  controller.vincular("/docente/asistencia"); await settle();
  assert.deepEqual(calls.map((item) => item[0]).sort(), ["attendance", "students"]);
  assert.equal(controller.state.loading, false);
  controller.desmontar();
});
test("una falla atomica conserva todos los borradores del avance para reintentar", async () => {
  const { controller, click } = await controllerFixture(async () => { throw new Error("Sin conexion"); });
  const draft = controller.state.advanceDraft();
  draft.ser = { valoracion: "requiere_apoyo" }; draft.saber = { valoracion: "logrado" };
  click("retry-advance"); await settle();
  assert.equal(Object.keys(draft).length, 2);
  assert.equal(controller.state.error, true);
  assert.equal(controller.state.busy, false);
  controller.desmontar();
});

test("navegar durante el guardado no cambia el alumno de otra vista ni deja un bloqueo", async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const writes = [];
  const { controller, click } = await controllerFixture(async (input) => { writes.push(input); await pending; });
  controller.state.advanceDraft().ser = { valoracion: "logrado" };
  click("retry-advance");
  controller.vincular("/docente/resumenes");
  assert.equal(controller.state.busy, true);
  resolve(); await settle();
  assert.equal(writes.length, 1);
  assert.equal(controller.state.studentId, "a");
  assert.equal(controller.state.busy, false);
  assert.equal(controller.state.message, "");
  controller.desmontar();
});
