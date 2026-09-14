import { icon } from "../../ui/dom.js";
import {
  COURSES,
  attendancePercent,
  attendanceTotals,
  getDirectorAttendanceSettings,
  listDirectorAttendance,
  listDirectorAttendanceByTrimester,
  listDirectorRecentAttendance,
  listDirectorStudents,
  saveDirectorAttendanceSettings,
  sendStudentAttendanceWarning
} from "../../services/directorData.js";
import { DirectorShell, directorStat } from "./DirectorShell.js";
import { escapeDirectorHtml, refreshDirectorIcons } from "./DirectorUtils.js";

const TRIMESTERS = [
  { id: "t1", label: "1er trimestre", short: "1ro" },
  { id: "t2", label: "2do trimestre", short: "2do" },
  { id: "t3", label: "3er trimestre", short: "3ro" }
];

const rememberedTrimester = sessionStorage.getItem("directorAsistenciaTrimestre") || "";
const attendanceState = {
  initialized: false,
  loading: false,
  trimesterId: TRIMESTERS.some((item) => item.id === rememberedTrimester) ? rememberedTrimester : "",
  courseId: sessionStorage.getItem("directorAsistenciaCurso") || "",
  students: [],
  todayRecords: [],
  recordsByTrimester: new Map(),
  limiteFaltas: 4,
  notice: ""
};

function normalizeAttendanceState(value = "") {
  const key = String(value || "").toLowerCase();
  return key === "licencia" ? "permiso" : key;
}

function currentTrimester() {
  return TRIMESTERS.find((item) => item.id === attendanceState.trimesterId) || TRIMESTERS[1];
}

function currentRecords() {
  return attendanceState.recordsByTrimester.get(attendanceState.trimesterId) || [];
}

function recordsForStudent(studentId, records = currentRecords()) {
  return records
    .filter((item) => item.alumnoId === studentId)
    .sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")));
}

function courseById(courseId = "") {
  return COURSES.find((item) => item.id === courseId) || { id: courseId, nombre: courseId || "Sin curso", corto: courseId || "-" };
}

function uniqueDates(records = []) {
  return new Set(records.map((item) => item.fecha).filter(Boolean)).size;
}

function studentSummary(student, records = currentRecords()) {
  const studentRecords = recordsForStudent(student.id, records);
  const normalized = studentRecords.map((item) => ({ ...item, estado: normalizeAttendanceState(item.estado) }));
  const totals = attendanceTotals(normalized);
  return {
    student,
    records: studentRecords,
    totals,
    percent: attendancePercent(normalized),
    lastAbsence: [...studentRecords].reverse().find((item) => normalizeAttendanceState(item.estado) === "falta")?.fecha || ""
  };
}

function visibleStudents() {
  return attendanceState.students.filter((student) => !attendanceState.courseId || student.cursoId === attendanceState.courseId);
}

function visibleRecords() {
  return currentRecords().filter((item) => !attendanceState.courseId || item.cursoId === attendanceState.courseId);
}

function sortedStudentSummaries() {
  return visibleStudents()
    .map((student) => studentSummary(student))
    .sort((a, b) => (b.totals.falta || 0) - (a.totals.falta || 0)
      || (b.totals.atraso || 0) - (a.totals.atraso || 0)
      || String(a.student.nombre || "").localeCompare(String(b.student.nombre || "")));
}

function alertSummaries() {
  return sortedStudentSummaries().filter((item) => (item.totals.falta || 0) > attendanceState.limiteFaltas);
}

function compactDistribution(totals, total) {
  const parts = [
    ["presente", "bg-school-green"],
    ["atraso", "bg-school-gold"],
    ["permiso", "bg-blue-500"],
    ["falta", "bg-red-500"]
  ];
  return `
    <div class="flex h-1.5 min-w-24 overflow-hidden rounded-full bg-slate-100" aria-label="Distribucion de asistencia">
      ${parts.map(([key, tone]) => {
        const width = total ? ((totals[key] || 0) / total) * 100 : 0;
        return width ? `<span class="${tone}" style="width:${width}%"></span>` : "";
      }).join("")}
    </div>
  `;
}

function formatShortDate(value = "") {
  if (!value) return "Sin faltas";
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" });
}

