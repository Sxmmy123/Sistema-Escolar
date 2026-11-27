import { SUBJECTS } from "../../data/catalog.js";
import { icon } from "../../ui/dom.js";
import { TRIMESTERS } from "../../services/teacherData.js";
import { gestionActual } from "../../services/rutasFirestore.js";
import { formatoCarta } from "../../ui/impresion.js";
import {
  activityHasGrades,
  calculateStudentTerm,
  gradeByActivityAndStudent,
  studentActivityGrade
} from "./AcademicoDocente.js";
import { escapeHtml } from "./UtilidadesDocente.js";

const SCHOOL_NAME = "ECOLOGICA NUEVA BOLIVIA";
const SCHOOL_LEVEL = "PRIMARIA COMUNITARIA VOCACIONAL";
const DIRECTOR_NAME = "MSC. SAMUEL RONAL MENDOZA CALLE";

const SUBJECT_CODES = {
  matematica: "MAT",
  lenguaje: "LEN",
  ciencias_naturales: "CNA",
  ciencias_sociales: "CSO",
  educacion_fisica: "EFD",
  religion: "REL",
  musica: "MUS",
  artes_plasticas: "APV",
  tecnica_tecnologica: "TT"
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  if (!valid.length) return "";
  return Math.round(valid.reduce((total, value) => total + Number(value), 0) / valid.length);
}

function sortStudentsByName(students = []) {
  return [...students].sort((a, b) =>
    String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" }) ||
    Number(a.numeroLista || 9999) - Number(b.numeroLista || 9999)
  );
}

function courseInfo(course = {}) {
  const name = String(course.nombre || "").trim();
  if (!name) return { grade: "CURSO", parallel: "A" };
  if (name.toLowerCase().includes("inicial")) return { grade: normalizeText(name), parallel: "A" };
  const parts = name.split(/\s+/);
  return {
    grade: normalizeText(parts.slice(0, -1).join(" ") || name),
    parallel: normalizeText(parts.at(-1) || "A")
  };
}

function subjectFinal(student, subjectId, snapshot) {
  if (!snapshot) return "";
  const { activities = [], gradesList = [], attendanceRows = [] } = snapshot;
  const gradesMap = gradeByActivityAndStudent(gradesList);
  const subjectActivitiesAll = activities.filter((item) => item.materiaId === subjectId);
  const subjectActivities = subjectActivitiesAll
    .filter((item) => !item.interno && !["ser", "auto"].includes(item.tipo))
    .filter((item) => activityHasGrades(item, gradesMap));
  const serCriteria = subjectActivitiesAll
    .filter((item) => item.tipo === "ser")
    .filter((item) => gradesMap[item.id]?.[student.id]);
  const autoActivity = subjectActivitiesAll.find((item) => item.tipo === "auto") || null;
  const autoGrade = autoActivity ? gradesMap[autoActivity.id]?.[student.id]?.nota : null;
  if (!subjectActivities.length && !serCriteria.length && autoGrade == null) return "";
  const serExtraValues = serCriteria.map((item) => studentActivityGrade(item, student.id, gradesMap));
  return calculateStudentTerm(student, subjectActivities, gradesMap, attendanceRows, serExtraValues, autoGrade).final;
}

function gradeCell(value, extraClass = "", rowSpan = 1) {
  const span = rowSpan > 1 ? ` rowspan="${rowSpan}"` : "";
  if (value === "" || value == null) return `<td class="${extraClass}"${span}></td>`;
  const grade = Math.round(Number(value));
  const classes = [extraClass, grade <= 50 ? "low-grade" : "", grade === 100 ? "three-digit" : ""].filter(Boolean).join(" ");
  return `<td class="${classes}"${span}>${grade}</td>`;
}

function summaryLabel(trimesterIds) {
  if (trimesterIds.length === 3) return "PROM. ANUAL";
  if (trimesterIds.length === 2) return "PROM. ACUM.";
  return "PROM. TRIM.";
}

