import { firmaRegistrosInicial, trimestresInicial } from "../../services/modeloInicial.js";
import { e, icon } from "./ComponentesInicial.js";

export function recopilarInformesCursoInicial(students, recordsByTerm) {
  return [...students].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((student) => ({
    student,
    informes: Object.fromEntries(trimestresInicial.map((term) => {
      const records = recordsByTerm[term.id] || [];
      const report = records.find((item) => item.tipo === "informe" && item.alumnoId === student.id && item.aprobado);
      const valid = report && report.fuentesFirma === firmaRegistrosInicial(records, student.id) && typeof report.descripcion === "string" && report.descripcion.trim() && report.descripcion.length <= 200;
      return [term.id, valid ? report.descripcion : ""];
    }))
  }));
}

export function selectorImpresionInformesInicial(rows) {
  return `<div class="initial-print-selection-heading"><label><input type="checkbox" data-initial-print-all checked>Todos los alumnos</label><span data-initial-print-count>${rows.length}/${rows.length} seleccionados</span></div><div class="initial-print-student-grid">${rows.map(({ student, informes }) => `<label><input type="checkbox" data-initial-print-student="${e(student.id)}" checked><span>${e(student.nombre)}<small>${Object.values(informes).filter(Boolean).length}/3 informes aprobados</small></span></label>`).join("")}</div><div class="initial-dialog-actions"><button type="button" class="initial-button" data-initial-cancel-term>Cancelar</button><button type="button" class="initial-button is-primary" data-initial-confirm-print>${icon("printer")}Imprimir informes</button></div>`;
}

function nombreEnLineas(nombre) {
  return String(nombre || "").trim().split(/\s+/).filter(Boolean).map((word) => `<span>${e(word)}</span>`).join("");
}

export function documentoInformesCursoInicial({ rows, course, year, teacher }) {
  if (!rows?.length) throw new Error("Selecciona al menos un alumno para imprimir.");
  if (rows.some((row) => trimestresInicial.some((term) => String(row.informes[term.id] || "").length > 200))) throw new Error("Los informes no pueden superar 200 caracteres.");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informes trimestrales - ${e(course.nombre)}</title><style>
@page{size:letter portrait;margin:0 20mm}
*{box-sizing:border-box}
body{font-family:Arial,sans-serif;color:#172d21;margin:0;font-size:10pt;line-height:1.5}
header{text-align:center;margin-bottom:14px}
h1{font-size:16pt;margin:3px 0}
header p{margin:3px 0}
.context{display:flex;justify-content:space-between;gap:16px;margin:12px 0 0}
table{width:100%;table-layout:fixed;border-collapse:collapse}
col.number{width:4%}col.student{width:15%}col.term{width:27%}
th,td{border:1px solid #617167;padding:8px;vertical-align:top;overflow-wrap:anywhere}
/* El espacio vertical se repite dentro de la tabla, sin fecha ni URL del navegador. */
thead{display:table-header-group}
thead th{background:#edf3ee;text-align:center;font-size:10pt}
thead .report-heading{border:0;padding:20mm 0 14px;background:#fff;font-weight:400}
tfoot{display:table-footer-group}
tfoot td{height:20mm;padding:0;border:0}
tbody th{font-weight:400;text-align:left}
.report-student{font-size:9.5pt;line-height:1.4;vertical-align:middle}
.report-student span{display:block}
tr{break-inside:avoid;page-break-inside:avoid}
.report-value{white-space:pre-wrap;text-align:justify;text-align-last:left;hyphens:auto}
.pending{color:#7d877f}
.report-number{text-align:center;vertical-align:middle;padding-inline:4px}
.signature-cell{border:0;padding:0}
footer{margin-top:36px;text-align:center;break-inside:avoid}
footer span{display:inline-block;border-top:1px solid #617167;padding:7px 36px}
@media screen{body{width:215.9mm;padding:0 20mm;margin:auto}}
</style></head><body><table><colgroup><col class="number"><col class="student">${trimestresInicial.map(() => '<col class="term">').join("")}</colgroup><thead><tr><td class="report-heading" colspan="5"><header><p>U.E. Ecologica Nueva Bolivia</p><h1>Informe trimestral cualitativo</h1><p>Educacion Inicial en Familia Comunitaria</p></header><div class="context"><span>Curso: ${e(course.nombre)}</span><span>Gestion: ${e(year)}</span></div></td></tr><tr><th scope="col">N</th><th scope="col">Apellidos y nombres</th>${trimestresInicial.map((term) => `<th scope="col">${e(term.label)}</th>`).join("")}</tr></thead><tbody>${rows.map(({ student, informes }, index) => `<tr><td class="report-number">${index + 1}</td><th scope="row" class="report-student" aria-label="${e(student.nombre)}">${nombreEnLineas(student.nombre)}</th>${trimestresInicial.map((term) => `<td class="report-value${informes[term.id] ? "" : " pending"}">${e(informes[term.id] || "Pendiente")}</td>`).join("")}</tr>`).join("")}<tr><td class="signature-cell" colspan="5"><footer><span>${e(teacher)}<br>Docente</span></footer></td></tr></tbody><tfoot><tr><td colspan="5" aria-hidden="true"></td></tr></tfoot></table></body></html>`;
}

export function imprimirInformesCursoInicial(payload) {
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Imprimir informes del curso");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;bottom:0;right:0";
  frame.onload = () => { frame.contentWindow.onafterprint = () => frame.remove(); frame.contentWindow.focus(); frame.contentWindow.print(); };
  frame.srcdoc = documentoInformesCursoInicial(payload);
  document.body.appendChild(frame);
}