function courseTabs() {
  const records = currentRecords();
  const tabs = [{ id: "", nombre: "Todos", corto: "Todos" }, ...COURSES];
  return tabs.map((course) => {
    const active = attendanceState.courseId === course.id;
    const courseStudents = course.id
      ? attendanceState.students.filter((student) => student.cursoId === course.id)
      : attendanceState.students;
    const alerts = courseStudents.filter((student) => (studentSummary(student, records).totals.falta || 0) > attendanceState.limiteFaltas).length;
    return `
      <button type="button" data-director-attendance-course="${escapeDirectorHtml(course.id)}" class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${active ? "border-school-green bg-school-green text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-school-green/50 hover:text-school-green"}">
        ${course.id ? icon("school", "h-3.5 w-3.5") : icon("layout-grid", "h-3.5 w-3.5")}
        <span>${escapeDirectorHtml(course.corto || course.nombre)}</span>
        ${alerts ? `<span class="grid min-w-5 place-items-center rounded-md px-1 text-[10px] ${active ? "bg-white/20 text-white" : "bg-red-50 text-red-600"}">${alerts}</span>` : ""}
      </button>
    `;
  }).join("");
}

function courseOverviewRows() {
  const records = currentRecords();
  return COURSES.map((course) => {
    const courseRecords = records.filter((item) => item.cursoId === course.id);
    const normalized = courseRecords.map((item) => ({ ...item, estado: normalizeAttendanceState(item.estado) }));
    const totals = attendanceTotals(normalized);
    const students = attendanceState.students.filter((student) => student.cursoId === course.id);
    const alerts = students.filter((student) => (studentSummary(student, records).totals.falta || 0) > attendanceState.limiteFaltas).length;
    return `
      <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
        <td class="px-3 py-2.5">
          <button type="button" data-director-attendance-course="${escapeDirectorHtml(course.id)}" class="inline-flex items-center gap-2 text-left font-semibold text-slate-900 hover:text-school-green">
            <span class="grid h-7 w-7 place-items-center rounded-md bg-green-50 text-school-green">${icon("school", "h-3.5 w-3.5")}</span>
            ${escapeDirectorHtml(course.nombre)}
          </button>
        </td>
        <td class="px-2 py-2.5 text-center text-slate-500">${uniqueDates(courseRecords)}</td>
        <td class="px-2 py-2.5 text-center text-green-700">${totals.presente || 0}</td>
        <td class="px-2 py-2.5 text-center text-amber-700">${totals.atraso || 0}</td>
        <td class="px-2 py-2.5 text-center text-blue-700">${totals.permiso || 0}</td>
        <td class="px-2 py-2.5 text-center font-semibold text-red-600">${totals.falta || 0}</td>
        <td class="min-w-32 px-3 py-2.5">${compactDistribution(totals, courseRecords.length)}</td>
        <td class="px-2 py-2.5 text-center font-semibold text-slate-900">${attendancePercent(normalized)}%</td>
        <td class="px-3 py-2.5 text-right"><span class="inline-flex min-w-7 justify-center rounded-md px-2 py-1 text-[11px] font-semibold ${alerts ? "bg-red-50 text-red-600" : "bg-green-50 text-school-green"}">${alerts}</span></td>
      </tr>
    `;
  }).join("");
}

function studentTableRows() {
  const rows = sortedStudentSummaries();
  if (!rows.length) return `<tr><td colspan="8" class="px-4 py-8 text-center text-sm text-slate-500">No hay alumnos activos en este curso.</td></tr>`;
  return rows.map(({ student, totals, percent, records, lastAbsence }) => {
    const inAlert = (totals.falta || 0) > attendanceState.limiteFaltas;
    return `
      <tr class="border-b border-slate-100 last:border-0 ${inAlert ? "bg-red-50/35" : "hover:bg-slate-50/80"}">
        <td class="px-3 py-2.5"><button type="button" data-open-attendance-student="${escapeDirectorHtml(student.id)}" class="max-w-[280px] truncate text-left font-medium text-slate-900 hover:text-school-green" title="${escapeDirectorHtml(student.nombre)}">${escapeDirectorHtml(student.nombre)}</button></td>
        <td class="px-2 py-2.5 text-center text-slate-500">${records.length}</td>
        <td class="px-2 py-2.5 text-center text-green-700">${totals.presente || 0}</td>
        <td class="px-2 py-2.5 text-center text-amber-700">${totals.atraso || 0}</td>
        <td class="px-2 py-2.5 text-center text-blue-700">${totals.permiso || 0}</td>
        <td class="px-2 py-2.5 text-center font-semibold text-red-600">${totals.falta || 0}</td>
        <td class="px-3 py-2.5 text-center"><span class="rounded-md px-2 py-1 text-[11px] font-semibold ${inAlert ? "bg-red-100 text-red-700" : "bg-green-50 text-school-green"}">${inAlert ? `Alerta · ${formatShortDate(lastAbsence)}` : `${percent}%`}</span></td>
        <td class="px-3 py-2.5 text-right"><button type="button" data-open-attendance-student="${escapeDirectorHtml(student.id)}" class="inline-grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-school-green transition hover:border-school-green hover:bg-green-50" aria-label="Ver asistencia de ${escapeDirectorHtml(student.nombre)}">${icon("calendar-search", "h-4 w-4")}</button></td>
      </tr>
    `;
  }).join("");
}