function bulletinSheet(payload, trimesterIds, { students, offset = 0, pageNumber = 1, pageCount = 1 }) {
  const subjects = SUBJECTS;
  const info = courseInfo(payload.course);
  const baseUrl = import.meta.env.BASE_URL || "/";
  const logoUrl = `${window.location.origin}${baseUrl}images/logo-nueva-bolivia.png`;
  const year = gestionActual();
  const subjectColumnCount = subjects.length + 1;
  const termCount = trimesterIds.length;
  const stackedTerms = termCount === 3;
  const noteColumnCount = stackedTerms ? subjectColumnCount : Math.max(1, termCount * subjectColumnCount);
  const nameWidth = termCount === 1 ? "38%" : termCount === 2 ? "29%" : "27%";

  return `
    <section class="bulletin-print-page terms-${termCount}" style="--note-columns:${noteColumnCount};--name-width:${nameWidth}">
      <header class="document-header">
        <div class="document-heading">
          <div class="school-brand">
            <img src="${escapeHtml(logoUrl)}" alt="Escudo">
            <div><small>UNIDAD EDUCATIVA</small><strong>${SCHOOL_NAME}</strong></div>
          </div>
          <div class="document-title">BOLETIN CENTRALIZADOR <span>GESTION: ${year} &nbsp; · &nbsp; HOJA ${pageNumber} DE ${pageCount}</span></div>
        </div>
        <div class="document-info">
          <div><b>NIVEL:</b> ${SCHOOL_LEVEL}</div>
          <div><b>CURSO:</b> ${escapeHtml(info.grade)} &nbsp; <b>PARALELO:</b> ${escapeHtml(info.parallel)}</div>
          <div><b>DIRECTOR(A):</b> ${DIRECTOR_NAME}</div>
          <div><b>MAESTRA(O):</b> ${escapeHtml(normalizeText(payload.teacherName || "DOCENTE"))}</div>
        </div>
      </header>

      <table class="bulletin-table">
        <colgroup>
          <col class="number-column"><col class="name-column">
          ${stackedTerms ? '<col class="trimester-column">' : ""}
          <col span="${noteColumnCount}" class="note-column"><col class="summary-column">
        </colgroup>
        <thead>
          ${stackedTerms ? `<tr>
            <th class="number-head">N°</th><th class="name-head">APELLIDOS Y NOMBRES</th>
            <th class="trimester-label-head">TRIM.</th>
            ${subjects.map((subject) => `<th class="subject-head" title="${escapeHtml(subject.nombre)}"><span>${escapeHtml(SUBJECT_CODES[subject.id] || subject.corto || subject.nombre.slice(0, 3))}</span></th>`).join("")}
            <th class="term-average"><span>PROM.</span></th>
            <th class="summary-head"><span>${summaryLabel(trimesterIds)}</span></th>
          </tr>` : `
          <tr>
            <th rowspan="2" class="number-head">N°</th>
            <th rowspan="2" class="name-head">APELLIDOS Y NOMBRES</th>
            ${trimesterIds.map((trimesterId) => {
              const trimester = TRIMESTERS.find((item) => item.id === trimesterId);
              return `<th colspan="${subjectColumnCount}" class="trimester-head term-${trimesterId}">${escapeHtml(normalizeText(trimester?.label || trimesterId))}</th>`;
            }).join("")}
            <th rowspan="2" class="summary-head"><span>${summaryLabel(trimesterIds)}</span></th>
          </tr>
          <tr>
            ${trimesterIds.map((trimesterId) => `
              ${subjects.map((subject, subjectIndex) => `<th class="subject-head term-${trimesterId} ${subjectIndex === 0 ? "term-start" : ""}" title="${escapeHtml(subject.nombre)}"><span>${escapeHtml(SUBJECT_CODES[subject.id] || subject.corto || subject.nombre.slice(0, 3))}</span></th>`).join("")}
              <th class="term-average term-${trimesterId}"><span>PROM.</span></th>
            `).join("")}
          </tr>`}
        </thead>
          ${students.map((student, rowIndex) => {
            const termAverages = [];
            const termRows = [];
            const termCells = trimesterIds.map((trimesterId) => {
              const snapshot = payload.snapshotsByTerm?.[trimesterId];
              const grades = subjects.map((subject) => subjectFinal(student, subject.id, snapshot));
              const termAverage = average(grades);
              if (termAverage !== "") termAverages.push(termAverage);
              termRows.push({ trimesterId, grades, termAverage });
              return `${grades.map((grade, subjectIndex) => gradeCell(grade, `${subjectIndex === 0 ? "term-start " : ""}term-${trimesterId}`)).join("")}${gradeCell(termAverage, `term-average term-${trimesterId}`)}`;
            }).join("");
            if (stackedTerms) return `<tbody class="student-group">${termRows.map(({ trimesterId, grades, termAverage }, termIndex) => `<tr>
              ${termIndex === 0 ? `<td rowspan="3">${offset + rowIndex + 1}</td><td class="student-name" rowspan="3">${escapeHtml(normalizeText(student.nombre))}</td>` : ""}
              <th scope="row" class="trimester-label term-${trimesterId}">${termIndex + 1}°</th>
              ${grades.map((grade, subjectIndex) => gradeCell(grade, `${subjectIndex === 0 ? "term-start " : ""}term-${trimesterId}`)).join("")}
              ${gradeCell(termAverage, `term-average term-${trimesterId}`)}
              ${termIndex === 0 ? gradeCell(average(termAverages), "summary-cell", 3) : ""}
            </tr>`).join("")}</tbody>`;
            return `<tbody class="student-group"><tr><td>${offset + rowIndex + 1}</td><td class="student-name">${escapeHtml(normalizeText(student.nombre))}</td>${termCells}${gradeCell(average(termAverages), "summary-cell")}</tr></tbody>`;
          }).join("")}
      </table>

      <div class="signatures">
        <div><span></span><strong>${DIRECTOR_NAME}</strong><small>DIRECTOR UNIDAD EDUCATIVA ECOLOGICA NUEVA BOLIVIA</small></div>
        <div><span></span><strong>${escapeHtml(normalizeText(payload.teacherName || "MAESTRA/O"))}</strong><small>MAESTRA/O RESPONSABLE DEL CURSO</small></div>
      </div>
    </section>
  `;
}

