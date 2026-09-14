import { icon } from "../../ui/dom.js";
import {
  COURSES,
  activeCoursesWithCounts,
  attendancePercent,
  attendanceTotals,
  calculateCourseGrades,
  listDirectorActivities,
  listDirectorRecentAttendance,
  listDirectorAudit,
  listDirectorGrades,
  listDirectorSchedules,
  listDirectorStudents,
  listDirectorTeachers
} from "../../services/directorData.js";
import { DirectorShell, directorCard, directorStat } from "./DirectorShell.js";
import { escapeDirectorHtml, refreshDirectorIcons } from "./DirectorUtils.js";

const DASHBOARD_CACHE_KEY = "director_dashboard_resumen_v2";
const DASHBOARD_CACHE_VERSION = 3;

function localIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function lastSevenDays() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const weekDay = date.toLocaleDateString("es-BO", { weekday: "short" }).replace(".", "");
    return {
      iso: localIso(date),
      label: `${weekDay.charAt(0).toUpperCase()}${weekDay.slice(1, 3)}`,
      dateLabel: date.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit" })
    };
  });
}

function dayFromIso(iso) {
  const date = new Date(`${iso}T12:00:00`);
  const weekDay = date.toLocaleDateString("es-BO", { weekday: "short" }).replace(".", "");
  return {
    iso,
    label: `${weekDay.charAt(0).toUpperCase()}${weekDay.slice(1, 3)}`,
    dateLabel: date.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit" })
  };
}

function readDashboardCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || "null");
    return parsed?.version === DASHBOARD_CACHE_VERSION && parsed?.snapshot ? parsed.snapshot : null;
  } catch {
    return null;
  }
}

function writeDashboardCache(snapshot) {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ version: DASHBOARD_CACHE_VERSION, snapshot }));
  } catch {
    // El panel sigue disponible aunque el navegador bloquee localStorage.
  }
}

function statLink(key, href, label, value, detail, iconName, tone) {
  return `
    <a data-director-stat-card="${key}" href="${href}" class="block rounded-lg transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-school-green focus-visible:ring-offset-2">
      ${directorStat(label, value, detail, iconName, tone)}
    </a>
  `;
}

function progressRow(course, percent, total = 0) {
  const hasData = Number.isFinite(percent);
  const value = hasData ? Math.max(0, Math.min(100, percent)) : 0;
  const tone = hasData && value < 85 ? "bg-school-gold" : "bg-school-green";
  return `
    <div class="grid grid-cols-[minmax(5rem,7rem)_1fr_2.6rem] items-center gap-2 text-xs sm:gap-3 sm:text-sm">
      <span class="truncate font-medium text-slate-700" title="${escapeDirectorHtml(course)}">${escapeDirectorHtml(course)}</span>
      <div class="h-2 overflow-hidden rounded-full bg-slate-100" title="${total} registro(s)">
        <div class="h-full rounded-full ${tone}" style="width:${value}%"></div>
      </div>
      <span class="text-right font-semibold ${hasData ? "text-slate-900" : "text-slate-400"}">${hasData ? `${value}%` : "-"}</span>
    </div>
  `;
}

function alertItem(item) {
  return `
    <a href="${item.href}" class="flex items-center gap-3 border-b border-slate-100 py-3 transition last:border-0 hover:bg-slate-50 sm:px-1">
      <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg ${item.tone}">${icon(item.iconName, "h-4 w-4")}</span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-semibold text-slate-900">${escapeDirectorHtml(item.title)}</span>
        <span class="block truncate text-xs text-slate-500">${escapeDirectorHtml(item.detail)}</span>
      </span>
      <span class="shrink-0 text-xs font-medium text-slate-400">${escapeDirectorHtml(item.time)}</span>
      ${icon("chevron-right", "h-4 w-4 shrink-0 text-slate-400")}
    </a>
  `;
}

