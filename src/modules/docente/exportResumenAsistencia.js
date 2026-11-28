import { attendanceShort, normalizarEstadoAsistencia } from "./AcademicoDocente.js";

import { formatoCarta } from "../../ui/impresion.js";

function publicAsset(path) {
  const base = import.meta.env?.BASE_URL || "/";
  return new URL(`${base}${path}`, window.location.href).href;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function normalizeDate(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function monthLabel(date) {
  const safeDate = normalizeDate(date);
  if (!safeDate) return "";
  return new Date(`${safeDate}T12:00:00`)
    .toLocaleDateString("es-BO", { month: "long", year: "numeric" })
    .toUpperCase();
}

function dayName(date) {
  const safeDate = normalizeDate(date);
  if (!safeDate) return "";
  return new Date(`${safeDate}T12:00:00`)
    .toLocaleDateString("es-BO", { weekday: "long" })
    .toUpperCase();
}

function courseLevel(course = {}) {
  const name = String(course.nombre || "");
  if (/pre/i.test(name)) return { escolaridad: "PRE INICIAL - INICIAL", paralelo: "" };
  const clean = name.replace(/\s+[A-Z]$/i, "").trim().toUpperCase();
  const paralelo = (name.match(/\s([A-Z])$/i)?.[1] || "").toUpperCase();
  return { escolaridad: clean || name.toUpperCase(), paralelo };
}

function monthGroups(records = []) {
  const keys = [...new Set(records.map((item) => normalizeDate(item.fecha)).filter(Boolean))].sort();
  return keys.reduce((groups, date) => {
    const key = date.slice(0, 7);
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = { key, label: monthLabel(date), dates: [] };
      groups.push(group);
    }
    group.dates.push(date);
    return groups;
  }, []);
}

function recordMap(records = []) {
  const map = {};
  records.forEach((item) => {
    const date = normalizeDate(item.fecha);
    if (!date || !item.alumnoId) return;
    map[item.alumnoId] ||= {};
    map[item.alumnoId][date] = normalizarEstadoAsistencia(item.estado) || "falta";
  });
  return map;
}

function stateTotalForDate(students, byStudent, date, state) {
  return students.reduce((total, student) => {
    const current = byStudent[student.id]?.[date] || "";
    return total + (current === state ? 1 : 0);
  }, 0);
}

function sortStudentsByName(students = []) {
  return [...students].sort((a, b) => {
    const nameOrder = String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" });
    return nameOrder || Number(a.numeroLista || 9999) - Number(b.numeroLista || 9999);
  });
}

function studentRows(students = [], byStudent = {}, dates = [], offset = 0) {
  const padded = [...students];
  while (padded.length < 40) padded.push({ empty: true, numeroLista: padded.length + 1, nombre: "" });

  return padded.map((student, index) => {
    const totals = { presente: 0, falta: 0, atraso: 0, permiso: 0 };
    const cells = dates.map((date) => {
      const state = student.empty ? "" : byStudent[student.id]?.[date] || "";
      if (state && totals[state] !== undefined) totals[state] += 1;
      return `<td class="attendance-cell">${state ? escapeHtml(attendanceShort(state)) : ""}</td>`;
    }).join("");
    return `
      <tr${student.empty ? ' class="empty-student-row"' : ""}>
        <td class="number-cell">${offset + index + 1}</td>
        <td class="student-cell">${escapeHtml(student.nombre || "")}</td>
        ${cells}
        <td class="total-cell">${student.empty ? "" : totals.presente}</td>
        <td class="total-cell">${student.empty ? "" : totals.falta}</td>
        <td class="total-cell">${student.empty ? "" : totals.atraso}</td>
        <td class="total-cell">${student.empty ? "" : totals.permiso}</td>
        <td class="worked-cell">${student.empty ? "" : dates.length}</td>
      </tr>
    `;
  }).join("");
}

function totalsRows(students, byStudent, dates, multiplePages) {
  const totalRow = (label, state) => {
    const monthTotal = dates.reduce((total, date) => total + stateTotalForDate(students, byStudent, date, state), 0);
    return `
      <tr>
        <td class="bottom-label" colspan="2">${label}</td>
        ${dates.map((date) => `<td class="attendance-cell">${stateTotalForDate(students, byStudent, date, state) || ""}</td>`).join("")}
        <td class="bottom-total" colspan="5">TOTAL ${multiplePages ? "HOJA" : "MES"}: ${monthTotal}</td>
      </tr>
    `;
  };

  return [
    totalRow("TOTAL PRESENTES DIA:", "presente"),
    totalRow("TOTAL FALTAS DIA:", "falta"),
    totalRow("TOTAL ATRASOS DIA:", "atraso"),
    totalRow("TOTAL LICENCIAS DIA:", "permiso")
  ].join("");
}

function sheetHtml({ group, course, trimesterLabel, teacherName, students, byStudent, offset, pageNumber, pageCount }) {
  const { escolaridad, paralelo } = courseLevel(course);
  const year = group.key.slice(0, 4);
  const monthName = group.label.replace(/\s+(?:DE\s+)?\d{4}$/i, "");
  const safeTeacher = String(teacherName || "DOCENTE").toUpperCase();
  const directorName = "MSC. SAMUEL RONAL MENDOZA CALLE";

  return `
    <section class="sheet${group.dates.length > 26 ? " sheet-dense" : ""}" style="--date-count: ${group.dates.length}">
      <header class="top-grid">
        <div class="title-strip">ASISTENCIA&nbsp;&nbsp; ${escapeHtml(monthName)} &nbsp; ${escapeHtml(year)}</div>
        <div class="field field-wide"><b>AÑO DE ESCOLARIDAD:</b><span>${escapeHtml(escolaridad)}</span></div>
        <div class="field"><b>DISTRITO:</b><span>CARANAVI</span></div>
        <div class="field field-wide"><b>NIVEL:</b><span>PRIMARIA COMUNITARIA VOCACIONAL</span></div>
        <div class="field field-parallel"><b>PARALELO:</b><span>${escapeHtml(paralelo || "-")}</span></div>
        <div class="field"><b>TURNO:</b><span>MAÑANA</span></div>
        <div class="field field-wide"><b>MAESTRA / O:</b><span>${escapeHtml(safeTeacher)}</span></div>
      </header>

      <table class="attendance-table">
        <colgroup>
          <col class="number-col">
          <col class="student-col">
          ${group.dates.map(() => `<col class="date-col">`).join("")}
          <col class="summary-col">
          <col class="summary-col">
          <col class="summary-col">
          <col class="summary-col">
          <col class="worked-col">
        </colgroup>
        <thead>
          <tr>
            <th class="school-head" colspan="2" rowspan="2">
              <img src="${publicAsset("images/logo-nueva-bolivia.png")}" alt="Escudo de la Unidad Educativa Ecologica Nueva Bolivia">
              <span>UNIDAD EDUCATIVA</span>
              <strong>ECOLOGICA NUEVA BOLIVIA</strong>
              <small>${escapeHtml(trimesterLabel || "")}</small>
              ${pageCount > 1 ? `<small>HOJA ${pageNumber} DE ${pageCount}</small>` : ""}
            </th>
            ${group.dates.map((date) => `<th class="vertical-head day-head" rowspan="2"><span>${escapeHtml(dayName(date))}</span></th>`).join("")}
            <th class="totals-head" colspan="5">TOTALES</th>
          </tr>
          <tr>
            <th class="vertical-head totals-vertical"><span>PRESENTES</span></th>
            <th class="vertical-head totals-vertical"><span>FALTAS</span></th>
            <th class="vertical-head totals-vertical"><span>ATRASOS</span></th>
            <th class="vertical-head totals-vertical"><span>LICENCIAS</span></th>
            <th class="vertical-head worked-vertical"><span>DÍAS TRABAJADOS</span></th>
          </tr>
          <tr>
            <th class="number-cell">N°</th>
            <th class="student-cell">APELLIDOS Y NOMBRES</th>
            ${group.dates.map((date) => `<th class="date-number">${date.slice(8, 10)}</th>`).join("")}
            <th class="total-letter">P</th>
            <th class="total-letter">F</th>
            <th class="total-letter">A</th>
            <th class="total-letter">L</th>
            <th class="total-letter"></th>
          </tr>
        </thead>
        <tbody>${studentRows(students, byStudent, group.dates, offset)}</tbody>
        <tfoot>${totalsRows(students, byStudent, group.dates, pageCount > 1)}</tfoot>
      </table>

      <p class="attendance-legend">P: Presente &nbsp; F: Falta &nbsp; A: Atraso &nbsp; L: Licencia</p>

      <footer class="signatures">
        <div>
          <span></span>
          <b>${escapeHtml(safeTeacher)}</b>
          <small>MAESTRA/O DEL AREA DE PRIMARIA COMUNITARIA VOCACIONAL</small>
        </div>
        <div>
          <span></span>
          <b>${directorName}</b>
          <small>DIRECTOR UNIDAD EDUCATIVA ECOLOGICA NUEVA BOLIVIA</small>
        </div>
      </footer>
    </section>
  `;
}

export function printAttendanceSummaryByMonth({ course, trimesterLabel, teacherName, students = [], records = [] }) {
  const page = formatoCarta();
  const groups = monthGroups(records);
  if (!groups.length) {
    alert("No hay meses con asistencia registrada para imprimir.");
    return;
  }
  const byStudent = recordMap(records);
  const sortedStudents = sortStudentsByName(students);
  const studentPages = [];
  for (let offset = 0; offset < Math.max(sortedStudents.length, 1); offset += 40) {
    studentPages.push({ students: sortedStudents.slice(offset, offset + 40), offset });
  }
  const printWindow = window.open("", "_blank", "width=900,height=1100");
  if (!printWindow) {
    alert("El navegador bloqueo la ventana de impresion.");
    return;
  }

  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Resumen asistencia ${escapeHtml(course?.nombre || "")}</title>
        <style>
          ${page.pagina}
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #f3f4f6;
            color: #111;
            font-family: Arial, sans-serif;
            line-height: 1.1;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .sheet {
            width: ${page.ancho}mm;
            max-width: 100%;
            height: calc(${page.alto}mm - 4mm);
            margin: 0 auto 18px;
            display: flex;
            flex-direction: column;
            background: #fff;
            break-after: page;
            page-break-after: always;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .sheet:last-child { break-after: auto; page-break-after: auto; }
          .top-grid {
            display: grid;
            grid-template-columns: minmax(0, 2.85fr) minmax(0, 1.25fr) minmax(0, 2.35fr) minmax(0, .9fr);
            gap: 2px;
            align-items: stretch;
            margin-bottom: 3px;
            font-size: 7pt;
            font-weight: 700;
            flex-shrink: 0;
          }
          .title-strip {
            grid-column: span 2;
            background: #050505;
            color: #fff;
            min-height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 17px;
            letter-spacing: 0;
          }
          .field {
            border: 1px solid #111;
            min-height: 22px;
            display: grid;
            grid-template-columns: auto minmax(0, 1fr);
            align-items: center;
            gap: 4px;
            padding: 1px 5px;
            text-transform: uppercase;
          }
          .field span {
            overflow-wrap: anywhere;
            text-align: center;
            font-size: 8.5pt;
            font-weight: 500;
          }
          .field-wide { grid-column: span 2; }
          .field-parallel { gap: 2px; padding-inline: 3px; }
          .field-parallel b { font-size: 9px; }
          .field-parallel span { font-size: 24px; line-height: 1; }
          table { border-collapse: collapse; width: 100%; table-layout: fixed; }
          .number-col { width: 3%; }
          .student-col { width: 27%; }
          .date-col { width: calc(54% / var(--date-count)); }
          .summary-col, .worked-col { width: 3.2%; }
          th, td {
            border: 1px solid #111;
            padding: 0;
            vertical-align: middle;
            line-height: 1.1;
          }
          .attendance-table { font-size: 8.5pt; flex-shrink: 0; }
          .attendance-table tbody tr { height: var(--attendance-row-height, 15px); }
          .attendance-table tr { break-inside: avoid; page-break-inside: avoid; }
          .school-head {
            height: 144px;
            text-align: center;
            font-size: 7.5pt;
            line-height: 1.1;
          }
          .school-head img {
            display: block;
            width: 96px;
            height: 96px;
            object-fit: contain;
            margin: 0 auto 1px;
          }
          .school-head span, .school-head strong, .school-head small { display: block; }
          .school-head strong { margin-top: 3px; font-size: 9pt; }
          .school-head small { margin-top: 3px; font-size: 7.5pt; font-weight: 700; }
          .vertical-head {
            text-align: center;
            font-size: 7.5pt;
            font-weight: 700;
          }
          .vertical-head span {
            display: inline-block;
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            line-height: 1;
            white-space: nowrap;
          }
          .day-head { padding: 3px 0; }
          .totals-vertical, .worked-vertical { height: 122px; }
          .totals-head {
            height: 22px;
            text-align: center;
            font-size: 8pt;
            font-weight: 700;
          }
          .number-cell {
            text-align: center;
            font-size: 8pt;
            font-weight: 700;
          }
          .student-cell {
            padding: 0 3px;
            text-align: left;
            font-size: 8pt;
            font-weight: 700;
            overflow-wrap: anywhere;
          }
          tbody .student-cell {
            font-size: 8.2pt;
            font-weight: 600;
            letter-spacing: 0;
          }
          .date-number, .attendance-cell {
            text-align: center;
            font-size: 8.5pt;
            font-weight: 700;
          }
          .date-number, .total-letter { height: 19px; }
          .attendance-cell { color: #082a7a; }
          .total-letter, .total-cell {
            text-align: center;
            font-size: 8pt;
            font-weight: 700;
          }
          .worked-cell { text-align: center; font-size: 8pt; font-weight: 700; }
          tfoot { font-size: 7.5pt; font-weight: 700; }
          tfoot tr { height: 15px; }
          tfoot .attendance-cell { font-size: 7.5pt; }
          .bottom-label {
            padding-right: 4px;
            text-align: right;
          }
          .bottom-total {
            padding-right: 5px;
            text-align: right;
            font-size: 7.5pt;
          }
          .sheet-dense .date-number, .sheet-dense tfoot .attendance-cell { font-size: 7pt; }
          .sheet-dense tbody .attendance-cell { font-size: 8pt; }
          .attendance-legend { margin: 5px 0 0; text-align: center; font-size: 7.5pt; flex-shrink: 0; }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 34px;
            margin-top: auto;
            padding: 20px 18px 0;
            text-align: center;
            font-size: 7.5pt;
            break-inside: avoid;
            flex-shrink: 0;
          }
          .signatures span {
            display: block;
            border-top: 1px solid #111;
            margin-bottom: 4px;
          }
          .signatures b, .signatures small { display: block; }
          .signatures small { margin-top: 2px; font-size: 6.5pt; }
          @media print {
            body { background: #fff; }
            .sheet { margin: 0; max-width: none; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        ${groups.flatMap((group) => studentPages.map((studentPage, index) => sheetHtml({ group, course, trimesterLabel, teacherName, ...studentPage, byStudent, pageNumber: index + 1, pageCount: studentPages.length }))).join("")}
        <script>
          function fitAttendanceSheets() {
            document.querySelectorAll(".sheet").forEach((sheet) => {
              let rowHeight = 15;
              sheet.style.setProperty("--attendance-row-height", rowHeight + "px");
              const footer = sheet.querySelector(".signatures");
              while (footer.getBoundingClientRect().bottom > sheet.getBoundingClientRect().bottom + 0.5 && rowHeight > 13.5) {
                rowHeight = Math.max(13.5, rowHeight - 0.25);
                sheet.style.setProperty("--attendance-row-height", rowHeight + "px");
              }
            });
          }
          window.addEventListener("beforeprint", fitAttendanceSheets);
          window.addEventListener("load", async () => {
            if (document.fonts?.ready) await document.fonts.ready;
            document.querySelectorAll("tbody .student-cell").forEach((cell) => {
              if (!cell.textContent.trim()) return;
              const text = document.createElement("span");
              text.textContent = cell.textContent;
              text.style.whiteSpace = "nowrap";
              cell.replaceChildren(text);
              let fontSize = 8.2;
              while (text.getBoundingClientRect().width > cell.clientWidth - 6 && fontSize > 6.5) {
                fontSize = Math.max(6.5, fontSize - 0.1);
                cell.style.fontSize = fontSize + "pt";
              }
              text.style.whiteSpace = "normal";
            });
            fitAttendanceSheets();
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

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
