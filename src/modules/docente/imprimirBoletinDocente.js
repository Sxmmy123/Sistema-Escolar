import { SUBJECTS } from "../../data/catalog.js";
import { icon } from "../../ui/dom.js";
import { TRIMESTERS } from "../../services/teacherData.js";
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

function gradeCell(value, extraClass = "") {
  if (value === "" || value == null) return `<td class="${extraClass}"></td>`;
  const grade = Math.round(Number(value));
  return `<td class="${extraClass} ${grade <= 50 ? "low-grade" : ""}">${grade}</td>`;
}

function summaryLabel(trimesterIds) {
  if (trimesterIds.length === 3) return "PROM. ANUAL";
  if (trimesterIds.length === 2) return "PROM. ACUM.";
  return "PROM. TRIM.";
}

function bulletinSheet(payload, trimesterIds) {
  const subjects = SUBJECTS;
  const students = sortStudentsByName(payload.students || []);
  const info = courseInfo(payload.course);
  const baseUrl = import.meta.env.BASE_URL || "/";
  const logoUrl = `${window.location.origin}${baseUrl}images/logo-nueva-bolivia.png`;
  const year = new Date().getFullYear();
  const subjectColumnCount = subjects.length + 1;
  const noteColumnCount = Math.max(1, trimesterIds.length * subjectColumnCount);
  const termCount = trimesterIds.length;
  const nameWidth = termCount === 1 ? "40%" : termCount === 2 ? "32%" : "27%";
  const totalRows = Math.max(40, students.length);

  return `
    <section class="bulletin-print-page terms-${termCount}" style="--note-columns:${noteColumnCount};--name-width:${nameWidth}">
      <div class="document-header">
        <div class="school-brand">
          <img src="${escapeHtml(logoUrl)}" alt="Escudo">
          <div><small>UNIDAD EDUCATIVA</small><strong>${SCHOOL_NAME}</strong></div>
        </div>
        <div class="document-info">
          <div class="document-title">BOLETIN CENTRALIZADOR <span>GESTION: ${year}</span></div>
          <div class="info-row">
            <b>NIVEL:</b><span>${SCHOOL_LEVEL}</span>
            <b>AÑO DE ESCOLARIDAD:</b><span>${escapeHtml(info.grade)}</span>
            <b>PARALELO:</b><span class="parallel">${escapeHtml(info.parallel)}</span>
          </div>
          <div class="info-row">
            <b>DIRECTOR(A):</b><span>${DIRECTOR_NAME}</span>
            <b>MAESTRA(O):</b><span>${escapeHtml(normalizeText(payload.teacherName || "DOCENTE"))}</span>
            <b>CURSO:</b><span>${escapeHtml(normalizeText(payload.course?.nombre || ""))}</span>
          </div>
        </div>
      </div>

      <table class="bulletin-table">
        <colgroup>
          <col class="number-column"><col class="name-column">
          <col span="${noteColumnCount}" class="note-column"><col class="summary-column">
        </colgroup>
        <thead>
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
              ${subjects.map((subject, subjectIndex) => `<th class="subject-head term-${trimesterId} ${subjectIndex === 0 ? "term-start" : ""}" title="${escapeHtml(subject.nombre)}">${escapeHtml(SUBJECT_CODES[subject.id] || subject.corto || subject.nombre.slice(0, 3))}</th>`).join("")}
              <th class="term-average term-${trimesterId}">PROM.</th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: totalRows }, (_, rowIndex) => {
            const student = students[rowIndex];
            if (!student) return `<tr><td>${rowIndex + 1}</td><td class="student-name"></td>${Array.from({ length: noteColumnCount + 1 }, () => "<td></td>").join("")}</tr>`;
            const termAverages = [];
            const termCells = trimesterIds.map((trimesterId) => {
              const snapshot = payload.snapshotsByTerm?.[trimesterId];
              const grades = subjects.map((subject) => subjectFinal(student, subject.id, snapshot));
              const termAverage = average(grades);
              if (termAverage !== "") termAverages.push(termAverage);
              return `${grades.map((grade, subjectIndex) => gradeCell(grade, `${subjectIndex === 0 ? "term-start " : ""}term-${trimesterId}`)).join("")}${gradeCell(termAverage, `term-average term-${trimesterId}`)}`;
            }).join("");
            return `<tr><td>${rowIndex + 1}</td><td class="student-name">${escapeHtml(normalizeText(student.nombre))}</td>${termCells}${gradeCell(average(termAverages), "summary-cell")}</tr>`;
          }).join("")}
        </tbody>
      </table>

      <div class="signatures">
        <div><span></span><strong>${DIRECTOR_NAME}</strong><small>DIRECTOR UNIDAD EDUCATIVA ECOLOGICA NUEVA BOLIVIA</small></div>
        <div><span></span><strong>${escapeHtml(normalizeText(payload.teacherName || "MAESTRA/O"))}</strong><small>MAESTRA/O RESPONSABLE DEL CURSO</small></div>
      </div>
    </section>
  `;
}

