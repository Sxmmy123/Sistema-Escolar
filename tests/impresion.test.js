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
  assert.match(notas, /\.col-name \{ width: 24\.5%; \}/);
  assert.match(notas, /\.col-note \{ width: calc\(\(100% - 2\.6% - 24\.5% - 3% - 3% - 8%\) \/ var\(--regular-note-count\)\); \}/);
  assert.match(notas, /SER\/10/);
  assert.match(notas, /SABER\/45/);
  assert.match(notas, /HACER\/40/);
  assert.match(notas, /Autoevaluacion/);
  assert.match(notas, /<span>CALIFICACION<\/span><span>TRIMESTRAL<\/span>/);
  assert.match(notas, /writing-mode: vertical-rl/);
  assert.doesNotMatch(notas, /scaleX|data-part=|PARTE \d+ DE/);
  assert.doesNotMatch(notas, /overflow: hidden|max-height:/);
  assert.match(notas, /cell\.style\.fontSize =/);
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
  assert.match(notas, /width: 104px; height: 104px; object-fit: contain/);
  assert.match(notas, /\.print-dense \.school-block img \{ width: 96px; height: 96px; \}/);
  assert.match(notas, /\.print-ultra \.school-block img \{ width: 88px; height: 88px; \}/);
  assert.match(notas, /print-color-adjust: exact; -webkit-print-color-adjust: exact/);
});

