function escapeExcel(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function excelCell(value) {
  return escapeExcel(value === null || value === undefined || value === "" ? "" : value);
}

function downloadExcelHtml(filename, html) {
  const blob = new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function excelColumnName(index) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

export function exportNotesToExcel({
  course,
  selectedSubject,
  selectedTrimesterLabel,
  students,
  subjectActivities,
  serCriteria,
  autoActivity,
  gradesMap,
  attendanceRows,
  studentActivityGrade,
  calculateStudentTerm
}) {
  const tasks = subjectActivities.filter((item) => item.tipo !== "examen");
  const exams = subjectActivities.filter((item) => item.tipo === "examen");
  const examColumns = exams.length ? exams : [{ id: "__sin_examenes", titulo: "Sin examenes", maximo: 100 }];
  const taskColumns = tasks.length ? tasks : [{ id: "__sin_tareas", titulo: "Sin tareas", maximo: 100 }];
  const headers = [
    "No.",
    "Alumno",
    "Asistencia",
    "Puntualidad",
    "Responsabilidad",
    ...serCriteria.map((item) => item.titulo),
    "Prom. SER",
    "Punt. SER",
    ...examColumns.map((item) => item.titulo),
    "Prom. SABER",
    "Punt. SABER",
    ...taskColumns.map((item) => item.titulo),
    "Prom. HACER",
    "Punt. HACER",
    "Autoevaluacion",
    "Punt. Auto",
    "Nota final",
    "Situacion"
  ];
  const infoCols = 2;
  const serCols = 3 + serCriteria.length + 2;
  const saberCols = examColumns.length + 2;
  const hacerCols = taskColumns.length + 2;
  const autoCols = 2;
  const finalCols = 2;
  const serStart = 3;
  const serBaseEnd = serStart + 3 + serCriteria.length - 1;
  const serAverageCol = serBaseEnd + 1;
  const serScoreCol = serAverageCol + 1;
  const saberStart = serScoreCol + 1;
  const saberEnd = saberStart + examColumns.length - 1;
  const saberAverageCol = saberEnd + 1;
  const saberScoreCol = saberAverageCol + 1;
  const hacerStart = saberScoreCol + 1;
  const hacerEnd = hacerStart + taskColumns.length - 1;
  const hacerAverageCol = hacerEnd + 1;
  const hacerScoreCol = hacerAverageCol + 1;
  const autoGradeCol = hacerScoreCol + 1;
  const autoScoreCol = autoGradeCol + 1;
  const finalCol = autoScoreCol + 1;
  const formulaCell = (formula, className = "") => `<td class="${className}">=${excelCell(formula)}</td>`;
  const valueCell = (value, className = "") => `<td class="${className}">${excelCell(value)}</td>`;
  const rowAverageFormula = (startCol, endCol, rowNumber) => `REDONDEAR(SUMA(${excelColumnName(startCol)}${rowNumber}:${excelColumnName(endCol)}${rowNumber})/${Math.max(1, endCol - startCol + 1)};0)`;
  const weightedFormula = (averageCol, weight, rowNumber) => `REDONDEAR(${excelColumnName(averageCol)}${rowNumber}*${weight}/100;0)`;
  const statusFormula = (rowNumber) => `SI(${excelColumnName(finalCol)}${rowNumber}<=50;"Reprobado";"Aprobado")`;
  const title = `Notas - ${course.nombre} - ${selectedSubject?.nombre || "Materia"} - ${selectedTrimesterLabel}`;
  const table = `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #393633; padding: 4px; font-size: 11px; text-align: center; }
          th { color: #393633; font-weight: bold; }
          .vertical { height: 120px; width: 28px; mso-rotate: 90; writing-mode: tb-rl; vertical-align: middle; }
          .title { font-size: 16px; font-weight: bold; text-align: center; }
          .meta { font-size: 12px; font-weight: bold; text-align: left; background: #F7B51B; color: #393633; }
          .name { text-align: left; white-space: nowrap; }
          .group-info { background: #f8fafc; }
          .group-ser { background: #dcfce7; }
          .group-saber { background: #dbeafe; }
          .group-hacer { background: #fef3c7; }
          .group-auto { background: #ede9fe; }
          .group-final { background: #e5e7eb; }
          .ser-cell { background: #f0fdf4; }
          .saber-cell { background: #eff6ff; }
          .hacer-cell { background: #fffbeb; }
          .auto-cell { background: #f5f3ff; }
          .formula { background: #fff7ed; font-weight: bold; }
          .final { background: #ecfdf5; font-weight: bold; }
        </style>
      </head>
      <body>
        <table>
          <tr><td class="title" colspan="${headers.length}">${excelCell(title)}</td></tr>
          <tr><td class="meta" colspan="${headers.length}">Curso: ${excelCell(course.nombre)} | Materia: ${excelCell(selectedSubject?.nombre || "")} | Trimestre: ${excelCell(selectedTrimesterLabel)} | Generado: ${excelCell(new Date().toLocaleString("es-BO"))}</td></tr>
          <tr>
            <th class="group-info" colspan="${infoCols}">Alumno</th>
            <th class="group-ser" colspan="${serCols}">SER 10</th>
            <th class="group-saber" colspan="${saberCols}">SABER 45</th>
            <th class="group-hacer" colspan="${hacerCols}">HACER 40</th>
            <th class="group-auto" colspan="${autoCols}">Autoevaluacion 5</th>
            <th class="group-final" colspan="${finalCols}">Final</th>
          </tr>
          <tr>${headers.map((header, index) => {
            const col = index + 1;
            const className = col <= infoCols ? "group-info" : col <= serScoreCol ? "group-ser" : col <= saberScoreCol ? "group-saber" : col <= hacerScoreCol ? "group-hacer" : col <= autoScoreCol ? "group-auto" : "group-final";
            return `<th class="${className}${col > infoCols ? " vertical" : ""}">${excelCell(header)}</th>`;
          }).join("")}</tr>
          ${students.map((student, index) => {
            const rowNumber = index + 5;
            const serAverage = rowAverageFormula(serStart, serBaseEnd, rowNumber);
            const saberAverage = rowAverageFormula(saberStart, saberEnd, rowNumber);
            const hacerAverage = rowAverageFormula(hacerStart, hacerEnd, rowNumber);
            const finalFormula = `SUMA(${excelColumnName(serScoreCol)}${rowNumber};${excelColumnName(saberScoreCol)}${rowNumber};${excelColumnName(hacerScoreCol)}${rowNumber};${excelColumnName(autoScoreCol)}${rowNumber})`;
            const serExtraValues = serCriteria.map((item) => studentActivityGrade(item, student.id, gradesMap));
            const autoGrade = autoActivity ? gradesMap[autoActivity.id]?.[student.id]?.nota : null;
            const calc = calculateStudentTerm(student, subjectActivities, gradesMap, attendanceRows, serExtraValues, autoGrade);
            return `<tr>
              ${valueCell(index + 1)}
              ${valueCell(student.nombre, "name")}
              ${valueCell(calc.asistencia100, "ser-cell")}
              ${valueCell(calc.puntualidad100, "ser-cell")}
              ${valueCell(calc.responsabilidad100, "ser-cell")}
              ${serCriteria.map((item) => valueCell(studentActivityGrade(item, student.id, gradesMap), "ser-cell")).join("")}
              ${formulaCell(serAverage, "formula ser-cell")}
              ${formulaCell(weightedFormula(serAverageCol, 10, rowNumber), "formula ser-cell")}
              ${examColumns.map((item) => valueCell(item.id === "__sin_examenes" ? 35 : studentActivityGrade(item, student.id, gradesMap), "saber-cell")).join("")}
              ${formulaCell(saberAverage, "formula saber-cell")}
              ${formulaCell(weightedFormula(saberAverageCol, 45, rowNumber), "formula saber-cell")}
              ${taskColumns.map((item) => valueCell(item.id === "__sin_tareas" ? 35 : studentActivityGrade(item, student.id, gradesMap), "hacer-cell")).join("")}
              ${formulaCell(hacerAverage, "formula hacer-cell")}
              ${formulaCell(weightedFormula(hacerAverageCol, 40, rowNumber), "formula hacer-cell")}
              ${valueCell(autoActivity ? studentActivityGrade(autoActivity, student.id, gradesMap) : 35, "auto-cell")}
              ${formulaCell(weightedFormula(autoGradeCol, 5, rowNumber), "formula auto-cell")}
              ${formulaCell(finalFormula, "final")}
              ${formulaCell(statusFormula(rowNumber), "final")}
            </tr>`;
          }).join("")}
        </table>
      </body>
    </html>
  `;
  const safeName = `${course.nombre}_${selectedSubject?.nombre || "materia"}_${selectedTrimesterLabel}`.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  downloadExcelHtml(`notas_${safeName}.xls`, table);
}

