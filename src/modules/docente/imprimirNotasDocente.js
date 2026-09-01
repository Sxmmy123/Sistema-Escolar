import { findSubject } from "../../data/catalog.js";
import { gradeByActivityAndStudent, isSaberActivity, studentActivityGrade } from "./AcademicoDocente.js";
import { escapeHtml } from "./UtilidadesDocente.js";

const SCHOOL_NAME = "ECOLOGICA NUEVA BOLIVIA";
const SCHOOL_LEVEL = "PRIMARIA COMUNITARIA VOCACIONAL";
const SCHOOL_FIELD = "CIENCIA TECNOLOGIA Y PRODUCCION";
const DIRECTOR_NAME = "MSC. SAMUEL RONAL MENDOZA CALLE";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function cssSafe(value) {
  return String(value || "").replace(/[<>&"]/g, "");
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

function printableGrade(value) {
  const number = Math.round(Number(value || 35));
  return Math.max(35, Math.min(100, number || 35));
}

function splitColumns(items, minimum, _maximum, prefix) {
  const clean = [...items];
  while (clean.length < minimum) {
    clean.push({ id: `blank_${prefix}_${clean.length}`, titulo: "", empty: true, maximo: 100 });
  }
  return clean;
}

function verticalLabel(text) {
  return `<span class="vertical-text">${escapeHtml(text || "")}</span>`;
}

function gradeCell(value) {
  const grade = printableGrade(value);
  return `<td class="${grade <= 50 ? "low-note" : ""}">${grade}</td>`;
}

function emptyCells(count) {
  return Array.from({ length: count }, () => "<td></td>").join("");
}

function subjectSheet({
  course,
  subject,
  trimesterLabel,
  students,
  activities,
  gradesMap,
  attendanceRows,
  calculateStudentTerm,
  teacherName
}) {
  const subjectActivitiesAll = activities.filter((item) => item.materiaId === subject.id);
  const serCriteriaRaw = subjectActivitiesAll
    .filter((item) => item.tipo === "ser")
    .sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || ""), "es", { sensitivity: "base" }));
  const autoActivity = subjectActivitiesAll.find((item) => item.tipo === "auto") || null;
  const gradedActivities = subjectActivitiesAll
    .filter((item) => !item.interno && !["ser", "auto"].includes(item.tipo))
    .filter((item) => Object.keys(gradesMap[item.id] || {}).length > 0);
  const serColumns = splitColumns(serCriteriaRaw, 1, 4, "ser");
  const saberColumns = splitColumns(gradedActivities.filter(isSaberActivity), 3, 6, "saber");
  const hacerColumns = splitColumns(gradedActivities.filter((item) => !isSaberActivity(item)), 3, 7, "hacer");
  const noteCount = 3 + serColumns.length + 2 + saberColumns.length + 2 + hacerColumns.length + 2 + 2 + 3;
  const fullSpan = 2 + noteCount;
  const areaColspan = Math.max(4, fullSpan - 14);
  const regularNoteCount = Math.max(1, noteCount - 3);
  const densityClass = noteCount > 34 ? "print-ultra" : noteCount > 27 ? "print-dense" : "";
  const info = courseInfo(course);
  const baseUrl = import.meta.env.BASE_URL || "/";
  const logoUrl = `${window.location.origin}${baseUrl}images/logo-nueva-bolivia.png`;

  return `
    <section class="print-page ${densityClass}" style="--regular-note-count:${regularNoteCount}">
      <table class="notes-print-table">
        <colgroup>
          <col class="col-num">
          <col class="col-name">
          <col span="${3 + serColumns.length + 2}" class="col-note">
          <col span="${saberColumns.length + 2}" class="col-note">
          <col span="${hacerColumns.length + 2}" class="col-note">
          <col span="2" class="col-note">
          <col class="col-total">
          <col class="col-total">
          <col class="col-status">
        </colgroup>
        <thead>
          <tr>
            <th colspan="8" class="brand-top">REGISTRO DE EVALUACION&nbsp;&nbsp; 2026&nbsp;&nbsp; ${escapeHtml(normalizeText(trimesterLabel))}</th>
            <th colspan="${Math.max(1, fullSpan - 13)}" class="top-fill"></th>
            <th colspan="3" class="meta-cell">ANO DE ESCOLARIDAD:</th>
            <th colspan="2" class="meta-value">${escapeHtml(info.grade)}</th>
          </tr>
          <tr>
            <th colspan="2" class="meta-label">NIVEL:</th>
            <th colspan="6" class="meta-value">${SCHOOL_LEVEL}</th>
            <th colspan="2" class="meta-label">AREA:</th>
            <th colspan="${areaColspan}" class="meta-value">${escapeHtml(normalizeText(subject.nombre))}</th>
            <th colspan="2" class="meta-label">PARALELO:</th>
            <th colspan="2" rowspan="2" class="parallel">${escapeHtml(info.parallel)}</th>
          </tr>
          <tr>
            <th colspan="2" class="meta-label">CAMPO:</th>
            <th colspan="6" class="meta-value">${SCHOOL_FIELD}</th>
            <th colspan="2" class="meta-label">MAESTRA/O:</th>
            <th colspan="${areaColspan}" class="meta-value">${escapeHtml(normalizeText(teacherName || ""))}</th>
            <th colspan="2" class="meta-label"></th>
          </tr>
          <tr>
            <th colspan="2" rowspan="2" class="school-block">
              <div class="school-title">UNIDAD EDUCATIVA</div>
              <img src="${cssSafe(logoUrl)}" alt="Escudo">
              <div class="school-name">${SCHOOL_NAME}</div>
            </th>
            <th colspan="${3 + serColumns.length + 2}" class="group ser-group">SER/10</th>
            <th colspan="${saberColumns.length + 2}" class="group saber-group">SABER/45</th>
            <th colspan="${hacerColumns.length + 2}" class="group hacer-group">HACER/40</th>
            <th colspan="2" class="group auto-group">AUTOEVALUACION</th>
            <th colspan="3" class="group final-group">CALIFICACION TRIMESTRAL</th>
          </tr>
          <tr>
            <th class="vertical ser-col section-start">${verticalLabel("Asistencia")}</th>
            <th class="vertical ser-col">${verticalLabel("Puntualidad")}</th>
            <th class="vertical ser-col">${verticalLabel("Responsabilidad")}</th>
            ${serColumns.map((item) => `<th class="vertical ser-col">${verticalLabel(item.titulo || "")}</th>`).join("")}
            <th class="vertical ser-col prom">${verticalLabel("Promedio")}</th>
            <th class="vertical ser-col prom">${verticalLabel("Puntaje")}</th>
            ${saberColumns.map((item, index) => `<th class="vertical saber-col ${index === 0 ? "section-start" : ""}">${verticalLabel(item.titulo || "")}</th>`).join("")}
            <th class="vertical saber-col prom">${verticalLabel("Promedio")}</th>
            <th class="vertical saber-col prom">${verticalLabel("Puntaje")}</th>
            ${hacerColumns.map((item, index) => `<th class="vertical hacer-col ${index === 0 ? "section-start" : ""}">${verticalLabel(item.titulo || "")}</th>`).join("")}
            <th class="vertical hacer-col prom">${verticalLabel("Promedio")}</th>
            <th class="vertical hacer-col prom">${verticalLabel("Puntaje")}</th>
            <th class="vertical auto-col section-start">${verticalLabel("Nota")}</th>
            <th class="vertical auto-col prom">${verticalLabel("Puntaje")}</th>
            <th class="vertical total-col section-start prom">${verticalLabel("Total")}</th>
            <th class="vertical final-col prom">${verticalLabel("Nota final")}</th>
            <th class="vertical status-col">${verticalLabel("Situacion")}</th>
          </tr>
          <tr>
            <th class="col-header">No.</th>
            <th class="col-header">APELLIDOS Y NOMBRES</th>
            <th colspan="${noteCount}" class="thin-header"></th>
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: 40 }, (_, rowIndex) => {
            const student = students[rowIndex];
            if (!student) {
              return `<tr><td>${rowIndex + 1}</td><td class="student-name">&nbsp;</td>${emptyCells(noteCount)}</tr>`;
            }
            const serExtraValues = serCriteriaRaw.map((item) => studentActivityGrade(item, student.id, gradesMap));
            const autoGrade = autoActivity ? gradesMap[autoActivity.id]?.[student.id]?.nota : null;
            const calc = calculateStudentTerm(student, gradedActivities, gradesMap, attendanceRows, serExtraValues, autoGrade);
            return `<tr>
              <td>${rowIndex + 1}</td>
              <td class="student-name">${escapeHtml(student.nombre)}</td>
              ${gradeCell(calc.asistencia100)}
              ${gradeCell(calc.puntualidad100)}
              ${gradeCell(calc.responsabilidad100)}
              ${serColumns.map((item) => item.empty ? "<td></td>" : gradeCell(studentActivityGrade(item, student.id, gradesMap))).join("")}
              ${gradeCell(calc.ser100)}
              <td class="score">${calc.ser10}</td>
              ${saberColumns.map((item) => item.empty ? "<td></td>" : gradeCell(studentActivityGrade(item, student.id, gradesMap))).join("")}
              ${gradeCell(calc.saber100)}
              <td class="score">${calc.saber45}</td>
              ${hacerColumns.map((item) => item.empty ? "<td></td>" : gradeCell(studentActivityGrade(item, student.id, gradesMap))).join("")}
              ${gradeCell(calc.hacer100)}
              <td class="score">${calc.hacer40}</td>
              ${autoActivity ? gradeCell(studentActivityGrade(autoActivity, student.id, gradesMap)) : "<td></td>"}
              <td class="score">${calc.auto5}</td>
              <td class="total-score">${calc.ser10 + calc.saber45 + calc.hacer40}</td>
              <td class="${calc.final <= 50 ? "final-low" : "final-ok"}">${calc.final}</td>
              <td class="${calc.final <= 50 ? "status-low" : "status-ok"}">${calc.final <= 50 ? "REPROBADO" : "APROBADO"}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <div class="signatures">
        <div>
          <span></span>
          <strong>${escapeHtml(normalizeText(teacherName || "MAESTRA/O"))}</strong>
          <small>MAESTRA/O DEL AREA DE ${escapeHtml(normalizeText(subject.nombre))}</small>
        </div>
        <div>
          <span></span>
          <strong>${DIRECTOR_NAME}</strong>
          <small>DIRECTOR UNIDAD EDUCATIVA ECOLOGICA NUEVA BOLIVIA</small>
        </div>
      </div>
    </section>
  `;
}

function printDocument(payload, subjects) {
  const gradesMap = gradeByActivityAndStudent(payload.gradesList || []);
  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Registro de evaluacion</title>
        <style>
          @page { size: letter landscape; margin: 5mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: "Arial Narrow", Arial, sans-serif; }
          .print-page {
            width: 269mm;
            height: 205mm;
            max-height: 205mm;
            overflow: hidden;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
            display: flex;
            flex-direction: column;
          }
          .print-page:last-child { page-break-after: auto; break-after: auto; }
          .notes-print-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #202020; padding: 0 1px; height: 11px; text-align: center; vertical-align: middle; font-size: 7.8px; font-weight: 400; line-height: 1; }
          th { font-size: 7.5px; }
          .col-num { width: 2.1%; }
          .col-name { width: 27%; }
          .col-note { width: calc((100% - 2.1% - 27% - 2.6% - 2.6% - 5.2%) / var(--regular-note-count)); }
          .col-total { width: 2.6%; }
          .col-status { width: 5.2%; }
          .brand-top { background: #087B2B; color: #fff; font-size: 12px; font-weight: 700; text-align: left; padding-left: 6px; letter-spacing: .02em; }
          .top-fill { background: #cce8c8; border-left: 0; }
          .meta-label, .meta-cell { font-weight: 700; text-align: right; background: #fff; }
          .meta-value { font-weight: 400; background: #fff; }
          .parallel { font-size: 18px; font-weight: 400; }
          .school-block { height: 76px; background: #fff; }
          .school-block img { display: block; width: 45px; height: 45px; object-fit: contain; margin: 1px auto; }
          .school-title { font-size: 7.5px; font-weight: 700; }
          .school-name { margin-top: 1px; font-size: 11px; font-weight: 700; }
          .group { font-weight: 700; color: #111; }
          .ser-group, .ser-col { background: #fff; }
          .saber-group { background: #f8dfc2; }
          .saber-col { background: #fff7ed; }
          .hacer-group { background: #fbe0cf; }
          .hacer-col { background: #fff; }
          .auto-group, .auto-col { background: #fde7a8; }
          .final-group, .final-col { background: #dff2c6; }
          .total-col { background: #f8dfc2; }
          .status-col { background: #e7f2ff; }
          .section-start { border-left-width: 2px; }
          .vertical { height: 78px; padding: 0; overflow: hidden; }
          .vertical-text { display: inline-block; max-width: 72px; transform: rotate(-90deg); transform-origin: center; white-space: nowrap; font-size: 7px; font-weight: 400; }
          .prom .vertical-text { font-weight: 700; }
          .thin-header { height: 9px; background: #f8f8f8; }
          .col-header { font-size: 7.6px; font-weight: 700; background: #fff; }
          .student-name { text-align: left; white-space: nowrap; overflow: hidden; font-size: 7.8px; font-weight: 400; }
          .low-note { color: #d91f26; }
          .score { background: #fef3c7; }
          .total-score { background: #fde8d1; }
          .final-ok { background: #e7f7df; color: #111; }
          .final-low { background: #fde7e7; color: #d91f26; }
          .status-ok { background: #edf8ff; color: #166534; font-size: 6.5px; }
          .status-low { background: #edf8ff; color: #d91f26; font-size: 6.5px; }
          .signatures { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; padding: 7px 80px 0; text-align: center; font-size: 7px; }
          .signatures span { display: block; border-top: 1px solid #111; margin: 0 auto 2px; width: 180px; }
          .signatures strong { display: block; font-size: 7px; font-weight: 700; }
          .signatures small { display: block; font-size: 6px; }
          .print-dense th, .print-dense td { height: 10px; font-size: 7.1px; }
          .print-dense th { font-size: 6.9px; }
          .print-dense .vertical { height: 70px; }
          .print-dense .vertical-text { max-width: 66px; font-size: 6.4px; }
          .print-dense .student-name { font-size: 7.1px; }
          .print-dense .school-block { height: 68px; }
          .print-dense .school-block img { width: 38px; height: 38px; }
          .print-dense .signatures { padding-top: 5px; }
          .print-ultra th, .print-ultra td { height: 9px; font-size: 6.4px; }
          .print-ultra th { font-size: 6.2px; }
          .print-ultra .vertical { height: 62px; }
          .print-ultra .vertical-text { max-width: 58px; font-size: 5.8px; }
          .print-ultra .student-name { font-size: 6.4px; }
          .print-ultra .school-block { height: 60px; }
          .print-ultra .school-block img { width: 32px; height: 32px; }
          .print-ultra .brand-top { font-size: 10px; }
          .print-ultra .school-name { font-size: 9px; }
          .print-ultra .signatures { padding-top: 4px; }
        </style>
      </head>
      <body>
        ${subjects.map((subject) => subjectSheet({ ...payload, subject, gradesMap })).join("")}
        <script>
          window.addEventListener("load", () => {
            setTimeout(() => {
              window.focus();
              window.print();
            }, 250);
          });
        </script>
      </body>
    </html>
  `;
  const printWindow = window.open("", "_blank", "width=1200,height=800");
  if (!printWindow) {
    alert("El navegador bloqueo la ventana de impresion. Permite ventanas emergentes e intenta nuevamente.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export function openTeacherNotesPrintModal(payload) {
  const courseSubjects = (payload.availableSubjects || [])
    .map((id) => findSubject(id))
    .filter(Boolean);
  const subjectsWithGrades = courseSubjects.filter((subject) =>
    (payload.activities || []).some((activity) => activity.materiaId === subject.id)
  );
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
      <p class="mt-3 text-xs leading-5 text-slate-500">Se imprimira en hoja carta horizontal, una hoja por materia seleccionada.</p>
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" data-close-notes-print class="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
        <button type="button" data-print-selected-notes class="rounded-2xl bg-school-green px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-school-navy">Imprimir</button>
      </div>
    </div>
  `;
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

  modal.querySelectorAll("[data-close-notes-print]").forEach((button) => {
    button.addEventListener("click", () => modal.remove());
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.remove();
  });
  modal.querySelector("[data-print-selected-notes]")?.addEventListener("click", () => {
    const picked = allToggle.checked
      ? subjects
      : subjects.filter((subject) => modal.querySelector(`[data-print-subject="${subject.id}"]`)?.checked);
    if (!picked.length) {
      alert("Selecciona al menos una materia.");
      return;
    }
    modal.remove();
    printDocument(payload, picked);
  });
}