function activityItem(item) {
  return `
    <article class="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.tone} text-white">${icon(item.iconName, "h-4 w-4")}</span>
      <p class="min-w-0 flex-1 truncate text-sm font-medium text-slate-800" title="${escapeDirectorHtml(item.title)}">${escapeDirectorHtml(item.title)}</p>
      <span class="shrink-0 text-xs text-slate-500">${escapeDirectorHtml(item.time)}</span>
    </article>
  `;
}

function riskRows(rows = []) {
  if (!rows.length) {
    return `
      <div class="flex items-center gap-3 rounded-lg bg-green-50 p-4 text-sm text-green-800">
        ${icon("circle-check-big", "h-5 w-5 shrink-0")}
        <span>No hay estudiantes en riesgo con las actividades ya calificadas.</span>
      </div>
    `;
  }
  return `
    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-xs sm:text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-[10px] uppercase text-slate-500 sm:text-xs">
            <th class="py-2 pr-3 font-semibold">Estudiante</th>
            <th class="pr-3 font-semibold">Curso</th>
            <th class="pr-3 text-center font-semibold">Prom.</th>
            <th class="font-semibold">Situacion</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="border-b border-slate-100 last:border-0">
              <td class="max-w-52 truncate py-2.5 pr-3 font-medium text-slate-800" title="${escapeDirectorHtml(row.name)}">${escapeDirectorHtml(row.name)}</td>
              <td class="whitespace-nowrap pr-3 text-slate-600">${escapeDirectorHtml(row.course)}</td>
              <td class="pr-3 text-center font-semibold text-slate-900">${row.score}</td>
              <td class="whitespace-nowrap font-semibold ${row.status === "Critico" ? "text-red-600" : "text-amber-600"}">${row.status}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function trendChart(points = []) {
  const width = 560;
  const height = 210;
  const left = 42;
  const right = 14;
  const top = 18;
  const bottom = 54;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const positions = points.map((point, index) => ({
    ...point,
    x: left + (xStep * index),
    y: point.percent == null ? null : top + ((100 - point.percent) / 100) * plotHeight
  }));
  const segments = [];
  let current = [];
  positions.forEach((point) => {
    if (point.y == null) {
      if (current.length > 1) segments.push(current);
      current = [];
      return;
    }
    current.push(point);
  });
  if (current.length > 1) segments.push(current);
  const hasData = positions.some((point) => point.y != null);
  const gridValues = [100, 75, 50, 25, 0];

  return `
    <div class="relative w-full overflow-hidden" role="img" aria-label="Porcentaje de asistencia de los ultimos siete dias">
      <svg viewBox="0 0 ${width} ${height}" class="block h-auto w-full" aria-hidden="true">
        ${gridValues.map((value) => {
          const y = top + ((100 - value) / 100) * plotHeight;
          return `
            <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />
            <text x="${left - 9}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="11">${value}%</text>
          `;
        }).join("")}
        ${segments.map((segment) => `<polyline points="${segment.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="#087B2B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`).join("")}
        ${positions.map((point) => `
          ${point.y == null ? "" : `
            <circle cx="${point.x}" cy="${point.y}" r="5" fill="#ffffff" stroke="#087B2B" stroke-width="3">
              <title>${point.label}: ${point.percent}% (${point.total} registros)</title>
            </circle>
            <text x="${point.x}" y="${Math.max(13, point.y - 10)}" text-anchor="middle" fill="#393633" font-size="11" font-weight="600">${point.percent}%</text>
          `}
          <text x="${point.x}" y="${height - 27}" text-anchor="middle" fill="#393633" font-size="11" font-weight="600">${point.label}</text>
          <text x="${point.x}" y="${height - 11}" text-anchor="middle" fill="#64748b" font-size="10">${point.dateLabel}</text>
        `).join("")}
      </svg>
      ${hasData ? "" : `<p class="absolute inset-0 grid place-items-center text-sm text-slate-500">Sin asistencias registradas en estos 7 dias.</p>`}
    </div>
  `;
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function auditTime(item) {
  if (item.hora) return String(item.hora);
  const millis = timestampMillis(item.createdAt || item.updatedAt);
  return millis ? new Date(millis).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" }) : "";
}

function courseHasClasses(schedule, dayId) {
  return Object.values(schedule?.clases || {}).some((days) => Boolean(days?.[dayId]));
}

function studentRiskRows(students, activities, grades) {
  const gradeByKey = new Map(grades.map((grade) => [`${grade.actividadId}|${grade.alumnoId}`, grade]));
  const startedActivityIds = new Set(grades.map((grade) => grade.actividadId).filter(Boolean));
  const activitiesByCourse = activities.reduce((acc, activity) => {
    if (!startedActivityIds.has(activity.id)) return acc;
    acc[activity.cursoId] = acc[activity.cursoId] || [];
    acc[activity.cursoId].push(activity);
    return acc;
  }, {});
  const courseNames = new Map(COURSES.map((course) => [course.id, course.nombre]));

  return students.map((student) => {
    const studentActivities = activitiesByCourse[student.cursoId] || [];
    if (!studentActivities.length) return null;
    const total = studentActivities.reduce((sum, activity) => {
      const grade = gradeByKey.get(`${activity.id}|${student.id}`);
      const rawNote = Number(grade?.nota ?? 35);
      return sum + Math.max(35, Number.isFinite(rawNote) ? rawNote : 35);
    }, 0);
    const score = Math.round(total / studentActivities.length);
    if (score >= 51) return null;
    return {
      name: student.nombre || "-",
      course: courseNames.get(student.cursoId) || student.cursoId || "-",
      score,
      status: score < 46 ? "Critico" : "En riesgo"
    };
  }).filter(Boolean).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, 8);
}

async function buildDashboardSnapshot() {
  const calendarDays = lastSevenDays();
  const [students, teachers, attendanceRows, auditRows, activities, grades, schedules] = await Promise.all([
    listDirectorStudents(),
    listDirectorTeachers(),
    listDirectorRecentAttendance(),
    listDirectorAudit(8),
    listDirectorActivities(),
    listDirectorGrades(),
    listDirectorSchedules()
  ]);
  const recentDates = [...new Set(attendanceRows.map((item) => item.fecha).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .slice(-7);
  const days = recentDates.length ? recentDates.map(dayFromIso) : calendarDays;
  const selectedDateSet = new Set(days.map((day) => day.iso));
  const trendRows = attendanceRows.filter((item) => selectedDateSet.has(item.fecha));
  const todayIso = calendarDays.at(-1).iso;
  const todayRows = attendanceRows.filter((item) => item.fecha === todayIso);
  const todayTotals = attendanceTotals(todayRows);
  const weekTotals = attendanceTotals(trendRows);
  const todayPercent = attendancePercent(todayRows);
  const attendanceByDate = trendRows.reduce((acc, item) => {
    acc[item.fecha] = acc[item.fecha] || [];
    acc[item.fecha].push(item);
    return acc;
  }, {});
  const attendanceByCourse = todayRows.reduce((acc, item) => {
    acc[item.cursoId] = acc[item.cursoId] || [];
    acc[item.cursoId].push(item);
    return acc;
  }, {});
  const courseSummaries = activeCoursesWithCounts(students).map((course) => ({
    ...course,
    ...calculateCourseGrades({ students, activities, grades, courseId: course.id })
  }));
  const dayIds = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const todayDayId = dayIds[new Date(`${todayIso}T12:00:00`).getDay()];
  const scheduledCourses = courseSummaries.filter((course) => course.total > 0 && courseHasClasses(schedules[course.id], todayDayId));
  const coursesWithoutAttendance = scheduledCourses.filter((course) => !(attendanceByCourse[course.id] || []).length).length;
  const pendingGrades = courseSummaries.reduce((sum, item) => sum + Number(item.pending || 0), 0);
  const risks = studentRiskRows(students, activities, grades);
  const riskTotal = courseSummaries.reduce((sum, item) => sum + Number(item.risk || 0), 0);
  const alertItems = [];

  if (todayTotals.falta) {
    alertItems.push({ title: `${todayTotals.falta} falta(s) registradas hoy`, detail: "Revisar el detalle de asistencia", time: "Hoy", tone: "bg-red-50 text-red-600", iconName: "user-x", href: "#/director/asistencia" });
  }
  if (coursesWithoutAttendance) {
    alertItems.push({ title: `${coursesWithoutAttendance} curso(s) sin asistencia`, detail: "Tienen clases hoy y aun no registraron", time: "Hoy", tone: "bg-amber-50 text-amber-700", iconName: "clock-alert", href: "#/director/asistencia" });
  }
  if (riskTotal) {
    alertItems.push({ title: `${riskTotal} estudiante(s) en riesgo`, detail: "Promedio menor a 51", time: "Notas", tone: "bg-orange-50 text-orange-700", iconName: "badge-alert", href: "#/director/notas" });
  }
  if (pendingGrades) {
    alertItems.push({ title: `${pendingGrades} calificacion(es) pendientes`, detail: "Solo en actividades que ya comenzaron a calificarse", time: "Notas", tone: "bg-blue-50 text-blue-700", iconName: "notebook-tabs", href: "#/director/notas" });
  }
  if (!alertItems.length) {
    alertItems.push({ title: "Sin alertas importantes", detail: "No se detectaron pendientes inmediatos", time: "Hoy", tone: "bg-green-50 text-school-green", iconName: "circle-check-big", href: "#/director/asistencia" });
  }

  const alertTotal = (todayTotals.falta || 0) + coursesWithoutAttendance + riskTotal + pendingGrades;
  return {
    updatedAt: Date.now(),
    studentsCount: students.length,
    teachersCount: teachers.length,
    todayCount: todayRows.length,
    todayPercent,
    todayTotals,
    weekTotals,
    alertTotal,
    alertItems: alertItems.slice(0, 4),
    trendPoints: days.map((day) => {
      const records = attendanceByDate[day.iso] || [];
      return { ...day, total: records.length, percent: records.length ? attendancePercent(records) : null };
    }),
    courseProgress: activeCoursesWithCounts(students).map((course) => {
      const records = attendanceByCourse[course.id] || [];
      return { id: course.id, name: course.nombre, total: records.length, percent: records.length ? attendancePercent(records) : null };
    }),
    risks,
    activities: auditRows.map((item) => ({
      title: item.detalle || `${item.tipo || "Sistema"} ${item.accion || ""}`.trim(),
      time: auditTime(item),
      tone: item.tipo === "asistencia" ? "bg-school-green" : item.tipo === "calificaciones" ? "bg-blue-500" : "bg-amber-500",
      iconName: item.tipo === "asistencia" ? "clipboard-check" : item.tipo === "calificaciones" ? "notebook-tabs" : "activity"
    }))
  };
}

function initialTrendPoints() {
  return lastSevenDays().map((day) => ({ ...day, total: 0, percent: null }));
}

export function DirectorDashboard() {
  const content = `
    <div data-director-dashboard>
      <section class="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-slate-800">Resumen institucional</p>
          <p class="mt-0.5 truncate text-xs text-slate-500" data-director-dashboard-updated>Sin copia local. Actualiza para consultar Firebase.</p>
        </div>
        <div class="flex items-center gap-2">
          <p class="hidden text-xs text-slate-500 sm:block" data-director-dashboard-status aria-live="polite"></p>
          <button type="button" data-action="refresh-director-dashboard" class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-school-green bg-white px-3 text-xs font-semibold text-school-green transition hover:bg-green-50 disabled:cursor-wait disabled:opacity-60">
            ${icon("refresh-cw", "h-4 w-4")}
            <span data-refresh-label>Actualizar</span>
          </button>
        </div>
        <p class="col-span-2 text-xs text-slate-500 sm:hidden" data-director-dashboard-status-mobile aria-live="polite"></p>
      </section>

      <section class="grid grid-cols-2 gap-3 xl:grid-cols-4">
        ${statLink("estudiantes", "#/director/estudiantes", "Estudiantes", "0", "Activos", "users", "bg-school-green text-white")}
        ${statLink("docentes", "#/director/docentes", "Docentes", "0", "Activos", "graduation-cap", "bg-school-green text-white")}
        ${statLink("asistencia", "#/director/asistencia", "Asistencia hoy", "0%", "Sin registros", "circle-check-big", "bg-school-gold text-white")}
        ${statLink("alertas", "#/director/notas", "Alertas", "0", "Requieren atencion", "triangle-alert", "bg-red-500 text-white")}
      </section>

      <section class="mt-3 grid min-w-0 gap-3 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        ${directorCard("Asistencia en los ultimos 7 dias registrados", `
          <div class="overflow-x-auto" data-director-trend-chart>${trendChart(initialTrendPoints())}</div>
          <div class="mt-3 grid grid-cols-4 divide-x divide-slate-200 border-t border-slate-100 pt-3 text-center text-[11px] text-slate-500 sm:text-xs">
            <span>Presentes<strong class="mt-1 block text-sm font-semibold text-school-green" data-director-week-presentes>0</strong></span>
            <span>Atrasos<strong class="mt-1 block text-sm font-semibold text-amber-600" data-director-week-atrasos>0</strong></span>
            <span>Licencias<strong class="mt-1 block text-sm font-semibold text-blue-600" data-director-week-permisos>0</strong></span>
            <span>Faltas<strong class="mt-1 block text-sm font-semibold text-red-600" data-director-week-faltas>0</strong></span>
          </div>
        `)}
        ${directorCard("Asistencia por curso hoy", `
          <div class="grid gap-3" data-director-course-progress>
            ${COURSES.map((course) => progressRow(course.nombre, null, 0)).join("")}
          </div>
          <a href="#/director/asistencia" class="mt-4 inline-flex w-full items-center justify-center gap-2 border-t border-slate-100 pt-3 text-xs font-semibold text-school-green">Ver detalle ${icon("arrow-right", "h-4 w-4")}</a>
        `)}
        ${directorCard("Alertas recientes", `
          <div data-director-alert-list>
            ${alertItem({ title: "Esperando datos", detail: "Actualiza el resumen institucional", time: "", tone: "bg-slate-100 text-slate-500", iconName: "activity", href: "#/director/asistencia" })}
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
            <a href="#/director/asistencia" class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-50 px-2 py-2 text-xs font-semibold text-school-green">${icon("clipboard-check", "h-3.5 w-3.5")} Asistencia</a>
            <a href="#/director/notas" class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-2 py-2 text-xs font-semibold text-amber-700">${icon("notebook-tabs", "h-3.5 w-3.5")} Notas</a>
          </div>
        `)}
      </section>

      <section class="mt-3 grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        ${directorCard("Estudiantes en riesgo academico", `
          <div data-director-risk-table>${riskRows()}</div>
          <a href="#/director/notas" class="mt-3 inline-flex w-full items-center justify-center gap-2 border-t border-slate-100 pt-3 text-xs font-semibold text-school-green">Ver rendimiento ${icon("arrow-right", "h-4 w-4")}</a>
        `)}
        ${directorCard("Actividad reciente", `
          <div data-director-activity-list>
            ${activityItem({ title: "Esperando movimientos del sistema", time: "", tone: "bg-slate-400", iconName: "activity" })}
          </div>
        `)}
      </section>
    </div>
  `;

  return DirectorShell("/director", content);
}

