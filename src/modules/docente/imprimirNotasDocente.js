import { findSubject } from "../../data/catalog.js";
import { gradeByActivityAndStudent, isMaterialActivity, isSaberActivity, studentActivityGrade } from "./AcademicoDocente.js";
import { escapeHtml } from "./UtilidadesDocente.js";
import { gestionActual } from "../../services/rutasFirestore.js";
import { formatoCarta } from "../../ui/impresion.js";

const SCHOOL_NAME = "ECOLOGICA NUEVA BOLIVIA";
const SCHOOL_LEVEL = "PRIMARIA COMUNITARIA VOCACIONAL";
const SCHOOL_FIELD = "CIENCIA TECNOLOGIA Y PRODUCCION";
const DIRECTOR_NAME = "MSC. SAMUEL RONAL MENDOZA CALLE";
const GROUPS = { ser: "SER / 10", saber: "SABER / 45", hacer: "HACER / 40", auto: "AUTOEVALUACION", final: "CALIFICACION TRIMESTRAL" };

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function courseInfo(course = {}) {
  const name = String(course.nombre || "").trim();
  if (!name) return { grade: "CURSO", parallel: "A" };
  if (name.toLowerCase().includes("inicial")) return { grade: normalizeText(name), parallel: "A" };
  const parts = name.split(/\s+/);
  return { grade: normalizeText(parts.slice(0, -1).join(" ") || name), parallel: normalizeText(parts.at(-1) || "A") };
}

function printableGrade(value) {
  const number = Math.round(Number(value || 35));
  return Math.max(35, Math.min(100, number || 35));
}

function gradeCell(value, key) {
  const grade = printableGrade(value);
  return `<td data-column="${escapeHtml(key)}" class="${grade <= 50 ? "low-note" : ""}">${grade}</td>`;
}

function subjectData(payload, subject, gradesMap) {
  const subjectActivities = (payload.activities || []).filter((item) => item.materiaId === subject.id);
  const serCriteria = subjectActivities.filter((item) => item.tipo === "ser")
    .sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || ""), "es", { sensitivity: "base" }));
  const autoActivity = subjectActivities.find((item) => item.tipo === "auto") || null;
  const gradedActivities = subjectActivities.filter((item) => !item.interno && !["ser", "auto"].includes(item.tipo))
    .filter((item) => Object.keys(gradesMap[item.id] || {}).length > 0);
  const saberActivities = gradedActivities.filter(isSaberActivity);
  const hacerActivities = gradedActivities.filter((item) => !isSaberActivity(item) && !isMaterialActivity(item));
  const score = (key, label, group, read = (row) => row.calc[key]) => ({ key, label, group, read, className: "score" });
  const grade = (key, label, group) => ({ key, label, group, read: (row) => row.calc[key], grade: true });
  const activityColumns = (activities, group, prefix) => activities.map((activity, index) => ({
    key: activity.id, label: `${prefix}${index + 1}`, group, activityTitle: activity.titulo || "Actividad sin titulo",
    read: (row) => studentActivityGrade(activity, row.student.id, gradesMap), grade: true
  }));
  const columns = [
    grade("asistencia100", "Asist.", "ser"), grade("puntualidad100", "Punt.", "ser"), grade("responsabilidad100", "Resp.", "ser"),
    ...activityColumns(serCriteria, "ser", "C"), grade("ser100", "Prom.", "ser"), score("ser10", "Pts.", "ser"),
    ...activityColumns(saberActivities, "saber", "S"), grade("saber100", "Prom.", "saber"), score("saber45", "Pts.", "saber"),
    ...activityColumns(hacerActivities, "hacer", "H"), grade("hacer100", "Prom.", "hacer"), score("hacer40", "Pts.", "hacer"),
    { key: "auto", label: "Nota", group: "auto", grade: true, read: (row) => autoActivity ? studentActivityGrade(autoActivity, row.student.id, gradesMap) : null },
    score("auto5", "Pts.", "auto"),
    score("total", "Total", "final", (row) => row.calc.ser10 + row.calc.saber45 + row.calc.hacer40),
    { key: "final", label: "Final", group: "final", read: (row) => row.calc.final, className: "final-score" },
    { key: "status", label: "Estado", group: "final", read: (row) => row.calc.final <= 50 ? "REPROBADO" : "APROBADO", className: "status", weight: 2 }
  ];
  const rows = (payload.students || []).map((student, index) => {
    const serExtraValues = serCriteria.filter((item) => gradesMap[item.id]?.[student.id])
      .map((item) => studentActivityGrade(item, student.id, gradesMap));
    const autoGrade = autoActivity ? gradesMap[autoActivity.id]?.[student.id]?.nota : null;
    return { student, number: index + 1, calc: payload.calculateStudentTerm(student, gradedActivities, gradesMap, payload.attendanceRows, serExtraValues, autoGrade) };
  });
  return { subject, columns, rows };
}