function courseOverviewMobile() {
  const records = currentRecords();
  return COURSES.map((course) => {
    const courseRecords = records.filter((item) => item.cursoId === course.id);
    const normalized = courseRecords.map((item) => ({ ...item, estado: normalizeAttendanceState(item.estado) }));
    const totals = attendanceTotals(normalized);
    const students = attendanceState.students.filter((student) => student.cursoId === course.id);
    const alerts = students.filter((student) => (studentSummary(student, records).totals.falta || 0) > attendanceState.limiteFaltas).length;
    return `
      <button type="button" data-director-attendance-course="${escapeDirectorHtml(course.id)}" class="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0">
        <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-green-50 text-school-green">${icon("school", "h-4 w-4")}</span>
        <span class="min-w-0 flex-1"><span class="block truncate text-xs font-semibold text-slate-900">${escapeDirectorHtml(course.nombre)}</span><span class="mt-0.5 block text-[10px] text-slate-500">${uniqueDates(courseRecords)} dias · ${attendancePercent(normalized)}% asistencia</span></span>
        <span class="text-[10px] text-slate-500"><b class="text-red-600">${totals.falta || 0} F</b>${alerts ? ` · <b class="text-red-600">${alerts} alerta(s)</b>` : ""}</span>
        ${icon("chevron-right", "h-4 w-4 shrink-0 text-slate-400")}
      </button>
    `;
  }).join("");
}

function studentOverviewMobile() {
  const rows = sortedStudentSummaries();
  if (!rows.length) return `<p class="px-4 py-8 text-center text-sm text-slate-500">No hay alumnos activos en este curso.</p>`;
  return rows.map(({ student, totals, percent }) => {
    const inAlert = (totals.falta || 0) > attendanceState.limiteFaltas;
    return `
      <button type="button" data-open-attendance-student="${escapeDirectorHtml(student.id)}" class="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-3 text-left last:border-0 ${inAlert ? "bg-red-50/40" : "bg-white"}">
        <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md ${inAlert ? "bg-red-100 text-red-700" : "bg-green-50 text-school-green"}">${icon(inAlert ? "triangle-alert" : "user-round", "h-4 w-4")}</span>
        <span class="min-w-0 flex-1"><span class="block truncate text-[11px] font-semibold text-slate-900">${escapeDirectorHtml(student.nombre)}</span><span class="mt-1 flex gap-1 text-[9px]"><span class="rounded bg-green-50 px-1.5 py-0.5 text-green-700">P ${totals.presente || 0}</span><span class="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">A ${totals.atraso || 0}</span><span class="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">L ${totals.permiso || 0}</span><span class="rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">F ${totals.falta || 0}</span></span></span>
        <span class="shrink-0 text-[11px] font-semibold ${inAlert ? "text-red-600" : "text-school-green"}">${inAlert ? "Alerta" : `${percent}%`}</span>
        ${icon("calendar-search", "h-4 w-4 shrink-0 text-school-green")}
      </button>
    `;
  }).join("");
}

function overviewPanel() {
  if (!attendanceState.courseId) {
    return `
      <div class="sm:hidden">${courseOverviewMobile()}</div>
      <div class="hidden overflow-x-auto sm:block"><table class="min-w-[760px] w-full text-left text-xs">
        <thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="px-3 py-2.5">Curso</th><th class="px-2 text-center">Dias</th><th class="px-2 text-center">P</th><th class="px-2 text-center">A</th><th class="px-2 text-center">L</th><th class="px-2 text-center">F</th><th class="px-3">Distribucion</th><th class="px-2 text-center">Asist.</th><th class="px-3 text-right">Alertas</th></tr></thead>
        <tbody>${courseOverviewRows()}</tbody>
      </table></div>
    `;
  }
  return `
    <div class="sm:hidden">${studentOverviewMobile()}</div>
    <div class="hidden overflow-x-auto sm:block"><table class="min-w-[700px] w-full text-left text-xs">
      <thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="px-3 py-2.5">Alumno</th><th class="px-2 text-center">Reg.</th><th class="px-2 text-center">P</th><th class="px-2 text-center">A</th><th class="px-2 text-center">L</th><th class="px-2 text-center">F</th><th class="px-3 text-center">Estado</th><th class="px-3 text-right">Detalle</th></tr></thead>
      <tbody>${studentTableRows()}</tbody>
    </table></div>
  `;
}