test("el escudo del registro usa la carpeta publicada de GitHub Pages y no la raiz del dominio", async () => {
  const { notas } = await documentosImpresionPrueba({
    cantidad: 1, baseUrl: "./", ubicacion: "https://sxmmy123.github.io/Sistema-Escolar/#/docente/notas"
  });
  assert.match(notas, /src="https:\/\/sxmmy123\.github\.io\/Sistema-Escolar\/images\/logo-nueva-bolivia\.png"/);
  assert.doesNotMatch(notas, /github\.io\.\/images|src="https:\/\/sxmmy123\.github\.io\/images/);
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

test("registro conserva 40 renglones por hoja y continua la numeracion sin omitir alumnos", async () => {
  const { notas } = await documentosImpresionPrueba({ cantidad: 41, nombres: ["NOMBRE <ALUMNO> & FAMILIA"] });
  const sheets = [...notas.matchAll(/<section class="print-page [\s\S]*?<\/section>/g)].map((match) => match[0]);
  assert.equal(sheets.length, 2);
  assert.equal((sheets[0].match(/class="student-name"/g) || []).length, 40);
  assert.equal((sheets[1].match(/class="student-name"/g) || []).length, 40);
  assert.equal((sheets[1].match(/class="empty-student-row"/g) || []).length, 39);
  assert.doesNotMatch(notas, /&nbsp;/);
  assert.match(notas, /NOMBRE &lt;ALUMNO&gt; &amp; FAMILIA/);
  assert.doesNotMatch(notas, /<ALUMNO>/);
  assert.match(sheets[1], /<td>41<\/td>/);
  assert.match(sheets[1], /<td>80<\/td>/);
});

test("registro completa la lista hasta 40 con nombres y notas en blanco, sin inventar alumnos", async () => {
  const { notas } = await documentosImpresionPrueba({ cantidad: 16 });
  const body = notas.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  assert.equal((body.match(/<tr[ >]/g) || []).length, 40);
  const blanks = [...body.matchAll(/<tr class="empty-student-row">([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
  assert.equal(blanks.length, 24);
  assert.match(blanks[0], /^<td>17<\/td><td class="student-name"><\/td>/);
  assert.match(blanks.at(-1), /^<td>40<\/td>/);
  for (const row of blanks) {
    assert.equal((row.match(/<td[^>]*>[^<]+<\/td>/g) || []).length, 1);
    assert.doesNotMatch(row, /score|APROBADO|REPROBADO/);
  }
});

test("registro no inventa columnas vacias en SER ni HACER", async () => {
  for (const count of [0, 1, 2, 4]) {
    const activities = Array.from({ length: count }, (_, index) => ({ id: `h${index}`, materiaId: "matematica", tipo: "tarea", titulo: `Hacer ${index + 1}` }));
    const gradesList = activities.map((activity) => ({ actividadId: activity.id, alumnoId: "alumno_1", nota: 85 }));
    const { notas } = await documentosImpresionPrueba({ cantidad: 1, registro: { activities, gradesList } });
    assert.equal((notas.match(/<th class="vertical activity-head hacer-col/g) || []).length, count);
    assert.doesNotMatch(notas, /<th class="vertical activity-head ser-col/);
    assert.ok(notas.includes(`<th colspan="${count + 2}" class="group hacer-group">HACER/40</th>`));
    assert.match(notas, /<th colspan="5" class="group ser-group">SER\/10<\/th>/);
  }
});

test("registro muestra cada titulo completo dentro de su propia columna y sin claves ni referencias", async () => {
  const title = `${"Actividad extensa de lectura y analisis. ".repeat(12)}<texto> & material`;
  const activities = [{ id: "s1", materiaId: "matematica", tipo: "examen", titulo: title }];
  const gradesList = [{ actividadId: "s1", alumnoId: "alumno_1", nota: 92 }];
  const { notas } = await documentosImpresionPrueba({ cantidad: 1, registro: { activities, gradesList } });
  assert.match(notas, /<th class="vertical activity-head saber-col section-start"><span class="vertical-text activity-title">Actividad extensa/);
  assert.ok(notas.includes(title.replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("& material", "&amp; material")));
  assert.doesNotMatch(notas, /<texto>/);
  assert.doesNotMatch(notas, /activity-reference-page|activity-key|data-activity-code|data-key-code|ACTIVIDADES EVALUADAS/);
  assert.match(notas, /--activity-header-height/);
});

test("registro ordena los metadatos y distingue subtotal de nota final sin cambiar sus valores", async () => {
  const { notas } = await documentosImpresionPrueba({ cantidad: 1, registro: { values: { ser10: 10, saber45: 40, hacer40: 35, auto5: 4, final: 89 } } });
  assert.match(notas, /class="record-meta"/);
  assert.match(notas, /<strong>NIVEL:<\/strong>/);
  assert.match(notas, /<strong>AREA:<\/strong>/);
  assert.match(notas, /Subtotal \/95/);
  assert.match(notas, /Nota final \/100/);
  assert.match(notas, /Subtotal \/95 \+ Autoevaluacion \/5 = Nota final \/100/);
  assert.match(notas, /class="total-score">85<\/td>/);
  assert.match(notas, /class="final-ok">89<\/td>/);
  assert.match(notas, /min-height: calc\(259\.4mm - 1px\)/);
  assert.match(notas, /\.signatures \{ margin-top: auto;/);
  assert.match(notas, /padding: 24px 34px 0/);
});

test("registro aumenta un punto el alto de las filas sin modificar los encabezados ni la letra", async () => {
  const { notas } = await documentosImpresionPrueba({ cantidad: 40 });
  assert.match(notas, /tbody td \{ height: calc\(12px \+ 1pt\); \}/);
  assert.match(notas, /\.print-dense tbody td \{ height: calc\(11px \+ 1pt\); \}/);
  assert.match(notas, /\.print-ultra tbody td \{ height: calc\(10px \+ 1pt\); \}/);
  assert.match(notas, /th, td \{[^}]*height: 12px;/);
  assert.match(notas, /html \{ --print-font-increase: 1\.5pt; \}/);
  assert.equal((notas.match(/class="student-name"/g) || []).length, 40);
});

test("registro imprime el trimestre seleccionado que envia el modulo de notas", async () => {
  const { notas } = await documentosImpresionPrueba({ cantidad: 1, registro: { trimesterLabel: undefined, selectedTrimesterLabel: "2do trimestre" } });
  assert.match(notas, /2026 &middot; 2DO TRIMESTRE/);
});