function printDocument(payload, trimesterIds) {
  const page = formatoCarta();
  const students = sortStudentsByName(payload.students || []);
  const studentsPerPage = trimesterIds.length === 3 ? 10 : 22;
  const pageCount = Math.max(1, Math.ceil(students.length / studentsPerPage));
  const sheets = Array.from({ length: pageCount }, (_, index) => bulletinSheet(payload, trimesterIds, {
    students: students.slice(index * studentsPerPage, (index + 1) * studentsPerPage),
    offset: index * studentsPerPage,
    pageNumber: index + 1,
    pageCount
  })).join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Boletín centralizador - ${escapeHtml(payload.course?.nombre || "Curso")}</title>
    <style>
      ${page.pagina}
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: "Arial Narrow", Arial, sans-serif; }
      .bulletin-print-page { width: ${page.ancho}mm; max-width: 100%; break-after: page; page-break-after: always; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .document-header { border: 1.4px solid #111; border-bottom: 0; break-inside: avoid; }
      .document-heading { display: grid; grid-template-columns: 42% 58%; min-height: 17mm; }
      .school-brand { display: flex; align-items: center; gap: 2mm; padding: 1.5mm 2mm; border-right: 1px solid #111; }
      .school-brand img { width: 13mm; height: 13mm; object-fit: contain; }
      .school-brand small { display: block; font-size: 8pt; font-weight: 700; }
      .school-brand strong { display: block; margin-top: .8mm; font-size: 10pt; line-height: 1.1; }
      .document-title { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5mm; padding: 1.5mm 2mm; text-align: center; font-size: 13pt; font-weight: 700; }
      .document-title span { font-size: 8.5pt; font-weight: 400; }
      .document-info { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #111; }
      .document-info > div { min-width: 0; padding: 1mm 2mm; font-size: 8pt; line-height: 1.15; overflow-wrap: anywhere; }
      .document-info > div:nth-child(odd) { border-right: 1px solid #111; }
      .document-info > div:nth-child(-n+2) { border-bottom: 1px solid #111; }
      .bulletin-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .bulletin-table th, .bulletin-table td { border: 1px solid #222; height: 8mm; padding: .3mm .25mm; text-align: center; vertical-align: middle; font-size: 10pt; font-weight: 400; line-height: 1.05; }
      .bulletin-table th { font-weight: 700; }
      .bulletin-table thead { display: table-header-group; }
      .bulletin-table tr { break-inside: avoid; page-break-inside: avoid; }
      .student-group { break-inside: avoid; page-break-inside: avoid; }
      .number-column { width: 3%; }
      .name-column { width: var(--name-width); }
      .summary-column { width: 6%; }
      .note-column { width: calc((100% - 3% - var(--name-width) - 6%) / var(--note-columns)); }
      .number-head, .name-head { background: #fff; font-size: 9pt; }
      .trimester-head { height: 6mm !important; font-size: 10pt !important; }
      .subject-head, th.term-average { height: 12mm !important; padding: .5mm 0; }
      .subject-head span, th.term-average span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); font-size: 8.5pt; white-space: nowrap; }
      .term-t1 { background: #fff; }
      .term-t2 { background: #f7f7f7; }
      .term-t3 { background: #f2f7f2; }
      .term-average { background: #fde7c8; }
      .term-start { border-left-width: 1.6px !important; }
      .summary-head { background: #dbeafe; padding: 0; }
      .summary-head span { display: block; font-size: 8pt; line-height: 1.2; overflow-wrap: normal; }
      .summary-cell { background: #e8f2ff; font-weight: 600 !important; }
      .student-name { padding-left: 1.2mm !important; text-align: left !important; white-space: normal; overflow-wrap: anywhere; font-size: 9.5pt !important; }
      .bulletin-table td.three-digit { padding-left: 0; padding-right: 0; font-size: 9pt; }
      .terms-1 .bulletin-table td { font-size: 11pt; }
      .terms-1 .subject-head, .terms-1 th.term-average { height: 7mm !important; }
      .terms-1 .subject-head span, .terms-1 th.term-average span { writing-mode: horizontal-tb; transform: none; font-size: 8.5pt; }
      .terms-3 .trimester-column { width: 6%; }
      .terms-3 .summary-column { width: 7%; }
      .terms-3 .note-column { width: calc((100% - 3% - 27% - 6% - 7%) / var(--note-columns)); }
      .terms-3 .bulletin-table td, .terms-3 .trimester-label { height: 6mm; font-size: 10.5pt; }
      .terms-3 .subject-head, .terms-3 th.term-average { height: 8mm !important; }
      .terms-3 .subject-head span, .terms-3 th.term-average span { writing-mode: horizontal-tb; transform: none; font-size: 8.5pt; }
      .terms-3 .student-group + .student-group { border-top: 1.6px solid #111; }
      .low-grade { color: #d71920; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 15mm; padding: 8mm 6mm 1mm; text-align: center; break-inside: avoid; page-break-inside: avoid; }
      .signatures span { display: block; width: 55mm; max-width: 100%; margin: 0 auto 1mm; border-top: 1px solid #111; }
      .signatures strong { display: block; font-size: 8.5pt; }
      .signatures small { display: block; margin-top: .7mm; font-size: 7pt; }
      @media print { body { width: ${page.ancho}mm; } .bulletin-print-page:last-child { break-after: auto; page-break-after: auto; } }
    </style></head><body>${sheets}<script>window.addEventListener("load",()=>{setTimeout(()=>{window.focus();window.print();},250);});</script></body></html>`;
  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) {
    alert("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta nuevamente.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export function openTeacherBulletinPrintModal(payload) {
  document.querySelector("[data-bulletin-print-modal]")?.remove();
  const termAvailable = (trimesterId) => Boolean(payload.snapshotsByTerm?.[trimesterId]);
  const defaultTermId = termAvailable(payload.activeTrimesterId)
    ? payload.activeTrimesterId
    : TRIMESTERS.find((trimester) => termAvailable(trimester.id))?.id || "";
  const hasAvailableTerm = TRIMESTERS.some((trimester) => termAvailable(trimester.id));
  const modal = document.createElement("div");
  modal.dataset.bulletinPrintModal = "true";
  modal.className = "fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/45 p-3 sm:p-5";
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="bulletin-print-title" class="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[.16em] text-school-green">Boletín centralizador</p>
          <h3 id="bulletin-print-title" class="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">Seleccione trimestre a imprimir</h3>
          <p class="mt-1 text-xs text-slate-500">${escapeHtml(payload.course?.nombre || "Curso")} · <span data-bulletin-print-layout>carta vertical</span></p>
        </div>
        <button type="button" data-close-bulletin-print title="Cerrar" class="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50">${icon("x", "h-4 w-4")}</button>
      </div>
      <div class="mt-4 grid gap-2">
        ${TRIMESTERS.map((trimester) => {
          const available = termAvailable(trimester.id);
          return `<label class="flex min-h-[54px] items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 transition has-[:checked]:border-school-green has-[:checked]:bg-green-50 ${available ? "cursor-pointer" : "cursor-not-allowed bg-slate-50 opacity-55"}">
            <input type="checkbox" data-bulletin-print-term="${trimester.id}" class="h-4 w-4 shrink-0 rounded accent-[#087B2B]" ${trimester.id === defaultTermId ? "checked" : ""} ${available ? "" : "disabled"}>
            <span class="min-w-0"><strong class="block text-sm font-semibold text-slate-800">${escapeHtml(trimester.label)}</strong><small class="mt-0.5 block text-[11px] leading-4 text-slate-500">${available ? "Incluir este trimestre en la hoja." : "Actualiza el boletín de este trimestre para poder imprimirlo."}</small></span>
          </label>`;
        }).join("")}
      </div>
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" data-close-bulletin-print class="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancelar</button>
        <button type="button" data-print-bulletin-confirm class="inline-flex items-center justify-center gap-2 rounded-xl bg-school-green px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-school-navy disabled:cursor-not-allowed disabled:opacity-50" ${hasAvailableTerm ? "" : "disabled"}>${icon("printer", "h-4 w-4")} Imprimir boletín</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => {
    document.removeEventListener("keydown", handleKeydown);
    modal.remove();
  };
  const handleKeydown = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", handleKeydown);
  modal.querySelectorAll("[data-close-bulletin-print]").forEach((button) => button.addEventListener("click", close));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  const printButton = modal.querySelector("[data-print-bulletin-confirm]");
  const selectedTrimesterIds = () => TRIMESTERS
    .filter((trimester) => modal.querySelector(`[data-bulletin-print-term="${trimester.id}"]`)?.checked)
    .map((trimester) => trimester.id);
  const syncPrintButton = () => {
    const count = selectedTrimesterIds().length;
    if (printButton) printButton.disabled = count === 0;
  };
  modal.querySelectorAll("[data-bulletin-print-term]").forEach((input) => input.addEventListener("change", syncPrintButton));
  syncPrintButton();
  printButton?.addEventListener("click", () => {
    const trimesterIds = selectedTrimesterIds();
    if (!trimesterIds.length) {
      alert("Selecciona al menos un trimestre para imprimir.");
      return;
    }
    close();
    printDocument(payload, trimesterIds);
  });
}
