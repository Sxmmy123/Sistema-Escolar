import { attendanceShort } from "./AcademicoDocente.js";

function publicAsset(path) {
  const base = import.meta.env.BASE_URL || "/";
  const assetPath = `${base}${path}`.replace(/\/+/g, "/");
  return new URL(assetPath, window.location.origin).href;
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
    map[item.alumnoId][date] = item.estado || "falta";
  });
  return map;
}

function stateTotalForDate(students, byStudent, date, state) {
  return students.reduce((total, student) => {
    const current = byStudent[student.id]?.[date] || "";
    return total + (current === state ? 1 : 0);
  }, 0);
}

function studentRows(students = [], byStudent = {}, dates = []) {
  const rows = [...students].sort((a, b) => {
    const aNumber = Number(a.numeroLista || 9999);
    const bNumber = Number(b.numeroLista || 9999);
    return aNumber - bNumber || String(a.nombre || "").localeCompare(String(b.nombre || ""));
  });
  const padded = [...rows];
  while (padded.length < 40) padded.push({ empty: true, numeroLista: padded.length + 1, nombre: "" });

  return padded.map((student, index) => {
    const totals = { presente: 0, falta: 0, atraso: 0, permiso: 0 };
    const cells = dates.map((date) => {
      const state = student.empty ? "" : byStudent[student.id]?.[date] || "";
      if (state && totals[state] !== undefined) totals[state] += 1;
      return `<td class="attendance-cell">${state ? escapeHtml(attendanceShort(state)) : ""}</td>`;
    }).join("");
    return `
      <tr>
        <td class="number-cell">${student.numeroLista || index + 1}</td>
        <td class="student-cell">${escapeHtml(student.nombre || "")}</td>
        <td class="activity-cell"></td>
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

function totalsRows(students, byStudent, dates) {
  const totalRow = (label, state) => {
    const monthTotal = dates.reduce((total, date) => total + stateTotalForDate(students, byStudent, date, state), 0);
    return `
      <tr>
        <td class="bottom-label" colspan="2">${label}</td>
        ${dates.map((date) => `<td class="attendance-cell">${stateTotalForDate(students, byStudent, date, state) || ""}</td>`).join("")}
        <td class="bottom-total" colspan="5">TOTAL MES = ${monthTotal}</td>
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

function sheetHtml({ group, course, trimesterLabel, teacherName, students, byStudent }) {
  const { escolaridad, paralelo } = courseLevel(course);
  const year = group.key.slice(0, 4);
  const monthName = group.label.replace(/\s+\d{4}$/i, "");
  const safeTeacher = String(teacherName || "DOCENTE").toUpperCase();
  const directorName = "MSC. SAMUEL RONAL MENDOZA CALLE";

  return `
    <section class="sheet">
      <header class="top-grid">
        <div class="title-strip">ASISTENCIA&nbsp;&nbsp; ${escapeHtml(monthName)} &nbsp; ${escapeHtml(year)}</div>
        <div class="field field-wide"><b>AÑO DE ESCOLARIDAD:</b><span>${escapeHtml(escolaridad)}</span></div>
        <div class="field"><b>DISTRITO:</b><span>CARANAVI</span></div>
        <div class="field field-wide"><b>NIVEL:</b><span>PRIMARIA COMUNITARIA VOCACIONAL</span></div>
        <div class="field field-parallel" rowspan="2"><b>PARALELO:</b><span>${escapeHtml(paralelo || "-")}</span></div>
        <div class="field"><b>TURNO:</b><span>MAÑANA</span></div>
        <div class="field field-wide"><b>MAESTRA / O:</b><span>${escapeHtml(safeTeacher)}</span></div>
      </header>

      <table class="attendance-table">
        <colgroup>
          <col class="number-col">
          <col class="student-col">
          <col class="activity-col">
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
              <img src="${publicAsset("images/logo-nueva-bolivia.png")}" alt="">
              <span>UNIDAD EDUCATIVA</span>
              <strong>ECOLOGICA NUEVA BOLIVIA</strong>
              <small>${escapeHtml(trimesterLabel || "")}</small>
            </th>
            <th class="vertical-head activity-head" rowspan="2">ACTIVIDAD</th>
            ${group.dates.map((date) => `<th class="vertical-head">${escapeHtml(`${String(Number(date.slice(8, 10)))} DE ${monthName} ${year}`)}</th>`).join("")}
            <th class="totals-head" colspan="5">TOTALES</th>
          </tr>
          <tr>
            ${group.dates.map((date) => `<th class="vertical-head day-head">${escapeHtml(dayName(date))}</th>`).join("")}
            <th class="vertical-head totals-vertical">PRESENTES</th>
            <th class="vertical-head totals-vertical">FALTAS</th>
            <th class="vertical-head totals-vertical">ATRASOS</th>
            <th class="vertical-head totals-vertical">LICENCIAS</th>
            <th class="vertical-head worked-vertical">DÍAS TRABAJADOS</th>
          </tr>
          <tr>
            <th class="number-cell">N°</th>
            <th class="student-cell">APELLIDOS Y NOMBRES</th>
            <th class="vertical-head date-label">FECHA</th>
            ${group.dates.map((date) => `<th class="date-number">${date.slice(8, 10)}</th>`).join("")}
            <th class="total-letter">P</th>
            <th class="total-letter">F</th>
            <th class="total-letter">A</th>
            <th class="total-letter">L</th>
            <th class="total-letter"></th>
          </tr>
        </thead>
        <tbody>${studentRows(students, byStudent, group.dates)}</tbody>
      </table>

      <table class="bottom-table">
        <tbody>${totalsRows(students, byStudent, group.dates)}</tbody>
      </table>

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
  const groups = monthGroups(records);
  if (!groups.length) {
    alert("No hay meses con asistencia registrada para imprimir.");
    return;
  }
  const byStudent = recordMap(records);
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
          @page { size: letter portrait; margin: 0.18in; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #f3f4f6;
            color: #111;
            font-family: "Arial Narrow", Arial, sans-serif;
          }
          .sheet {
            width: 8.14in;
            min-height: 10.62in;
            margin: 0 auto 18px;
            padding: 0.08in;
            background: #fff;
            break-after: page;
            page-break-after: always;
          }
          .sheet:last-child { break-after: auto; page-break-after: auto; }
          .top-grid {
            display: grid;
            grid-template-columns: 2.85in 1.25in 2.35in 0.9in;
            gap: 0.02in;
            align-items: stretch;
            margin-bottom: 0.02in;
            font-size: 10px;
            font-weight: 700;
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
            letter-spacing: 0.5px;
          }
          .field {
            border: 1px solid #111;
            min-height: 22px;
            display: grid;
            grid-template-columns: auto 1fr;
            align-items: center;
            gap: 4px;
            padding: 1px 5px;
            text-transform: uppercase;
          }
          .field span {
            text-align: center;
            font-size: 13px;
            font-weight: 500;
          }
          .field-wide { grid-column: span 2; }
          .field-parallel span { font-size: 31px; line-height: 1; }
          table { border-collapse: collapse; width: 100%; table-layout: fixed; }
          .number-col { width: 0.18in; }
          .student-col { width: 2.26in; }
          .activity-col { width: 0.1in; }
          .date-col { width: 0.125in; }
          .summary-col { width: 0.1in; }
          .worked-col { width: 0.12in; }
          th, td {
            border: 1px solid #111;
            padding: 0;
            vertical-align: middle;
            overflow: hidden;
          }
          .attendance-table { font-size: 9px; }
          .school-head {
            height: 0.86in;
            text-align: center;
            font-size: 10px;
            line-height: 1.1;
          }
          .school-head img {
            display: block;
            width: 0.43in;
            height: 0.43in;
            object-fit: contain;
            margin: 0 auto 1px;
          }
          .school-head span, .school-head strong, .school-head small { display: block; }
          .school-head strong { margin-top: 4px; font-size: 14px; }
          .school-head small { margin-top: 3px; font-size: 8px; font-weight: 700; }
          .vertical-head {
            width: 0.14in;
            height: 0.72in;
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            text-align: center;
            font-size: 8px;
            line-height: 1;
            font-weight: 700;
            white-space: nowrap;
          }
          .activity-head { width: 0.1in; }
          .activity-cell {
            width: 0.1in;
            height: 0.15in;
            background: #fff;
          }
          .date-label {
            height: 0.28in;
            font-size: 8px;
          }
          .day-head { height: 0.52in; font-size: 7px; }
          .totals-head {
            height: 0.2in;
            text-align: center;
            font-size: 10px;
            font-weight: 700;
          }
          .number-cell {
            width: 0.19in;
            height: 0.15in;
            text-align: center;
            font-size: 9px;
            font-weight: 700;
          }
          .student-cell {
            width: 2.26in;
            height: 0.15in;
            padding-left: 4px;
            text-align: left;
            font-size: 9px;
            font-weight: 700;
            white-space: nowrap;
          }
          tbody .student-cell {
            font-size: 8.8px;
            font-weight: 600;
            letter-spacing: 0;
          }
          .date-number, .attendance-cell {
            width: 0.125in;
            height: 0.15in;
            text-align: center;
            font-size: 9px;
            font-weight: 700;
          }
          .attendance-cell { color: #082a7a; }
          .total-letter, .total-cell {
            width: 0.1in;
            text-align: center;
            font-size: 7px;
            font-weight: 700;
          }
          .totals-vertical {
            width: 0.1in;
            font-size: 6.7px;
            letter-spacing: 0;
          }
          .worked-vertical {
            width: 0.12in;
            font-size: 6.4px;
            letter-spacing: 0;
          }
          .worked-cell { width: 0.12in; text-align: center; font-size: 7px; font-weight: 700; }
          .bottom-table {
            width: calc(100% - 1.08in);
            margin-left: 1.08in;
            margin-top: 0.02in;
            font-size: 8px;
            font-weight: 700;
          }
          .bottom-label {
            width: 1.25in;
            padding-right: 4px;
            text-align: right;
            height: 0.15in;
          }
          .bottom-total {
            width: 0.9in;
            padding-right: 5px;
            text-align: right;
            font-size: 8px;
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.1in;
            margin-top: 0.36in;
            padding: 0 0.75in;
            text-align: center;
            font-size: 8px;
          }
          .signatures span {
            display: block;
            height: 0.18in;
            border-bottom: 1px solid #111;
            margin-bottom: 4px;
          }
          .signatures b, .signatures small { display: block; }
          .signatures small { margin-top: 2px; font-size: 6.8px; }
          @media print {
            body { background: #fff; }
            .sheet { margin: 0; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        ${groups.map((group) => sheetHtml({ group, course, trimesterLabel, teacherName, students, byStudent })).join("")}
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

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