function subjectPages(data, pageHeight) {
  const parts = Array.from({ length: Math.ceil(data.columns.length / 8) }, (_, index) => data.columns.slice(index * 8, (index + 1) * 8));
  return parts.flatMap((columns, partIndex) => {
    const legend = columns.filter((column) => column.activityTitle);
    // Reserve room for wrapped activity titles and full student names, never shrink the type.
    const legendHeight = legend.reduce((height, column) => height + Math.ceil((column.activityTitle.length + column.label.length + 3) / 75) * 4.5 + 1.5, 0);
    const rowsPerPage = Math.max(1, Math.min(12, Math.floor((pageHeight - 90 - legendHeight) / 11)));
    return Array.from({ length: Math.max(1, Math.ceil(data.rows.length / rowsPerPage)) }, (_, rowPage) => ({
      subject: data.subject, columns, legend, partNumber: partIndex + 1, partCount: parts.length,
      rows: data.rows.slice(rowPage * rowsPerPage, (rowPage + 1) * rowsPerPage)
    }));
  });
}

function subjectSheet(payload, page, pageNumber, pageCount) {
  const { subject, columns, legend, rows, partNumber, partCount } = page;
  const info = courseInfo(payload.course);
  const baseUrl = import.meta.env?.BASE_URL || "/";
  const logoUrl = `${window.location.origin}${baseUrl}images/logo-nueva-bolivia.png`;
  const groups = [];
  for (const column of columns) {
    const last = groups.at(-1);
    if (last?.id === column.group) last.count += 1;
    else groups.push({ id: column.group, count: 1 });
  }
  const columnWeight = columns.reduce((total, column) => total + (column.weight || 1), 0);
  return `<section class="print-page" data-subject="${escapeHtml(subject.id)}" data-part="${partNumber}">
    <header class="document-header">
      <div class="brand-row"><img src="${escapeHtml(logoUrl)}" alt="Escudo"><div><small>UNIDAD EDUCATIVA ${SCHOOL_NAME}</small><h1>REGISTRO DE EVALUACION</h1><p>${gestionActual()} · ${escapeHtml(normalizeText(payload.trimesterLabel || payload.selectedTrimesterLabel || ""))} · HOJA ${pageNumber} DE ${pageCount}</p></div></div>
      <div class="document-meta">
        <div><b>NIVEL:</b> ${SCHOOL_LEVEL}</div><div><b>CURSO:</b> ${escapeHtml(info.grade)} <b>PARALELO:</b> ${escapeHtml(info.parallel)}</div>
        <div><b>AREA:</b> ${escapeHtml(normalizeText(subject.nombre))}</div><div><b>MAESTRA/O:</b> ${escapeHtml(normalizeText(payload.teacherName || ""))}</div>
        <div class="field"><b>CAMPO:</b> ${SCHOOL_FIELD} · PARTE ${partNumber} DE ${partCount}</div>
      </div>
    </header>
    ${legend.length ? `<dl class="activity-key">${legend.map((column) => `<div><dt>${escapeHtml(column.label)}</dt><dd>${escapeHtml(column.activityTitle)}</dd></div>`).join("")}</dl>` : ""}
    <table class="notes-print-table">
      <colgroup><col class="col-num"><col class="col-name">${columns.map((column) => `<col style="width:calc((100% - 67mm) * ${(column.weight || 1) / columnWeight})">`).join("")}</colgroup>
      <thead><tr><th rowspan="2">No.</th><th rowspan="2">APELLIDOS Y NOMBRES</th>${groups.map((group) => `<th colspan="${group.count}" class="group group-${group.id}">${GROUPS[group.id]}</th>`).join("")}</tr>
      <tr>${columns.map((column) => `<th data-column="${escapeHtml(column.key)}" class="column-label group-${column.group}" title="${escapeHtml(column.activityTitle || column.label)}">${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${row.number}</td><td class="student-name">${escapeHtml(row.student.nombre)}</td>${columns.map((column) => {
        const value = column.read(row);
        if (value == null) return `<td data-column="${escapeHtml(column.key)}"></td>`;
        if (column.grade) return gradeCell(value, column.key);
        const resultClass = ["final-score", "status"].includes(column.className) ? (row.calc.final <= 50 ? " result-low" : " result-ok") : "";
        return `<td data-column="${escapeHtml(column.key)}" class="${column.className || ""}${resultClass}">${escapeHtml(String(value))}</td>`;
      }).join("")}</tr>`).join("")}</tbody>
    </table>
    <div class="signatures"><div><span></span><strong>${escapeHtml(normalizeText(payload.teacherName || "MAESTRA/O"))}</strong><small>MAESTRA/O DEL AREA DE ${escapeHtml(normalizeText(subject.nombre))}</small></div><div><span></span><strong>${DIRECTOR_NAME}</strong><small>DIRECTOR UNIDAD EDUCATIVA ${SCHOOL_NAME}</small></div></div>
  </section>`;
}

export function printDocument(payload, subjects) {
  const page = formatoCarta();
  const gradesMap = gradeByActivityAndStudent(payload.gradesList || []);
  const pages = subjects.flatMap((subject) => subjectPages(subjectData(payload, subject, gradesMap), page.alto));
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Registro de evaluacion</title><style>
    ${page.pagina}
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, sans-serif; }
    .print-page { width: ${page.ancho}mm; max-width: 100%; page-break-after: always; break-after: page; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .print-page:last-child { page-break-after: auto; break-after: auto; }
    .document-header { border: 1.2px solid #202020; break-inside: avoid; }
    .brand-row { display: flex; align-items: center; gap: 3mm; padding: 2mm 3mm; }
    .brand-row img { width: 16mm; height: 16mm; object-fit: contain; flex-shrink: 0; }
    .brand-row small { font-size: 10pt; font-weight: 700; }
    h1 { margin: 1mm 0; font-size: 15pt; line-height: 1.1; }
    .brand-row p { margin: 0; font-size: 10pt; }
    .document-meta { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #202020; font-size: 9.5pt; line-height: 1.2; }
    .document-meta > div { min-width: 0; padding: 1mm 2mm; overflow-wrap: anywhere; }
    .field { grid-column: 1 / -1; }
    .activity-key { margin: 2mm 0; font-size: 10pt; line-height: 1.2; }
    .activity-key > div { display: flex; align-items: baseline; gap: 2mm; padding: .6mm 0; break-inside: avoid; }
    .activity-key dt { flex: 0 0 10mm; font-weight: 700; }
    .activity-key dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .notes-print-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .col-num { width: 7mm; } .col-name { width: 60mm; }
    th, td { border: 1px solid #202020; padding: .5mm .4mm; height: 9mm; text-align: center; vertical-align: middle; font-size: 12pt; font-weight: 400; line-height: 1.15; }
    thead { display: table-header-group; } tr { break-inside: avoid; page-break-inside: avoid; }
    th { font-size: 10pt; font-weight: 700; overflow-wrap: anywhere; }
    .group { height: 8mm; }
    .column-label { height: 7mm; }
    .group-ser { background: #edf6ed; } .group-saber { background: #f8dfc2; }
    .group-hacer { background: #fbe0cf; } .group-auto { background: #fde7a8; } .group-final { background: #dff2c6; }
    .student-name { text-align: left; white-space: normal; overflow-wrap: anywhere; font-size: 11.5pt; }
    .low-note { color: #d91f26; } .score { background: #fef3c7; }
    .final-score { font-weight: 700; } .status { font-size: 10pt; overflow-wrap: anywhere; }
    .result-ok { background: #e7f7df; } .result-low { background: #fde7e7; color: #d91f26; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; padding: 8mm 4mm 1mm; text-align: center; break-inside: avoid; }
    .signatures span { display: block; width: 60mm; max-width: 100%; margin: 0 auto 1mm; border-top: 1px solid #111; }
    .signatures strong { display: block; font-size: 9.5pt; }
    .signatures small { display: block; margin-top: .7mm; font-size: 9pt; }
    @media print { body { width: ${page.ancho}mm; } }
  </style></head><body>${pages.map((item, index) => subjectSheet(payload, item, index + 1, pages.length)).join("")}<script>window.addEventListener("load",()=>{setTimeout(()=>{window.focus();window.print();},250);});</script></body></html>`;
  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) {
    alert("El navegador bloqueo la ventana de impresion. Permite ventanas emergentes e intenta nuevamente.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export function openTeacherNotesPrintModal(payload) {
  const courseSubjects = (payload.availableSubjects || []).map((id) => findSubject(id)).filter(Boolean);
  const subjectsWithGrades = courseSubjects.filter((subject) => (payload.activities || []).some((activity) => activity.materiaId === subject.id));
  const subjects = subjectsWithGrades.length ? subjectsWithGrades : courseSubjects;
  const selectedSubjectId = payload.selectedSubject?.id || subjects[0]?.id || "";
  document.querySelector("[data-notes-print-modal]")?.remove();
  if (!subjects.length) {
    alert("No hay materias disponibles para imprimir.");
    return;
  }
  const modal = document.createElement("div");
  modal.dataset.notesPrintModal = "true";
  modal.className = "fixed inset-0 z-[80] grid place-items-center bg-slate-950/40 p-4";
  modal.innerHTML = `
    <div class="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[.16em] text-school-green">Imprimir notas</p>
          <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(payload.course?.nombre || "Curso")}</h3>
          <p class="mt-1 text-sm text-slate-500">${escapeHtml(payload.selectedTrimesterLabel || "")}</p>
        </div>
        <button type="button" data-close-notes-print class="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">x</button>
      </div>
      <div class="mt-5 rounded-2xl border border-slate-200 p-3">
        <label class="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" data-print-all-subjects class="h-4 w-4 rounded border-slate-300 text-school-green" checked>
          Imprimir todas las materias
        </label>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          ${subjects.map((subject) => `
            <label class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
              <span>${escapeHtml(subject.nombre)}</span>
              <input type="checkbox" data-print-subject="${subject.id}" class="h-4 w-4 rounded border-slate-300 text-school-green" ${subject.id === selectedSubjectId ? "checked" : ""}>
            </label>
          `).join("")}
        </div>
      </div>
      <p class="mt-3 text-xs leading-5 text-slate-500">Se imprimira en hoja carta vertical.</p>
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" data-close-notes-print class="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
        <button type="button" data-print-selected-notes class="rounded-2xl bg-school-green px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-school-navy">Imprimir</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const allToggle = modal.querySelector("[data-print-all-subjects]");
  const checkboxes = [...modal.querySelectorAll("[data-print-subject]")];
  const syncAllToggle = () => {
    checkboxes.forEach((item) => {
      item.checked = allToggle.checked ? true : item.checked;
      item.disabled = allToggle.checked;
    });
  };
  allToggle.addEventListener("change", syncAllToggle);
  syncAllToggle();
  modal.querySelectorAll("[data-close-notes-print]").forEach((button) => button.addEventListener("click", () => modal.remove()));
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
  modal.querySelector("[data-print-selected-notes]")?.addEventListener("click", () => {
    const picked = allToggle.checked ? subjects : subjects.filter((subject) => modal.querySelector(`[data-print-subject="${subject.id}"]`)?.checked);
    if (!picked.length) {
      alert("Selecciona al menos una materia.");
      return;
    }
    modal.remove();
    printDocument(payload, picked);
  });
}
