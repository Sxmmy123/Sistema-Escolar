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
  assert.match(documents.boletin, /\.subject-head, th\.term-average \{ height: 12mm/);
  assert.doesNotMatch(documents.boletin, /\.subject-head, \.term-average \{ height:/);
  assert.match(documents.informes, /margin: 0mm 20mm 0mm 25mm/);
});

test("boletin usa letra legible, nombres completos y solo las filas de alumnos existentes", async () => {
  const { boletin } = await documentosImpresionPrueba({ cantidad: 8, nombres: ["SOLIZ MORALES ALESSANDRO FABRICIO"] });
  assert.equal((boletin.match(/class="bulletin-print-page /g) || []).length, 1);
  assert.equal((boletin.match(/class="student-name"/g) || []).length, 8);
  assert.match(boletin, /font-size: 10pt/);
  assert.match(boletin, /font-size: 9\.5pt !important/);
  assert.match(boletin, /white-space: normal; overflow-wrap: anywhere/);
  assert.match(boletin, /SOLIZ MORALES ALESSANDRO FABRICIO/);
  assert.doesNotMatch(boletin, /\.bulletin-print-page\s*\{[^}]*overflow: hidden/);
  assert.doesNotMatch(boletin, /font-size: (?:[3-6](?:\.\d+)?)pt/);
  assert.match(boletin, /class="term-start term-t1 low-grade">48/);
  assert.match(boletin, /class="term-start term-t1 three-digit">100/);
});

test("boletin divide cursos grandes en hojas carta sin reducir la letra ni reiniciar la lista", async () => {
  const { boletin } = await documentosImpresionPrueba({ cantidad: 40 });
  assert.equal((boletin.match(/class="bulletin-print-page /g) || []).length, 4);
  assert.equal((boletin.match(/class="student-name"/g) || []).length, 40);
  assert.match(boletin, /HOJA 4 DE 4/);
  assert.match(boletin, /<td rowspan="3">11<\/td><td class="student-name" rowspan="3">ESTUDIANTE 11/);
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

test("uno o dos trimestres conservan carta vertical con paginacion de 22 alumnos", async () => {
  for (const trimestres of [["t2"], ["t1", "t3"]]) {
    const { boletin } = await documentosImpresionPrueba({ cantidad: 23, trimestres });
    assert.match(boletin, /size: letter portrait/);
    assert.match(boletin, /width: 180\.9mm/);
    assert.equal((boletin.match(/class="bulletin-print-page /g) || []).length, 2);
    assert.equal((boletin.match(/class="student-name"/g) || []).length, 23);
    assert.match(boletin, /HOJA 2 DE 2/);
    assert.match(boletin, /<td>23<\/td><td class="student-name">ESTUDIANTE 23/);
  }
});