function printDocument(payload, trimesterIds) {
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Boletín centralizador - ${escapeHtml(payload.course?.nombre || "Curso")}</title>
    <style>
      @page { size: letter portrait; margin: 4mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: "Arial Narrow", Arial, sans-serif; }
      .bulletin-print-page { width: 207.9mm; height: 271.4mm; max-height: 271.4mm; overflow: hidden; display: flex; flex-direction: column; break-after: page; page-break-after: always; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .document-header { display: grid; grid-template-columns: 30% 70%; min-height: 27mm; border: 1.4px solid #111; border-bottom: 0; }
      .school-brand { display: flex; align-items: center; gap: 2mm; padding: 1.5mm 2mm; border-right: 1.4px solid #111; }
      .school-brand img { width: 13mm; height: 13mm; object-fit: contain; }
      .school-brand small { display: block; font-size: 5.6pt; font-weight: 700; }
      .school-brand strong { display: block; margin-top: .8mm; font-size: 8.2pt; line-height: 1.05; }
      .document-info { display: grid; grid-template-rows: 9mm 9mm 9mm; min-width: 0; }
      .document-title { display: flex; align-items: center; justify-content: center; gap: 5mm; border-bottom: 1px solid #111; font-size: 7.2pt; font-weight: 700; }
      .document-title span { min-width: 22mm; text-align: center; }
      .info-row { display: grid; grid-template-columns: auto minmax(22mm, 1fr) auto minmax(16mm, .75fr) auto minmax(9mm, .35fr); align-items: stretch; border-bottom: 1px solid #111; }
      .info-row:last-child { border-bottom: 0; }
      .info-row b, .info-row span { display: flex; align-items: center; padding: 0 .7mm; border-right: 1px solid #111; font-size: 5.2pt; line-height: 1; }
      .info-row b { justify-content: flex-end; white-space: nowrap; }
      .info-row span { justify-content: center; min-width: 0; text-align: center; }
      .info-row > :last-child { border-right: 0; }
      .info-row .parallel { font-size: 8pt; }
      .bulletin-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .bulletin-table th, .bulletin-table td { border: 1px solid #222; height: 4mm; padding: 0 .25mm; text-align: center; vertical-align: middle; font-size: 5.5pt; font-weight: 400; line-height: 1; }
      .bulletin-table th { font-weight: 700; }
      .number-column { width: 3%; }
      .name-column { width: var(--name-width); }
      .summary-column { width: 4.8%; }
      .note-column { width: calc((100% - 3% - var(--name-width) - 4.8%) / var(--note-columns)); }
      .number-head, .name-head { background: #fff; font-size: 6.2pt; }
      .trimester-head { height: 5.6mm !important; font-size: 6.4pt !important; }
      .subject-head, .term-average { height: 5.6mm !important; font-size: 4.8pt !important; white-space: nowrap; overflow: hidden; }
      .term-t1 { background: #fff; }
      .term-t2 { background: #f7f7f7; }
      .term-t3 { background: #f2f7f2; }
      .term-average { background: #fde7c8; }
      .term-start { border-left-width: 1.6px !important; }
      .summary-head { background: #dbeafe; padding: 0; }
      .summary-head span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-size: 5.2pt; font-weight: 500; }
      .summary-cell { background: #e8f2ff; font-weight: 600 !important; }
      .student-name { padding-left: .8mm !important; text-align: left !important; white-space: nowrap; overflow: hidden; text-overflow: clip; font-size: 6pt !important; }
      .terms-1 .bulletin-table td { font-size: 6.2pt; }
      .terms-1 .subject-head, .terms-1 .term-average { font-size: 5.4pt !important; }
      .terms-2 .bulletin-table td { font-size: 5.8pt; }
      .low-grade { color: #d71920; }
      .signatures { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 15mm; padding: 10mm 10mm 1mm; text-align: center; }
      .signatures span { display: block; width: 55mm; max-width: 100%; margin: 0 auto 1mm; border-top: 1px solid #111; }
      .signatures strong { display: block; font-size: 6pt; }
      .signatures small { display: block; margin-top: .7mm; font-size: 5pt; }
      @media print { body { width: 207.9mm; } .bulletin-print-page:last-child { break-after: auto; page-break-after: auto; } }
    </style></head><body>${bulletinSheet(payload, trimesterIds)}<script>window.addEventListener("load",()=>{setTimeout(()=>{window.focus();window.print();},250);});</script></body></html>`;
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
          <p class="mt-1 text-xs text-slate-500">${escapeHtml(payload.course?.nombre || "Curso")} · hoja carta vertical</p>
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
      <div class="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-4 text-amber-900">${icon("info", "mt-0.5 h-4 w-4 shrink-0")}<span>Puedes marcar uno, dos o los tres trimestres. El curso completo se ajustará a una sola hoja tamaño carta vertical.</span></div>
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
    if (printButton) printButton.disabled = selectedTrimesterIds().length === 0;
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