function alertsPanel() {
  const alerts = alertSummaries();
  if (!alerts.length) {
    return `<div class="grid min-h-48 place-items-center px-5 py-8 text-center"><div><span class="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-green-50 text-school-green">${icon("circle-check-big", "h-5 w-5")}</span><p class="mt-3 text-sm font-semibold text-slate-900">Sin alumnos en alerta</p><p class="mt-1 text-xs leading-5 text-slate-500">Nadie supera ${attendanceState.limiteFaltas} faltas en esta seleccion.</p></div></div>`;
  }
  return `
    <div class="max-h-[500px] divide-y divide-slate-100 overflow-y-auto">
      ${alerts.map(({ student, totals, lastAbsence }, index) => `
        <button type="button" data-open-attendance-student="${escapeDirectorHtml(student.id)}" class="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-red-50/50">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md ${index < 3 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"} text-xs font-semibold">${index + 1}</span>
          <span class="min-w-0 flex-1"><span class="block truncate text-xs font-semibold text-slate-900">${escapeDirectorHtml(student.nombre)}</span><span class="mt-0.5 block text-[10px] text-slate-500">${escapeDirectorHtml(courseById(student.cursoId).nombre)} · Ultima ${escapeDirectorHtml(formatShortDate(lastAbsence))}</span></span>
          <span class="shrink-0 rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600">${totals.falta || 0} F</span>${icon("chevron-right", "h-4 w-4 shrink-0 text-slate-400")}
        </button>
      `).join("")}
    </div>
  `;
}

function calendarCells(monthKey, records = []) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const days = new Date(year, month, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const byDate = new Map(records.map((item) => [item.fecha, item]));
  const cells = Array.from({ length: leading }, () => `<span></span>`);
  const tone = { presente: "bg-green-50 text-green-700 ring-green-200", atraso: "bg-amber-50 text-amber-800 ring-amber-200", permiso: "bg-blue-50 text-blue-700 ring-blue-200", falta: "bg-red-100 text-red-700 ring-red-300" };
  const letter = { presente: "P", atraso: "A", permiso: "L", falta: "F" };
  for (let day = 1; day <= days; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const record = byDate.get(date);
    const state = normalizeAttendanceState(record?.estado);
    cells.push(`<span class="grid h-9 place-items-center rounded-md text-[10px] ring-1 ${record ? tone[state] || "bg-slate-50 text-slate-600 ring-slate-200" : "bg-white text-slate-300 ring-slate-100"}" title="${escapeDirectorHtml(record ? state : "Sin registro")}"><span class="leading-none">${day}</span><span class="text-[9px] font-semibold leading-none">${letter[state] || ""}</span></span>`);
  }
  return cells.join("");
}

function attendanceWarningEditor(student, inAlert) {
  const storedWarning = student.advertenciaAsistencia;
  const belongsToCurrentTrimester = storedWarning?.trimestreId === attendanceState.trimesterId;
  const isActive = belongsToCurrentTrimester && storedWarning?.activa === true;
  const savedMessage = belongsToCurrentTrimester ? String(storedWarning?.mensaje || "") : "";

  if (!inAlert && !isActive) {
    return `
      <aside class="h-fit rounded-lg border border-green-200 bg-green-50/60 p-4">
        <div class="flex items-center gap-2 text-school-green">${icon("circle-check-big", "h-5 w-5")}<h3 class="text-sm font-semibold">Sin alerta inmediata</h3></div>
        <p class="mt-2 text-xs leading-5 text-slate-600">El alumno no supera el limite configurado de ${attendanceState.limiteFaltas} faltas.</p>
      </aside>
    `;
  }

  return `
    <aside class="h-fit rounded-lg border border-red-200 bg-red-50/60 p-4">
      <div class="flex items-center gap-2 text-red-700">${icon("triangle-alert", "h-5 w-5")}<h3 class="text-sm font-semibold">${isActive ? "Advertencia activa" : "Configurar advertencia"}</h3></div>
      <p class="mt-2 text-xs leading-5 text-slate-600">${inAlert ? `Supera el limite configurado de ${attendanceState.limiteFaltas} faltas.` : "La advertencia sigue activa aunque el alumno ya no supere el limite."} La estadistica no envia mensajes automaticamente.</p>
      <div class="mt-3 rounded-lg border border-red-100 bg-white p-3">
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs font-medium text-slate-700">Mostrar alerta al alumno</span>
          <button type="button" data-attendance-warning-toggle role="switch" aria-checked="${isActive}" class="relative inline-flex h-6 w-10 shrink-0 rounded-full p-1 transition ${isActive ? "bg-red-600" : "bg-slate-300"}" aria-label="Activar o desactivar advertencia">
            <span data-attendance-warning-knob class="h-4 w-4 rounded-full bg-white shadow-sm transition ${isActive ? "translate-x-4" : "translate-x-0"}"></span>
          </button>
        </div>
        <label class="mt-3 block">
          <span class="text-[10px] font-semibold uppercase text-slate-500">Mensaje del director</span>
          <textarea data-attendance-warning-message maxlength="500" rows="5" class="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-800 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100" placeholder="Escriba el mensaje que recibira el alumno...">${escapeDirectorHtml(savedMessage)}</textarea>
          <span class="mt-1 block text-right text-[10px] text-slate-400" data-attendance-warning-count>${savedMessage.length}/500</span>
        </label>
      </div>
      <p class="mt-2 text-[10px] leading-4 text-slate-500">Nada aparecera en el panel del alumno hasta que active el interruptor y guarde la advertencia.</p>
      <button type="button" data-save-attendance-warning class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300" ${isActive && savedMessage.trim() ? "" : "disabled"}>${icon(isActive ? "save" : "bell-ring", "h-4 w-4")} ${isActive ? "Guardar advertencia" : "Active para notificar"}</button>
      <p class="mt-2 hidden text-center text-[11px] font-semibold" data-attendance-warning-status></p>
    </aside>
  `;
}

function attendanceStudentModal(summary) {
  const { student, records, totals, percent } = summary;
  const course = courseById(student.cursoId);
  const monthKeys = [...new Set(records.map((item) => String(item.fecha || "").slice(0, 7)).filter((item) => /^\d{4}-\d{2}$/.test(item)))].sort();
  const inAlert = (totals.falta || 0) > attendanceState.limiteFaltas;
  const monthSections = monthKeys.length ? monthKeys.map((monthKey) => {
    const label = new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("es-BO", { month: "long", year: "numeric" });
    return `<section class="min-w-0 border-t border-slate-100 pt-3 first:border-0 first:pt-0"><h3 class="mb-2 text-xs font-semibold capitalize text-slate-900">${escapeDirectorHtml(label)}</h3><div class="mb-1 grid grid-cols-7 gap-1 text-center text-[9px] uppercase text-slate-400"><span>Lun</span><span>Mar</span><span>Mie</span><span>Jue</span><span>Vie</span><span>Sab</span><span>Dom</span></div><div class="grid grid-cols-7 gap-1">${calendarCells(monthKey, records.filter((item) => String(item.fecha || "").startsWith(monthKey)))}</div></section>`;
  }).join("") : `<p class="py-8 text-center text-sm text-slate-500">No tiene registros de asistencia en ${escapeDirectorHtml(currentTrimester().label)}.</p>`;

  return `
    <div class="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-3 sm:p-5" data-director-attendance-modal-backdrop>
      <section class="max-h-[92dvh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Detalle de asistencia">
        <header class="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4"><div class="min-w-0"><p class="text-[10px] font-semibold uppercase text-school-green">${escapeDirectorHtml(course.nombre)} · ${escapeDirectorHtml(currentTrimester().label)}</p><h2 class="mt-1 truncate text-base font-semibold text-slate-950 sm:text-lg">${escapeDirectorHtml(student.nombre)}</h2><p class="mt-0.5 text-xs text-slate-500">Calendario basado solamente en dias con asistencia registrada.</p></div><button type="button" data-close-director-attendance-modal class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200" aria-label="Cerrar">${icon("x", "h-4 w-4")}</button></header>
        <div class="max-h-[calc(92dvh-74px)] overflow-y-auto p-4 sm:p-5">
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-5"><div class="rounded-lg bg-slate-50 px-3 py-2"><p class="text-[9px] uppercase text-slate-500">Asistencia</p><p class="text-lg font-semibold text-slate-900">${percent}%</p></div><div class="rounded-lg bg-green-50 px-3 py-2"><p class="text-[9px] uppercase text-green-700">Presentes</p><p class="text-lg font-semibold text-green-800">${totals.presente || 0}</p></div><div class="rounded-lg bg-amber-50 px-3 py-2"><p class="text-[9px] uppercase text-amber-700">Atrasos</p><p class="text-lg font-semibold text-amber-800">${totals.atraso || 0}</p></div><div class="rounded-lg bg-blue-50 px-3 py-2"><p class="text-[9px] uppercase text-blue-700">Licencias</p><p class="text-lg font-semibold text-blue-800">${totals.permiso || 0}</p></div><div class="rounded-lg bg-red-50 px-3 py-2"><p class="text-[9px] uppercase text-red-700">Faltas</p><p class="text-lg font-semibold text-red-700">${totals.falta || 0}</p></div></div>
          <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div class="space-y-4">${monthSections}</div>
            ${attendanceWarningEditor(student, inAlert)}
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderAttendance() {
  const root = document.querySelector("[data-director-attendance-root]");
  if (!root) return;
  const records = visibleRecords();
  const normalized = records.map((item) => ({ ...item, estado: normalizeAttendanceState(item.estado) }));
  const totals = attendanceTotals(normalized);
  const alerts = alertSummaries();
  const selectedCourse = attendanceState.courseId ? courseById(attendanceState.courseId) : null;
  root.innerHTML = `
    <section class="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div class="flex flex-col gap-3 border-b border-slate-100 p-3 sm:p-4 xl:flex-row xl:items-center xl:justify-between"><div class="min-w-0"><p class="text-[10px] font-semibold uppercase text-school-green">Seguimiento trimestral</p><h2 class="mt-0.5 text-base font-semibold text-slate-950">${escapeDirectorHtml(selectedCourse?.nombre || "Todos los cursos")}</h2><p class="mt-0.5 text-xs text-slate-500">${uniqueDates(records)} dia(s) con lista · ${records.length} registro(s)</p></div><div class="flex flex-col gap-2 sm:flex-row sm:items-center"><div class="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1">${TRIMESTERS.map((item) => `<button type="button" data-director-attendance-trimester="${item.id}" class="rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${item.id === attendanceState.trimesterId ? "bg-school-green text-white shadow-sm" : "text-slate-600 hover:bg-white"}"><span class="sm:hidden">${item.short}</span><span class="hidden sm:inline">${item.label}</span></button>`).join("")}</div><div class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5"><label for="director-attendance-limit" class="whitespace-nowrap text-[10px] font-medium text-slate-500">Alerta al superar</label><input id="director-attendance-limit" data-director-attendance-limit type="number" min="0" max="30" value="${attendanceState.limiteFaltas}" class="h-7 w-12 rounded-md border border-slate-200 text-center text-xs font-semibold outline-none focus:border-school-green"><span class="text-[10px] text-slate-500">faltas</span><button type="button" data-save-attendance-limit class="grid h-7 w-7 place-items-center rounded-md bg-green-50 text-school-green transition hover:bg-green-100" title="Guardar limite" aria-label="Guardar limite de faltas">${icon("save", "h-3.5 w-3.5")}</button></div><button type="button" data-refresh-director-attendance class="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-school-green px-3 text-xs font-semibold text-school-green transition hover:bg-green-50">${icon("refresh-cw", "h-4 w-4")} Actualizar</button></div></div>
      ${attendanceState.notice ? `<p class="border-b border-slate-100 px-4 py-2 text-xs font-medium ${attendanceState.notice.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}">${escapeDirectorHtml(attendanceState.notice)}</p>` : ""}
      <div class="flex gap-2 overflow-x-auto p-3 sm:p-4">${courseTabs()}</div>
    </section>
    <section class="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">${directorStat("Asistencia", `${attendancePercent(normalized)}%`, `${uniqueDates(records)} dias registrados`, "badge-check", "bg-school-green text-white")}${directorStat("Faltas", totals.falta || 0, currentTrimester().label, "user-x", "bg-red-500 text-white")}${directorStat("En alerta", alerts.length, `Mas de ${attendanceState.limiteFaltas} faltas`, "triangle-alert", "bg-school-gold text-slate-900")}${directorStat("Alumnos", visibleStudents().length, selectedCourse?.nombre || "Todos los cursos", "users", "bg-slate-800 text-white")}</section>
    <section class="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_340px]"><article class="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><header class="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 sm:px-4"><div><h2 class="text-sm font-semibold text-slate-950">${selectedCourse ? `Alumnos de ${escapeDirectorHtml(selectedCourse.nombre)}` : "Resumen por curso"}</h2><p class="mt-0.5 text-[11px] text-slate-500">Ordenado para identificar primero las inasistencias.</p></div><div class="flex gap-1.5 text-[10px]"><span class="rounded-md bg-green-50 px-2 py-1 text-green-700">P</span><span class="rounded-md bg-amber-50 px-2 py-1 text-amber-700">A</span><span class="rounded-md bg-blue-50 px-2 py-1 text-blue-700">L</span><span class="rounded-md bg-red-50 px-2 py-1 text-red-700">F</span></div></header>${overviewPanel()}</article><article class="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><header class="border-b border-slate-100 px-3 py-3 sm:px-4"><div class="flex items-center justify-between gap-3"><div><h2 class="text-sm font-semibold text-slate-950">Top de inasistencias</h2><p class="mt-0.5 text-[11px] text-slate-500">Alumnos que superan ${attendanceState.limiteFaltas} faltas.</p></div><span class="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">${alerts.length}</span></div></header>${alertsPanel()}</article></section>
  `;
  bindRenderedAttendance();
  refreshDirectorIcons();
}

function showStudentModal(studentId) {
  const student = attendanceState.students.find((item) => item.id === studentId);
  const holder = document.querySelector("[data-director-attendance-modal]");
  if (!student || !holder) return;
  const summary = studentSummary(student);
  holder.innerHTML = attendanceStudentModal(summary);
  refreshDirectorIcons();
  const close = () => { holder.innerHTML = ""; };
  holder.querySelector("[data-close-director-attendance-modal]")?.addEventListener("click", close);
  holder.querySelector("[data-director-attendance-modal-backdrop]")?.addEventListener("click", (event) => { if (event.target?.hasAttribute("data-director-attendance-modal-backdrop")) close(); });
  const warningToggle = holder.querySelector("[data-attendance-warning-toggle]");
  const warningKnob = holder.querySelector("[data-attendance-warning-knob]");
  const warningMessage = holder.querySelector("[data-attendance-warning-message]");
  const warningCount = holder.querySelector("[data-attendance-warning-count]");
  const warningButton = holder.querySelector("[data-save-attendance-warning]");
  const warningStatus = holder.querySelector("[data-attendance-warning-status]");
  let persistedActive = student.advertenciaAsistencia?.trimestreId === attendanceState.trimesterId
    && student.advertenciaAsistencia?.activa === true;

  const warningIsActive = () => warningToggle?.getAttribute("aria-checked") === "true";
  const syncWarningEditor = () => {
    if (!warningToggle || !warningMessage || !warningButton) return;
    const active = warningIsActive();
    const hasMessage = Boolean(warningMessage.value.trim());
    warningToggle.classList.toggle("bg-red-600", active);
    warningToggle.classList.toggle("bg-slate-300", !active);
    warningKnob?.classList.toggle("translate-x-4", active);
    warningKnob?.classList.toggle("translate-x-0", !active);
    if (warningCount) warningCount.textContent = `${warningMessage.value.length}/500`;
    warningButton.disabled = active ? !hasMessage : !persistedActive;
    warningButton.innerHTML = active
      ? `${icon("save", "h-4 w-4")} ${persistedActive ? "Guardar advertencia" : "Activar advertencia"}`
      : `${icon("bell-off", "h-4 w-4")} ${persistedActive ? "Desactivar advertencia" : "Active para notificar"}`;
    refreshDirectorIcons();
  };

  warningToggle?.addEventListener("click", () => {
    warningToggle.setAttribute("aria-checked", String(!warningIsActive()));
    syncWarningEditor();
  });
  warningMessage?.addEventListener("input", syncWarningEditor);
  warningButton?.addEventListener("click", async () => {
    const active = warningIsActive();
    const message = warningMessage?.value.trim() || "";
    warningButton.disabled = true;
    if (warningStatus) {
      warningStatus.className = "mt-2 block text-center text-[11px] font-semibold text-slate-500";
      warningStatus.textContent = active ? "Activando advertencia..." : "Desactivando advertencia...";
    }
    try {
      const payload = await sendStudentAttendanceWarning({
        student,
        course: courseById(student.cursoId),
        trimestreId: attendanceState.trimesterId,
        faltas: summary.totals.falta || 0,
        limiteFaltas: attendanceState.limiteFaltas,
        mensaje: message,
        activa: active
      });
      student.advertenciaAsistencia = payload;
      persistedActive = payload.activa === true;
      if (warningStatus) {
        warningStatus.className = "mt-2 block text-center text-[11px] font-semibold text-green-700";
        warningStatus.textContent = persistedActive
          ? "La advertencia ya esta visible en el panel del alumno."
          : "La advertencia fue desactivada y ya no se mostrara al alumno.";
      }
    } catch (error) {
      const permissionDenied = error?.code === "permission-denied" || /insufficient permissions/i.test(String(error?.message || ""));
      if (warningStatus) {
        warningStatus.className = "mt-2 block text-center text-[11px] font-semibold text-red-700";
        warningStatus.textContent = permissionDenied
          ? "Firebase bloqueo el cambio. Publica la regla que permite al director actualizar advertenciaAsistencia."
          : `No se pudo guardar: ${error.message}`;
      }
    }
    syncWarningEditor();
  });
  syncWarningEditor();
}

function bindRenderedAttendance() {
  const root = document.querySelector("[data-director-attendance-root]");
  if (!root) return;
  root.querySelectorAll("[data-director-attendance-course]").forEach((button) => button.addEventListener("click", () => { attendanceState.courseId = button.dataset.directorAttendanceCourse || ""; sessionStorage.setItem("directorAsistenciaCurso", attendanceState.courseId); renderAttendance(); }));
  root.querySelectorAll("[data-director-attendance-trimester]").forEach((button) => button.addEventListener("click", async () => {
    const trimesterId = button.dataset.directorAttendanceTrimester;
    if (!TRIMESTERS.some((item) => item.id === trimesterId) || trimesterId === attendanceState.trimesterId) return;
    attendanceState.trimesterId = trimesterId;
    attendanceState.notice = "";
    sessionStorage.setItem("directorAsistenciaTrimestre", trimesterId);
    if (!attendanceState.recordsByTrimester.has(trimesterId)) {
      button.disabled = true;
      button.textContent = "...";
      try { attendanceState.recordsByTrimester.set(trimesterId, await listDirectorAttendanceByTrimester(trimesterId)); }
      catch (error) { attendanceState.notice = `Error al cargar ${currentTrimester().label}: ${error.message}`; }
    }
    renderAttendance();
  }));
  root.querySelectorAll("[data-open-attendance-student]").forEach((button) => button.addEventListener("click", () => showStudentModal(button.dataset.openAttendanceStudent)));
  root.querySelector("[data-save-attendance-limit]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const input = root.querySelector("[data-director-attendance-limit]");
    const value = Math.max(0, Math.min(30, Math.round(Number(input?.value) || 0)));
    button.disabled = true;
    try {
      const saved = await saveDirectorAttendanceSettings(value);
      attendanceState.limiteFaltas = value;
      attendanceState.notice = saved.guardadoEnFirebase
        ? `Limite guardado: la alerta aparecera al superar ${value} faltas.`
        : `Limite guardado en este dispositivo. Publica las reglas nuevas para sincronizarlo.`;
    }
    catch (error) { attendanceState.notice = `Error al guardar el limite: ${error.message}`; }
    renderAttendance();
  });
  root.querySelector("[data-refresh-director-attendance]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = `${icon("loader-circle", "h-4 w-4 animate-spin")} Actualizando`;
    try {
      const [students, todayRecords, records, settings] = await Promise.all([listDirectorStudents(), listDirectorAttendance(), listDirectorAttendanceByTrimester(attendanceState.trimesterId), getDirectorAttendanceSettings()]);
      attendanceState.students = students;
      attendanceState.todayRecords = todayRecords;
      attendanceState.recordsByTrimester.set(attendanceState.trimesterId, records);
      attendanceState.limiteFaltas = settings.limiteFaltas;
      attendanceState.notice = "Asistencia actualizada desde Firebase.";
    } catch (error) { attendanceState.notice = `Error al actualizar: ${error.message}`; }
    renderAttendance();
  });
}

export function DirectorAttendance() {
  const content = `<div data-director-attendance-root><div class="grid min-h-64 place-items-center rounded-lg border border-slate-200 bg-white shadow-sm"><div class="text-center"><span class="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-school-green"></span><p class="mt-3 text-sm font-medium text-slate-500">Preparando asistencia...</p></div></div></div><div data-director-attendance-modal></div>`;
  return DirectorShell("/director/asistencia", content, { title: "Asistencia", subtitle: "Seguimiento por curso, alertas y detalle de inasistencias." });
}

export async function bindDirectorAttendance(route) {
  if (route !== "/director/asistencia" && route !== "/director/asistencias") return;
  if (attendanceState.initialized) { renderAttendance(); return; }
  if (attendanceState.loading) return;
  attendanceState.loading = true;
  try {
    const [students, todayRecords, recentRecords, settings] = await Promise.all([listDirectorStudents(), listDirectorAttendance(), listDirectorRecentAttendance(1), getDirectorAttendanceSettings()]);
    attendanceState.students = students;
    attendanceState.todayRecords = todayRecords;
    attendanceState.limiteFaltas = settings.limiteFaltas;
    if (!attendanceState.trimesterId) {
      const termsToday = todayRecords.reduce((acc, item) => { const key = item.trimestreId || "t1"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
      const todayTrimester = todayRecords.length
        ? TRIMESTERS.map((item) => item.id).sort((a, b) => (termsToday[b] || 0) - (termsToday[a] || 0))[0]
        : "";
      attendanceState.trimesterId = todayTrimester || recentRecords[0]?.trimestreId || "t2";
    }
    attendanceState.recordsByTrimester.set(attendanceState.trimesterId, await listDirectorAttendanceByTrimester(attendanceState.trimesterId));
    if (attendanceState.courseId && !COURSES.some((item) => item.id === attendanceState.courseId)) attendanceState.courseId = "";
    attendanceState.initialized = true;
    renderAttendance();
  } catch (error) {
    const root = document.querySelector("[data-director-attendance-root]");
    if (root) root.innerHTML = `<div class="rounded-lg border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">No se pudo cargar la asistencia: ${escapeDirectorHtml(error.message)}</div>`;
  } finally { attendanceState.loading = false; }
}
