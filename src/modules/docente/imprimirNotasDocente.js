import { findSubject } from "../../data/catalog.js";
import { gradeByActivityAndStudent, isMaterialActivity, isSaberActivity, studentActivityGrade } from "./AcademicoDocente.js";
import { escapeHtml } from "./UtilidadesDocente.js";
import { gestionActual } from "../../services/rutasFirestore.js";
import { formatoCarta } from "../../ui/impresion.js";

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

function verticalLabel(text, className = "") {
  return `<span class="vertical-text ${className}">${escapeHtml(text || "")}</span>`;
}

function gradeCell(value) {
  const grade = printableGrade(value);
  return `<td class="${grade <= 50 ? "low-note" : ""}">${grade}</td>`;
}

function codedActivities(items, prefix) {
  return items.map((item, index) => ({ ...item, printCode: `${prefix}${index + 1}` }));
}

function subjectSheet({
  course,
  subject,
  selectedTrimesterLabel = "",
  trimesterLabel = selectedTrimesterLabel,
  students,
  activities,
  gradesMap,
  attendanceRows,
  calculateStudentTerm,
  teacherName,
  rowOffset = 0
}) {
  const subjectActivitiesAll = activities.filter((item) => item.materiaId === subject.id);
  const serCriteriaRaw = subjectActivitiesAll
    .filter((item) => item.tipo === "ser")
    .sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || ""), "es", { sensitivity: "base" }));
  const autoActivity = subjectActivitiesAll.find((item) => item.tipo === "auto") || null;
  const gradedActivities = subjectActivitiesAll
    .filter((item) => !item.interno && !["ser", "auto"].includes(item.tipo))
    .filter((item) => Object.keys(gradesMap[item.id] || {}).length > 0);
  const serColumns = codedActivities(serCriteriaRaw, "SER");
  const saberColumns = codedActivities(gradedActivities.filter(isSaberActivity), "S");
  const hacerColumns = codedActivities(gradedActivities.filter((item) => !isSaberActivity(item) && !isMaterialActivity(item)), "H");
  const activityColumns = [...serColumns, ...saberColumns, ...hacerColumns];
  const noteCount = 3 + serColumns.length + 2 + saberColumns.length + 2 + hacerColumns.length + 2 + 2 + 3;
  const fullSpan = 2 + noteCount;
  const regularNoteCount = Math.max(1, noteCount - 3);
  const densityClass = noteCount > 34 ? "print-ultra" : noteCount > 27 ? "print-dense" : "";
  const info = courseInfo(course);
  const baseUrl = import.meta.env?.BASE_URL || "/";
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
            <th colspan="${fullSpan}" class="record-heading">
              <div class="brand-top"><span>REGISTRO DE EVALUACION</span><span>${gestionActual()} &middot; ${escapeHtml(normalizeText(trimesterLabel))}</span></div>
              <div class="record-meta">
                <div><strong>NIVEL:</strong><span>${SCHOOL_LEVEL}</span></div>
                <div><strong>AREA:</strong><span>${escapeHtml(normalizeText(subject.nombre))}</span></div>
                <div><strong>CURSO:</strong><span>${escapeHtml(info.grade)}</span></div>
                <div><strong>CAMPO:</strong><span>${SCHOOL_FIELD}</span></div>
                <div><strong>MAESTRA/O:</strong><span>${escapeHtml(normalizeText(teacherName || ""))}</span></div>
                <div><strong>PARALELO:</strong><span>${escapeHtml(info.parallel)}</span></div>
              </div>
            </th>
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
            <th colspan="2" class="group auto-group"><span>AUTO</span><span>/5</span></th>
            <th colspan="3" class="group final-group"><span>CALIFICACION</span><span>TRIMESTRAL</span></th>
          </tr>
          <tr>
            <th class="vertical ser-col section-start">${verticalLabel("Asistencia")}</th>
            <th class="vertical ser-col">${verticalLabel("Puntualidad")}</th>
            <th class="vertical ser-col">${verticalLabel("Responsabilidad")}</th>
            ${serColumns.map((item) => `<th class="vertical activity-head ser-col" data-activity-code="${item.printCode}">${verticalLabel(item.printCode, "activity-title")}</th>`).join("")}
            <th class="vertical ser-col prom">${verticalLabel("Promedio")}</th>
            <th class="vertical ser-col prom">${verticalLabel("Puntaje")}</th>
            ${saberColumns.map((item, index) => `<th class="vertical activity-head saber-col ${index === 0 ? "section-start" : ""}" data-activity-code="${item.printCode}">${verticalLabel(item.printCode, "activity-title")}</th>`).join("")}
            <th class="vertical saber-col prom">${verticalLabel("Promedio")}</th>
            <th class="vertical saber-col prom">${verticalLabel("Puntaje")}</th>
            ${hacerColumns.map((item, index) => `<th class="vertical activity-head hacer-col ${index === 0 ? "section-start" : ""}" data-activity-code="${item.printCode}">${verticalLabel(item.printCode, "activity-title")}</th>`).join("")}
            <th class="vertical hacer-col prom">${verticalLabel("Promedio")}</th>
            <th class="vertical hacer-col prom">${verticalLabel("Puntaje")}</th>
            <th class="vertical auto-col section-start">${verticalLabel("Nota /100")}</th>
            <th class="vertical auto-col prom">${verticalLabel("Puntaje /5")}</th>
            <th class="vertical total-col section-start prom">${verticalLabel("Subtotal /95")}</th>
            <th class="vertical final-col prom">${verticalLabel("Nota final /100")}</th>
            <th class="vertical status-col">${verticalLabel("Situacion")}</th>
          </tr>
          <tr>
            <th class="col-header">No.</th>
            <th class="col-header">APELLIDOS Y NOMBRES</th>
            <th colspan="${noteCount}" class="thin-header"></th>
          </tr>
        </thead>
        <tbody>
          ${students.map((student, rowIndex) => {
            const serExtraValues = serCriteriaRaw.filter((item) => gradesMap[item.id]?.[student.id]).map((item) => studentActivityGrade(item, student.id, gradesMap));
            const autoGrade = autoActivity ? gradesMap[autoActivity.id]?.[student.id]?.nota : null;
            const calc = calculateStudentTerm(student, gradedActivities, gradesMap, attendanceRows, serExtraValues, autoGrade);
            return `<tr>
              <td>${rowOffset + rowIndex + 1}</td>
              <td class="student-name">${escapeHtml(student.nombre)}</td>
              ${gradeCell(calc.asistencia100)}
              ${gradeCell(calc.puntualidad100)}
              ${gradeCell(calc.responsabilidad100)}
              ${serColumns.map((item) => gradeCell(studentActivityGrade(item, student.id, gradesMap))).join("")}
              ${gradeCell(calc.ser100)}
              <td class="score">${calc.ser10}</td>
              ${saberColumns.map((item) => gradeCell(studentActivityGrade(item, student.id, gradesMap))).join("")}
              ${gradeCell(calc.saber100)}
              <td class="score">${calc.saber45}</td>
              ${hacerColumns.map((item) => gradeCell(studentActivityGrade(item, student.id, gradesMap))).join("")}
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
      <p class="grade-scale-note">Subtotal /95 + Autoevaluacion /5 = Nota final /100.</p>
      ${activityColumns.length ? `<section class="activity-key">
        <h2>ACTIVIDADES EVALUADAS</h2>
        <p class="activity-context">${escapeHtml(normalizeText(subject.nombre))} &middot; ${escapeHtml(course.nombre || "")} &middot; ${escapeHtml(trimesterLabel)} &middot; ${gestionActual()}</p>
        <div class="activity-key-list">${activityColumns.map((item) => `<div class="activity-key-item" data-key-code="${item.printCode}"><strong>${item.printCode}</strong><span>${escapeHtml(item.titulo || "Actividad sin titulo")}</span></div>`).join("")}</div>
      </section>` : ""}
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

export function printDocument(payload, subjects) {
  const page = formatoCarta();
  const gradesMap = gradeByActivityAndStudent(payload.gradesList || []);
  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Registro de evaluacion</title>
        <style>
          ${page.pagina}
          * { box-sizing: border-box; }
          html { --print-font-increase: 1.5pt; }
          html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: "Arial Narrow", Arial, sans-serif; }
          .print-page {
            width: ${page.ancho}mm;
            max-width: 100%;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .print-page:last-child { page-break-after: auto; break-after: auto; }
          .notes-print-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #202020; padding: 0 .25px; height: 12px; text-align: center; vertical-align: middle; font-size: calc(8.4px + var(--print-font-increase)); font-weight: 400; line-height: 1.05; }
          th { font-size: calc(7.8px + var(--print-font-increase)); }
          tbody td { height: calc(12px + 1pt); }
          .col-num { width: 2.6%; }
          .col-name { width: 24.5%; }
          .col-note { width: calc((100% - 2.6% - 24.5% - 3% - 3% - 8%) / var(--regular-note-count)); }
          .col-total { width: 3%; }
          .col-status { width: 8%; }
          .record-heading { padding: 0; }
          .brand-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #087B2B; color: #fff; padding: 4px 6px; font-size: 10pt; font-weight: 700; text-align: left; }
          .brand-top span { white-space: nowrap; }
          .record-meta { display: grid; grid-template-columns: 1.4fr 1.6fr .7fr; font-size: 7.4pt; text-align: left; }
          .record-meta > div { display: flex; align-items: baseline; gap: 4px; min-width: 0; padding: 4px 5px; border-top: 1px solid #202020; }
          .record-meta > div:not(:nth-child(3n)) { border-right: 1px solid #202020; }
          .record-meta strong { flex-shrink: 0; white-space: nowrap; }
          .record-meta span { min-width: 0; overflow-wrap: anywhere; font-weight: 400; }
          .school-block { height: 72px; background: #fff; }
          .school-block img { display: block; width: 72px; height: 72px; object-fit: contain; margin: 1px auto; }
          .school-title { font-size: calc(8px + var(--print-font-increase)); font-weight: 700; }
          .school-name { margin-top: 1px; font-size: calc(10.5px + var(--print-font-increase)); font-weight: 700; }
          .group { padding: 3px 0; font-weight: 700; color: #111; }
          .group > span { display: block; white-space: nowrap; }
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
          .vertical { height: 110px; padding: 2px 0; }
          .vertical-text {
            display: inline-block;
            writing-mode: vertical-rl;
            text-orientation: mixed;
            transform: rotate(180deg);
            white-space: nowrap;
            font-size: calc(7.2px + var(--print-font-increase));
            font-weight: 400;
            line-height: 1;
            letter-spacing: 0;
          }
          .activity-title { font-size: 8pt; font-weight: 700; }
          .prom .vertical-text { font-weight: 700; }
          .thin-header { height: 9px; background: #f8f8f8; }
          .col-header { font-size: calc(8px + var(--print-font-increase)); font-weight: 700; background: #fff; }
          .student-name { --print-font-increase: 1pt; text-align: left; white-space: nowrap; font-size: calc(8.4px + var(--print-font-increase)); font-weight: 400; }
          .low-note { color: #d91f26; }
          .score { background: #fef3c7; }
          .total-score { background: #fde8d1; }
          .final-ok { background: #e7f7df; color: #111; }
          .final-low { background: #fde7e7; color: #d91f26; }
          .status-ok { background: #edf8ff; color: #166534; font-size: 7.3pt; }
          .status-low { background: #edf8ff; color: #d91f26; font-size: 7.3pt; font-weight: 700; }
          .grade-scale-note { margin: 6px 0 0; font-size: 7.3pt; }
          .activity-key { margin-top: 12px; break-inside: avoid; }
          .activity-key h2 { margin: 0 0 3px; font-size: 8pt; }
          .activity-context { margin: 0 0 6px; font-size: 7.3pt; }
          .activity-key-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 14px; }
          .activity-key-item { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 4px; font-size: 8pt; line-height: 1.15; break-inside: avoid; }
          .activity-key-item span { overflow-wrap: anywhere; }
          .activity-reference-page .activity-key { margin-top: 0; }
          .activity-reference-page, .activity-reference-page .activity-key { break-inside: auto; }
          .signatures { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 34px; padding: 8px 34px 0; text-align: center; font-size: calc(7.5px + var(--print-font-increase)); break-inside: avoid; }
          .signatures span { display: block; border-top: 1px solid #111; margin: 0 auto 2px; width: 145px; }
          .signatures strong { display: block; font-size: calc(7.5px + var(--print-font-increase)); font-weight: 700; }
          .signatures small { display: block; font-size: calc(6.4px + var(--print-font-increase)); }
          .print-dense th, .print-dense td { height: 11px; font-size: calc(7.4px + var(--print-font-increase)); }
          .print-dense th { font-size: calc(7px + var(--print-font-increase)); }
          .print-dense tbody td { height: calc(11px + 1pt); }
          .print-dense .vertical { height: 110px; }
          .print-dense .vertical-text { font-size: calc(6.6px + var(--print-font-increase)); }
          .print-dense .student-name { font-size: calc(7.4px + var(--print-font-increase)); }
          .print-dense .school-block { height: 64px; }
          .print-dense .school-block img { width: 64px; height: 64px; }
          .print-dense .signatures { padding-top: 5px; }
          .print-ultra th, .print-ultra td { height: 10px; font-size: calc(6.6px + var(--print-font-increase)); }
          .print-ultra th { font-size: calc(6.4px + var(--print-font-increase)); }
          .print-ultra tbody td { height: calc(10px + 1pt); }
          .print-ultra .vertical { height: 110px; }
          .print-ultra .vertical-text { font-size: calc(6px + var(--print-font-increase)); }
          .print-ultra .student-name { font-size: calc(6.6px + var(--print-font-increase)); }
          .print-ultra .school-block { height: 58px; }
          .print-ultra .school-block img { width: 60px; height: 60px; }
          .print-ultra .school-name { font-size: calc(9px + var(--print-font-increase)); }
          .print-ultra .signatures { padding-top: 4px; }
        </style>
      </head>
      <body>
        ${subjects.flatMap((subject) => Array.from({ length: Math.max(1, Math.ceil(payload.students.length / 40)) }, (_, page) =>
          subjectSheet({ ...payload, students: payload.students.slice(page * 40, (page + 1) * 40), rowOffset: page * 40, subject, gradesMap })
        )).join("")}
        <script>
          window.addEventListener("load", async () => {
              if (document.fonts?.ready) await document.fonts.ready;
              // Reduce font size proportionally when necessary; never stretch letters or marks.
              document.querySelectorAll("tbody td, .group").forEach((cell) => {
                if (!cell.textContent.trim()) return;
                const text = document.createRange();
                text.selectNodeContents(cell);
                const width = text.getBoundingClientRect().width;
                const style = getComputedStyle(cell);
                const available = cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                if (width <= available || available <= 0) return;
                cell.style.fontSize = (parseFloat(style.fontSize) * available / width) + "px";
              });
              document.querySelectorAll(".vertical-text").forEach((label) => {
                const available = label.parentElement.clientHeight - 4;
                const height = label.getBoundingClientRect().height;
                if (height > available && available > 0) label.style.fontSize = (parseFloat(getComputedStyle(label).fontSize) * available / height) + "px";
              });

              // Keep every mark on its original sheet; only full activity titles may continue.
              const pageHeight = ${page.alto} * 96 / 25.4;
              document.querySelectorAll(".print-page").forEach((recordPage) => {
                const key = recordPage.querySelector(".activity-key");
                if (!key) return;
                const heading = key.querySelector("h2").cloneNode(true);
                const context = key.querySelector(".activity-context").cloneNode(true);
                const items = [...key.querySelectorAll(".activity-key-item")];
                let currentPage = recordPage;
                let currentList = key.querySelector(".activity-key-list");
                currentList.replaceChildren();
                items.forEach((item) => {
                  currentList.appendChild(item);
                  if (currentPage.getBoundingClientRect().height <= pageHeight) return;
                  item.remove();
                  if (!currentList.children.length && currentPage === recordPage) key.remove();
                  const nextPage = document.createElement("section");
                  nextPage.className = "print-page activity-reference-page";
                  const nextKey = document.createElement("section");
                  nextKey.className = "activity-key";
                  nextKey.append(heading.cloneNode(true), context.cloneNode(true));
                  currentList = document.createElement("div");
                  currentList.className = "activity-key-list";
                  nextKey.appendChild(currentList);
                  nextPage.appendChild(nextKey);
                  currentPage.after(nextPage);
                  currentPage = nextPage;
                  currentList.appendChild(item);
                });
              });
              document.documentElement.dataset.printReady = "true";
            setTimeout(() => {
              window.focus();
              window.print();
            }, 250);
          });
        </script>
      </body>
    </html>
  `;
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
      <p class="mt-3 text-xs leading-5 text-slate-500">Se imprimira en hoja carta vertical, con hasta 40 alumnos por pagina.</p>
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
