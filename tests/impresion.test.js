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

test("registro por materia usa letra de 12 puntos sin compresion ni filas de relleno", async () => {
  const { notas } = await documentosImpresionPrueba({ cantidad: 1, nombres: ["SOLIZ MORALES ALESSANDRO FABRICIO"] });
  assert.match(notas, /font-size: 12pt/);
  assert.match(notas, /font-size: 11\.5pt/);
  assert.match(notas, /font-family: Arial, sans-serif/);
  assert.doesNotMatch(notas, /Arial Narrow|print-dense|print-ultra|font-size: [\d.]+px|overflow: hidden/);
  const sheets = [...notas.matchAll(/<section class="print-page"[\s\S]*?<\/section>/g)].map((match) => match[0]);
  assert.equal(sheets.length, 2);
  for (const sheet of sheets) {
    assert.equal((sheet.match(/class="student-name"/g) || []).length, 1);
    assert.match(sheet, /SOLIZ MORALES ALESSANDRO FABRICIO/);
    assert.ok((sheet.match(/class="column-label /g) || []).length <= 8);
  }
});

test("registro conserva todas las actividades, sus notas y los puntajes al repartir columnas", async () => {
  const activities = [
    ...Array.from({ length: 11 }, (_, index) => ({ id: `s${index + 1}`, materiaId: "matematica", tipo: "examen", titulo: `Saber: actividad ${index + 1}` })),
    ...Array.from({ length: 10 }, (_, index) => ({ id: `h${index + 1}`, materiaId: "matematica", tipo: "tarea", titulo: `Hacer: actividad ${index + 1}` })),
    { id: "ser", materiaId: "matematica", tipo: "ser", titulo: "Colabora y respeta a sus companeros" },
    { id: "auto", materiaId: "matematica", tipo: "auto", titulo: "Autoevaluacion" }
  ];
  const gradesList = activities.map((activity) => ({ actividadId: activity.id, alumnoId: "alumno_1", nota: activity.id === "h10" ? 48 : 100 }));
  const { notas } = await documentosImpresionPrueba({ cantidad: 1, registro: { activities, gradesList, values: { ser10: 8, saber45: 21, hacer40: 16, auto5: 4, final: 49 } } });
  for (const activity of activities.filter((item) => item.tipo !== "auto")) {
    assert.ok(notas.includes(escapeForTest(activity.titulo)), activity.id);
    assert.equal((notas.match(new RegExp(`<td data-column="${activity.id}"`, "g")) || []).length, 1, activity.id);
  }
  assert.match(notas, /data-column="s11" class="">100/);
  assert.match(notas, /data-column="h10" class="low-note">48/);
  assert.match(notas, /data-column="ser10" class="score">8/);
  assert.match(notas, /data-column="saber45" class="score">21/);
  assert.match(notas, /data-column="hacer40" class="score">16/);
  assert.match(notas, /data-column="auto5" class="score">4/);
  assert.match(notas, /data-column="total" class="score">45/);
  assert.match(notas, /data-column="final" class="final-score result-low">49/);
  assert.match(notas, /data-column="status" class="status result-low">REPROBADO/);
});

test("registro repite la numeracion y el alumno correcto en cada parte sin cortar el curso", async () => {
  const { notas } = await documentosImpresionPrueba({ cantidad: 25 });
  const sheets = [...notas.matchAll(/<section class="print-page"[\s\S]*?<\/section>/g)].map((match) => match[0]);
  assert.equal(sheets.length, 6);
  for (const part of [1, 2]) {
    const section = sheets.filter((sheet) => sheet.includes(`data-part="${part}"`)).join("");
    for (let number = 1; number <= 25; number += 1) assert.equal((section.match(new RegExp(`<td>${number}<\\/td><td class="student-name">`, "g")) || []).length, 1);
  }
  assert.match(notas, /HOJA 6 DE 6/);
});

test("registro conserva titulos y nombres con caracteres especiales sin insertar HTML", async () => {
  const activities = [{ id: "larga", materiaId: "matematica", tipo: "examen", titulo: 'Comparar <cantidades> & "resultados" '.repeat(6) }];
  const { notas } = await documentosImpresionPrueba({ cantidad: 1, nombres: ["NOMBRE <ALUMNO> & FAMILIA"], registro: { activities, gradesList: [{ actividadId: "larga", alumnoId: "alumno_1", nota: 87 }] } });
  assert.match(notas, /NOMBRE &lt;ALUMNO&gt; &amp; FAMILIA/);
  assert.ok(notas.includes(escapeForTest(activities[0].titulo)));
  assert.doesNotMatch(notas, /<cantidades>|<ALUMNO>/);
  assert.match(notas, /data-column="larga" class="">87/);
});

function escapeForTest(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