function replaceStat(root, key, html) {
  const element = root.querySelector(`[data-director-stat-card="${key}"]`);
  if (element) element.innerHTML = html;
}

function setText(root, selector, value) {
  root.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function updatedLabel(updatedAt) {
  return `Copia local: ${new Date(updatedAt).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })}`;
}

function setStatus(root, message, tone = "text-slate-500") {
  ["[data-director-dashboard-status]", "[data-director-dashboard-status-mobile]"].forEach((selector) => {
    const node = root.querySelector(selector);
    if (!node) return;
    node.className = `${selector.includes("mobile") ? "text-xs sm:hidden" : "hidden text-xs sm:block"} ${tone}`;
    node.textContent = message;
  });
}

function renderSnapshot(root, snapshot) {
  replaceStat(root, "estudiantes", directorStat("Estudiantes", snapshot.studentsCount, "Activos", "users", "bg-school-green text-white"));
  replaceStat(root, "docentes", directorStat("Docentes", snapshot.teachersCount, "Activos", "graduation-cap", "bg-school-green text-white"));
  replaceStat(root, "asistencia", directorStat("Asistencia hoy", `${snapshot.todayPercent}%`, snapshot.todayCount ? `${snapshot.todayCount} registros` : "Sin registros", "circle-check-big", "bg-school-gold text-white"));
  replaceStat(root, "alertas", directorStat("Alertas", snapshot.alertTotal, snapshot.alertTotal ? "Requieren atencion" : "Sin alertas", "triangle-alert", snapshot.alertTotal ? "bg-red-500 text-white" : "bg-school-green text-white"));
  setText(root, "[data-director-week-presentes]", snapshot.weekTotals.presente || 0);
  setText(root, "[data-director-week-atrasos]", snapshot.weekTotals.atraso || 0);
  setText(root, "[data-director-week-permisos]", snapshot.weekTotals.permiso || 0);
  setText(root, "[data-director-week-faltas]", snapshot.weekTotals.falta || 0);

  const trend = root.querySelector("[data-director-trend-chart]");
  if (trend) trend.innerHTML = trendChart(snapshot.trendPoints);
  const progress = root.querySelector("[data-director-course-progress]");
  if (progress) progress.innerHTML = snapshot.courseProgress.map((course) => progressRow(course.name, course.percent, course.total)).join("");
  const alerts = root.querySelector("[data-director-alert-list]");
  if (alerts) alerts.innerHTML = snapshot.alertItems.map(alertItem).join("");
  const risks = root.querySelector("[data-director-risk-table]");
  if (risks) risks.innerHTML = riskRows(snapshot.risks);
  const activities = root.querySelector("[data-director-activity-list]");
  if (activities) {
    activities.innerHTML = snapshot.activities.length
      ? snapshot.activities.map(activityItem).join("")
      : activityItem({ title: "Sin movimientos recientes", time: "", tone: "bg-slate-400", iconName: "activity" });
  }
  const updated = root.querySelector("[data-director-dashboard-updated]");
  if (updated) updated.textContent = updatedLabel(snapshot.updatedAt);
  document.querySelectorAll("[data-director-alert-badge]").forEach((badge) => {
    badge.textContent = snapshot.alertTotal > 99 ? "99+" : String(snapshot.alertTotal || "");
    badge.classList.toggle("hidden", !snapshot.alertTotal);
  });
  refreshDirectorIcons();
}

function setRefreshState(root, loading) {
  const button = root.querySelector("[data-action='refresh-director-dashboard']");
  if (!button) return;
  button.disabled = loading;
  const label = button.querySelector("[data-refresh-label]");
  if (label) label.textContent = loading ? "Actualizando..." : "Actualizar";
  button.querySelector("svg")?.classList.toggle("animate-spin", loading);
}

async function refreshDashboard(root) {
  if (root.dataset.loading === "true") return;
  root.dataset.loading = "true";
  setRefreshState(root, true);
  setStatus(root, "Consultando Firebase...");
  try {
    const snapshot = await buildDashboardSnapshot();
    if (!root.isConnected) return;
    writeDashboardCache(snapshot);
    renderSnapshot(root, snapshot);
    setStatus(root, "Datos actualizados", "text-school-green");
  } catch (error) {
    console.warn("No se pudo cargar el dashboard del director", error);
    if (root.isConnected) setStatus(root, "No se pudieron actualizar los datos.", "text-red-600");
  } finally {
    root.dataset.loading = "false";
    if (root.isConnected) setRefreshState(root, false);
  }
}

export function bindDirectorDashboard(route) {
  if (route !== "/director") return;
  const root = document.querySelector("[data-director-dashboard]");
  if (!root) return;
  root.querySelector("[data-action='refresh-director-dashboard']")?.addEventListener("click", () => refreshDashboard(root));
  const cached = readDashboardCache();
  if (cached) {
    renderSnapshot(root, cached);
    setStatus(root, "Datos guardados en este dispositivo");
    return;
  }
  refreshDashboard(root);
}
