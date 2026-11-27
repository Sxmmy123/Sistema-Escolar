import assert from "node:assert/strict";
import test from "node:test";
import { formatoCarta } from "../src/ui/impresion.js";
import { documentosImpresionPrueba } from "./fixturesImpresion.js";

test("carta reserva 25mm a la izquierda sin exceder el area imprimible", () => {
  assert.deepEqual(formatoCarta(), { ancho: 180.9, alto: 259.4, margen: "10mm 10mm 10mm 25mm", pagina: "@page { size: letter portrait; margin: 10mm 10mm 10mm 25mm; }" });
  assert.equal(formatoCarta({ superior: 0, derecho: 20, inferior: 0 }).ancho, 170.9);
  assert.equal(formatoCarta({ superior: 14, derecho: 14, inferior: 14 }).ancho, 176.9);
});

test("los cinco formatos incluyen el margen de anillado en todas las paginas", async () => {
  const documents = await documentosImpresionPrueba({ cantidad: 40 });
  assert.equal(Object.keys(documents).length, 5);
  for (const [format, html] of Object.entries(documents)) {
    assert.match(html, /@page\s*\{\s*size: letter portrait; margin: \d+mm \d+mm \d+mm 25mm;\s*\}/, format);
    assert.doesNotMatch(html, /207\.9mm|271\.4mm|8\.14in|10\.62in/, format);
    assert.match(html, /ESTUDIANTE 01 FLORES VARGAS/, format);
    if (format !== "materiales") assert.match(html, /ESTUDIANTE 40 FLORES VARGAS/, format);
  }
  assert.match(documents.asistencia, /grid-template-columns: minmax\(0, 2\.85fr\)/);
  assert.match(documents.notas, /width: 180\.9mm/);
  assert.match(documents.boletin, /width: 180\.9mm/);
  assert.match(documents.boletin, /\.subject-head, th\.term-average \{ height: 9mm/);
  assert.doesNotMatch(documents.boletin, /\.subject-head, \.term-average \{ height:/);
  assert.match(documents.informes, /margin: 0mm 20mm 0mm 25mm/);
});

test("boletin usa letra legible, nombres completos y solo las filas de alumnos existentes", async () => {
  const { boletin } = await documentosImpresionPrueba({ cantidad: 8, nombres: ["SOLIZ MORALES ALESSANDRO FABRICIO"] });
  assert.equal((boletin.match(/class="bulletin-print-page /g) || []).length, 1);
  assert.equal((boletin.match(/class="student-name"/g) || []).length, 8);
  assert.match(boletin, /font-size: 12pt/);
  assert.match(boletin, /font-size: 11\.5pt !important/);
  assert.match(boletin, /font-family: Arial, sans-serif/);
  assert.doesNotMatch(boletin, /Arial Narrow/);
  assert.doesNotMatch(boletin, /td\.three-digit\s*\{[^}]*font-size/);
  assert.match(boletin, /white-space: normal; overflow-wrap: anywhere/);
  assert.match(boletin, /SOLIZ MORALES ALESSANDRO FABRICIO/);
  assert.doesNotMatch(boletin, /\.bulletin-print-page\s*\{[^}]*overflow: hidden/);
  assert.doesNotMatch(boletin, /font-size: (?:[3-6](?:\.\d+)?)pt/);
  assert.match(boletin, /class="term-start term-t1 low-grade">48/);
  assert.match(boletin, /class="term-start term-t1 three-digit">100/);
});

test("boletin divide cursos grandes en hojas carta sin reducir la letra ni reiniciar la lista", async () => {
  const { boletin } = await documentosImpresionPrueba({ cantidad: 40 });
  assert.equal((boletin.match(/class="bulletin-print-page /g) || []).length, 5);
  assert.equal((boletin.match(/class="student-name"/g) || []).length, 40);
  assert.match(boletin, /HOJA 5 DE 5/);
  assert.match(boletin, /<td rowspan="3">9<\/td><td class="student-name" rowspan="3">ESTUDIANTE 09/);
  assert.match(boletin, /<td rowspan="3">40<\/td><td class="student-name" rowspan="3">ESTUDIANTE 40/);
});

test("tres trimestres se distribuyen por alumno sin mezclar notas ni salir de carta vertical", async () => {
  const { boletin } = await documentosImpresionPrueba({ cantidad: 16, notasPorTrimestre: { t1: 50, t2: 70, t3: 90 } });
  assert.match(boletin, /size: letter portrait/);
  assert.doesNotMatch(boletin, /landscape|carta horizontal/);
  assert.equal((boletin.match(/class="bulletin-print-page /g) || []).length, 2);
  assert.equal((boletin.match(/class="trimester-label term-t[123]"/g) || []).length, 48);
  const student = boletin.match(/<tbody class="student-group">([\s\S]*?)<\/tbody>/)[1];
  assert.equal((student.match(/<tr>/g) || []).length, 3);
  assert.match(student, /term-start term-t1 low-grade">50/);
  assert.match(student, /term-start term-t2">70/);
  assert.match(student, /term-start term-t3">90/);
  assert.match(student, /class="summary-cell" rowspan="3">70/);
  assert.match(boletin, /\.student-group \{ break-inside: avoid; page-break-inside: avoid; \}/);
});

test("uno o dos trimestres conservan carta vertical sin comprimir la tipografia", async () => {
  for (const trimestres of [["t2"], ["t1", "t3"]]) {
    const { boletin } = await documentosImpresionPrueba({ cantidad: 23, trimestres });
    assert.match(boletin, /size: letter portrait/);
    assert.match(boletin, /width: 180\.9mm/);
    const pages = trimestres.length === 1 ? 2 : 3;
    assert.equal((boletin.match(/class="bulletin-print-page /g) || []).length, pages);
    assert.equal((boletin.match(/class="student-name"/g) || []).length, 23);
    assert.ok(boletin.includes(`HOJA ${pages} DE ${pages}`));
    assert.match(boletin, /class="student-name"(?: rowspan="2")?>ESTUDIANTE 23/);
  }
});

test("dos trimestres mantienen sus etiquetas reales y el promedio acumulado", async () => {
  const { boletin } = await documentosImpresionPrueba({ cantidad: 1, trimestres: ["t1", "t3"], notasPorTrimestre: { t1: 50, t3: 90 } });
  const student = boletin.match(/<tbody class="student-group">([\s\S]*?)<\/tbody>/)[1];
  assert.equal((student.match(/<tr>/g) || []).length, 2);
  assert.match(student, /term-t1">1°/);
  assert.match(student, /term-t3">3°/);
  assert.doesNotMatch(student, /term-t2/);
  assert.match(student, /class="summary-cell" rowspan="2">70/);
  assert.match(boletin, /PROM\. ACUM\./);
});

test("registro conserva su tabla en carta vertical y aprovecha parte del ancho de nombres para las notas", async () => {
  const { notas } = await documentosImpresionPrueba({ cantidad: 16 });
  assert.equal((notas.match(/class="print-page /g) || []).length, 1);
  assert.match(notas, /size: letter portrait/);
  assert.match(notas, /html \{ --print-font-increase: 1\.5pt; \}/);
  assert.match(notas, /\.student-name \{ --print-font-increase: 1pt;/);
  assert.match(notas, /font-size: calc\(8\.4px \+ var\(--print-font-increase\)\)/);
  assert.match(notas, /font-size: calc\(7\.4px \+ var\(--print-font-increase\)\)/);
  assert.match(notas, /font-size: calc\(6\.6px \+ var\(--print-font-increase\)\)/);
  assert.ok([...notas.matchAll(/font-size: ([^;]+);/g)].every((match) => match[1].includes("var(--print-font-increase)")));
  assert.match(notas, /\.col-name \{ width: 24\.5%; \}/);
  assert.match(notas, /\.col-note \{ width: calc\(\(100% - 2\.6% - 24\.5% - 3% - 3% - 5\.9%\) \/ var\(--regular-note-count\)\); \}/);
  assert.match(notas, /SER\/10/);
  assert.match(notas, /SABER\/45/);
  assert.match(notas, /HACER\/40/);
  assert.match(notas, /AUTOEVALUACION/);
  assert.match(notas, /CALIFICACION TRIMESTRAL/);
  assert.match(notas, /writing-mode: vertical-rl/);
  assert.doesNotMatch(notas, /activity-key|data-part=|PARTE \d+ DE/);
});

test("registro omite columnas de relleno en SABER sin eliminar actividades calificadas", async () => {
  for (const count of [0, 1, 2, 3]) {
    const activities = Array.from({ length: count }, (_, index) => ({ id: `s${index}`, materiaId: "matematica", tipo: "examen", titulo: `Saber ${index + 1}` }));
    const gradesList = activities.map((activity) => ({ actividadId: activity.id, alumnoId: "alumno_1", nota: 80 }));
    const { notas } = await documentosImpresionPrueba({ cantidad: 1, registro: { activities, gradesList } });
    assert.equal((notas.match(/<th class="vertical activity-head saber-col/g) || []).length, count);
    assert.ok(notas.includes(`<th colspan="${count + 2}" class="group saber-group">SABER/45</th>`));
    for (const activity of activities) assert.ok(notas.includes(activity.titulo));
    const firstRow = notas.match(/<tbody>\s*<tr>([\s\S]*?)<\/tr>/)[1];
    assert.equal((firstRow.match(/<td[^>]*>80<\/td>/g) || []).length, count);
  }
});

test("registro muestra el escudo completo y mas visible dentro de su recuadro original", async () => {
  const { notas } = await documentosImpresionPrueba({ cantidad: 16 });
  assert.match(notas, /rowspan="2" class="school-block"/);
  assert.match(notas, /images\/logo-nueva-bolivia\.png/);
  assert.match(notas, /width: 72px; height: 72px; object-fit: contain/);
  assert.match(notas, /\.print-dense \.school-block img \{ width: 64px; height: 64px; \}/);
  assert.match(notas, /\.print-ultra \.school-block img \{ width: 60px; height: 60px; \}/);
});

test("registro mantiene actividades y puntajes en su posicion original sin dividir columnas", async () => {
  const activities = [
    { id: "ser", materiaId: "matematica", tipo: "ser", titulo: "Respeta y colabora" },
    ...Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, materiaId: "matematica", tipo: "examen", titulo: `Actividad Saber ${i + 1}` })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `h${i}`, materiaId: "matematica", tipo: "tarea", titulo: `Actividad Hacer ${i + 1}` })),
    { id: "auto", materiaId: "matematica", tipo: "auto" }
  ];
  const gradesList = activities.map((activity) => ({ actividadId: activity.id, alumnoId: "alumno_1", nota: activity.id === "h9" ? 48 : 100 }));
  const { notas } = await documentosImpresionPrueba({ cantidad: 1, registro: { activities, gradesList, values: { ser10: 8, saber45: 21, hacer40: 16, auto5: 4, final: 49 } } });
  assert.equal((notas.match(/class="print-page /g) || []).length, 1);
  for (const activity of activities.filter((item) => item.titulo)) assert.ok(notas.includes(activity.titulo));
  const firstRow = notas.match(/<tbody>\s*<tr>([\s\S]*?)<\/tr>/)[1];
  const values = [...firstRow.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1].trim());
  assert.deepEqual(values, ["1", "ESTUDIANTE 01 FLORES VARGAS", "100", "100", "100", "100", "100", "8", ...Array(11).fill("100"), "75", "21", ...Array(9).fill("100"), "48", "75", "16", "100", "4", "45", "49", "REPROBADO"]);
});

test("registro conserva 40 filas por hoja y los nombres escapados", async () => {
  const { notas } = await documentosImpresionPrueba({ cantidad: 41, nombres: ["NOMBRE <ALUMNO> & FAMILIA"] });
  const sheets = [...notas.matchAll(/<section class="print-page [\s\S]*?<\/section>/g)].map((match) => match[0]);
  assert.equal(sheets.length, 2);
  for (const sheet of sheets) assert.equal((sheet.match(/class="student-name"/g) || []).length, 40);
  assert.match(notas, /NOMBRE &lt;ALUMNO&gt; &amp; FAMILIA/);
  assert.doesNotMatch(notas, /<ALUMNO>/);
  assert.match(sheets[1], /<td>41<\/td>/);
});
