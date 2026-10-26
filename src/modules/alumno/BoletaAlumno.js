import { icon } from "../../ui/dom.js";

const e = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const tone = (value) => value === null ? "is-pending" : value <= 50 ? "is-low" : "is-positive";
const score = (value) => value === null ? '<span class="student-bulletin-pending" aria-label="Pendiente">-</span>' : String(value);

function detailRow(row, term, grade) {
  const dimensions = [["SER", grade.ser10, 10], ["SABER", grade.saber45, 45], ["HACER", grade.hacer40, 40], ["Auto", grade.auto5, 5], ["Final", grade.final, 100]];
  return `<tr class="student-bulletin-detail"><td colspan="5"><section id="student-bulletin-detail" aria-label="Desglose de ${e(row.subjectName)}, ${e(term.label)}"><h3>${e(row.subjectName)} · ${e(term.label)}</h3><dl>${dimensions.map(([name, value, maximum]) => `<div><dt>${name} <span>/${maximum}</span></dt><dd>${value}</dd></div>`).join("")}</dl></section></td></tr>`;
}

function annualTable(bulletin, selection) {
  const terms = bulletin.terms;
  const rows = bulletin.rows.map((row) => {
    let detail = "";
    const cells = terms.map((term) => {
      const grade = row.terms[term.id], key = `${row.subjectId}:${term.id}`, active = key === selection;
      if (!grade) return `<td>${score(null)}</td>`;
      if (active) detail = detailRow(row, term, grade);
      return `<td><button type="button" class="student-bulletin-score ${tone(grade.final)} ${active ? "is-selected" : ""}" data-student-grade-detail="${key}" aria-label="Ver desglose de ${e(row.subjectName)}, ${e(term.label)}" aria-expanded="${active}" ${active ? 'aria-controls="student-bulletin-detail"' : ""}><span>${grade.final}</span>${icon(active ? "chevron-up" : "chevron-down", "h-3 w-3")}</button></td>`;
    }).join("");
    return `<tr><th scope="row" class="student-bulletin-subject" style="--subject-color:${row.color}">${e(row.subjectName)}</th>${cells}<td class="student-bulletin-average ${tone(row.average)}">${score(row.average)}</td></tr>${detail}`;
  }).join("");
  return `<table><colgroup><col class="student-bulletin-subject-column"><col><col><col><col></colgroup><thead><tr><th scope="col">Materia</th>${terms.map((term, index) => `<th scope="col">${index === 0 ? "1er" : index === 1 ? "2do" : "3er"}<span>trimestre</span></th>`).join("")}<th scope="col">Promedio</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th scope="row">Promedio general</th>${terms.map((term) => `<td class="${tone(term.average)}">${score(term.average)}</td>`).join("")}<td class="student-bulletin-total ${tone(bulletin.average)}" data-student-overall-average>${score(bulletin.average)}</td></tr></tfoot></table>`;
}

function trimesterTable(bulletin, term) {
  const dimensions = [["SER", "ser10", 10], ["SABER", "saber45", 45], ["HACER", "hacer40", 40], ["Auto", "auto5", 5], ["Final", "final", 100]];
  const rows = bulletin.rows.map((row) => {
    const grade = row.terms[term.id];
    return `<tr><th scope="row" class="student-bulletin-subject" style="--subject-color:${row.color}">${e(row.subjectName)}</th>${dimensions.map(([, key]) => `<td class="${key === "final" ? `student-bulletin-average ${tone(grade?.final ?? null)}` : ""}">${score(grade?.[key] ?? null)}</td>`).join("")}</tr>`;
  }).join("");
  return `<table class="student-bulletin-term-table" aria-label="Notas del ${e(term.label)}"><colgroup><col class="student-bulletin-subject-column"><col><col><col><col><col></colgroup><thead><tr><th scope="col">Materia</th>${dimensions.map(([label, , maximum]) => `<th scope="col">${label}<span>/${maximum}</span></th>`).join("")}</tr></thead><tbody>${rows}</tbody><tfoot><tr><th scope="row" colspan="5">Promedio del trimestre</th><td class="student-bulletin-total ${tone(term.average)}" data-student-term-average>${score(term.average)}</td></tr></tfoot></table>`;
}

export function BoletaAlumno(data, view = data.trimesterId || "t1", selection = "") {
  const bulletin = data.annualBulletin;
  if (!bulletin) return "";
  const term = bulletin.terms.find((item) => item.id === view) || bulletin.terms[0];
  const annual = view === "total", activeView = annual ? "total" : term.id;
  const options = [...bulletin.terms.map((item) => ({ id: item.id, label: item.label })), { id: "total", label: "Promedio total" }];
  const status = annual
    ? bulletin.average === null ? "Sin notas" : bulletin.partial ? "Promedio parcial" : "3 trimestres con notas"
    : term.average === null ? "Sin notas" : "";
  return `<section class="student-bulletin" aria-label="Boleta del alumno"><header class="student-bulletin-heading"><h2>Boleta</h2>${status ? `<span class="student-bulletin-status ${annual && !bulletin.partial && bulletin.average !== null ? "is-complete" : ""}">${status}</span>` : ""}</header><div class="student-bulletin-views" role="group" aria-label="Vista de boleta">${options.map((option) => `<button type="button" data-student-bulletin-view="${option.id}" aria-pressed="${option.id === activeView}">${e(option.label)}</button>`).join("")}</div><div class="student-bulletin-scroll">${annual ? annualTable(bulletin, selection) : trimesterTable(bulletin, term)}</div></section>`;
}
