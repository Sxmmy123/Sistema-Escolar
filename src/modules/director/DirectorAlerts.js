import { icon } from "../../ui/dom.js";
import {
  COURSES,
  getDirectorAttendanceSettings,
  listDirectorActivities,
  listDirectorAttendanceByTrimester,
  listDirectorGrades,
  listDirectorStudents
} from "../../services/directorData.js";
import { escapeDirectorHtml, refreshDirectorIcons } from "./DirectorUtils.js";

const TRIMESTERS = [
  { id: "t1", label: "1er trimestre" },
  { id: "t2", label: "2do trimestre" },
  { id: "t3", label: "3er trimestre" }
];
const ALERT_CACHE_KEY = "director_alertas_estudiantes_v1";
const ALERT_CACHE_VERSION = 1;
const ALERT_CACHE_TTL = 10 * 60 * 1000;

let alertsPromise = null;
let alertBindingsController = null;

function termOf(item) {
  return item?.trimestreId || "t1";
}

function termLabel(trimesterId) {
  return TRIMESTERS.find((term) => term.id === trimesterId)?.label || trimesterId;
}

function courseName(courseId) {
  return COURSES.find((course) => course.id === courseId)?.nombre || courseId || "Sin curso";
}

function requestedTrimester() {
  const candidates = [
    sessionStorage.getItem("directorNotasTrimestre"),
    sessionStorage.getItem("directorAsistenciaTrimestre")
  ];
  return candidates.find((value) => TRIMESTERS.some((term) => term.id === value)) || "";
}

function preferredTrimester(activities, grades) {
  const activityTerms = new Map(activities.map((activity) => [activity.id, termOf(activity)]));
  const counts = grades.reduce((result, grade) => {
    const trimesterId = grade.trimestreId || activityTerms.get(grade.actividadId) || "t1";
    result[trimesterId] = (result[trimesterId] || 0) + 1;
    return result;
  }, {});
  return [...TRIMESTERS].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))[0]?.id || "t1";
}

function average(values = []) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function gradeValue(value) {
  const parsed = Number(value);
  return Math.max(35, Math.min(100, Number.isFinite(parsed) ? Math.round(parsed) : 35));
}

function readAlertCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ALERT_CACHE_KEY) || "null");
    return parsed?.version === ALERT_CACHE_VERSION ? parsed.snapshot || null : null;
  } catch {
    return null;
  }
}

function writeAlertCache(snapshot) {
  try {
    localStorage.setItem(ALERT_CACHE_KEY, JSON.stringify({ version: ALERT_CACHE_VERSION, snapshot }));
  } catch {
    // La campana sigue disponible aunque el navegador bloquee localStorage.
  }
}

function cacheIsFresh(snapshot) {
  if (!snapshot || Date.now() - Number(snapshot.updatedAt || 0) > ALERT_CACHE_TTL) return false;
  const requested = requestedTrimester();
  const threshold = Math.max(35, Math.min(100, Number(sessionStorage.getItem("directorNotasMinima")) || 51));
  const localAbsenceLimit = Number(localStorage.getItem("directorLimiteFaltas") ?? 4);
  const absenceLimit = Number.isFinite(localAbsenceLimit) ? Math.max(0, Math.min(30, Math.round(localAbsenceLimit))) : 4;
  return (!requested || snapshot.trimesterId === requested)
    && snapshot.gradeThreshold === threshold
    && snapshot.absenceLimit === absenceLimit;
}

function attendanceAlerts(students, records, absenceLimit) {
  const recordsByStudent = records.reduce((result, record) => {
    if (!record.alumnoId) return result;
    result[record.alumnoId] = result[record.alumnoId] || [];
    result[record.alumnoId].push(record);
    return result;
  }, {});
  return students.map((student) => {
    const absences = (recordsByStudent[student.id] || []).filter((record) => String(record.estado || "").toLowerCase() === "falta").length;
    return { student, absences };
  }).filter((item) => item.absences > absenceLimit)
    .sort((a, b) => b.absences - a.absences || String(a.student.nombre || "").localeCompare(String(b.student.nombre || ""), "es"));
}

function gradeAlerts(students, activities, grades, trimesterId, threshold) {
  const termActivities = activities.filter((activity) => termOf(activity) === trimesterId);
  const activityIds = new Set(termActivities.map((activity) => activity.id));
  const termGrades = grades.filter((grade) => activityIds.has(grade.actividadId));
  const startedIds = new Set(termGrades.map((grade) => grade.actividadId).filter(Boolean));
  const gradeByKey = new Map(termGrades.map((grade) => [`${grade.actividadId}|${grade.alumnoId}`, grade]));
  const activitiesByCourse = termActivities.reduce((result, activity) => {
    if (!startedIds.has(activity.id) || !activity.cursoId) return result;
    result[activity.cursoId] = result[activity.cursoId] || [];
    result[activity.cursoId].push(activity);
    return result;
  }, {});

  return students.map((student) => {
    const studentActivities = activitiesByCourse[student.cursoId] || [];
    if (!studentActivities.length) return null;
    const score = average(studentActivities.map((activity) => gradeValue(gradeByKey.get(`${activity.id}|${student.id}`)?.nota)));
    return score < threshold ? { student, score } : null;
  }).filter(Boolean)
    .sort((a, b) => a.score - b.score || String(a.student.nombre || "").localeCompare(String(b.student.nombre || ""), "es"));
}

async function buildAlertSnapshot() {
  const selectedTrimester = requestedTrimester();
  const gradeThreshold = Math.max(35, Math.min(100, Number(sessionStorage.getItem("directorNotasMinima")) || 51));
  const [students, activities, grades, settings] = await Promise.all([
    listDirectorStudents(),
    listDirectorActivities(),
    listDirectorGrades(),
    getDirectorAttendanceSettings()
  ]);
  const trimesterId = selectedTrimester || preferredTrimester(activities, grades);
  const attendance = await listDirectorAttendanceByTrimester(trimesterId);
  const activeStudents = students.filter((student) => student.activo !== false);
  const absences = attendanceAlerts(activeStudents, attendance, settings.limiteFaltas);
  const lowGrades = gradeAlerts(activeStudents, activities, grades, trimesterId, gradeThreshold);
  const items = [
    ...absences.slice(0, 3).map(({ student, absences: total }) => ({
      kind: "attendance",
      studentId: student.id,
      courseId: student.cursoId,
      trimesterId,
      title: student.nombre || "Estudiante",
      detail: `${courseName(student.cursoId)} · ${total} faltas`,
      value: String(total)
    })),
    ...lowGrades.slice(0, 3).map(({ student, score }) => ({
      kind: "grade",
      studentId: student.id,
      courseId: student.cursoId,
      trimesterId,
      title: student.nombre || "Estudiante",
      detail: `${courseName(student.cursoId)} · promedio ${score}/100`,
      value: String(score)
    }))
  ];
  return {
    updatedAt: Date.now(),
    trimesterId,
    gradeThreshold,
    absenceLimit: settings.limiteFaltas,
    attendanceTotal: absences.length,
    gradesTotal: lowGrades.length,
    total: absences.length + lowGrades.length,
    items
  };
}

async function loadAlerts(force = false) {
  const cached = readAlertCache();
  if (!force && cacheIsFresh(cached)) return cached;
  if (!alertsPromise) {
    alertsPromise = buildAlertSnapshot()
      .then((snapshot) => {
        writeAlertCache(snapshot);
        return snapshot;
      })
      .finally(() => { alertsPromise = null; });
  }
  return alertsPromise;
}

function alertItem(item) {
  const attendance = item.kind === "attendance";
  return `
    <button type="button" data-director-alert-item data-alert-kind="${item.kind}" data-student-id="${item.studentId}" data-course-id="${item.courseId}" data-trimester-id="${item.trimesterId}" class="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-0 hover:bg-slate-50">
      <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg ${attendance ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}">${icon(attendance ? "user-x" : "trending-down", "h-4 w-4")}</span>
      <span class="min-w-0 flex-1">
        <strong class="block truncate text-xs font-semibold text-slate-900">${escapeDirectorHtml(item.title)}</strong>
        <span class="mt-0.5 block truncate text-[11px] text-slate-500">${escapeDirectorHtml(item.detail)}</span>
      </span>
      <span class="inline-flex min-w-8 items-center justify-center rounded-md px-1.5 py-1 text-xs font-semibold ${attendance ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}">${escapeDirectorHtml(item.value)}</span>
      ${icon("chevron-right", "h-4 w-4 shrink-0 text-slate-400")}
    </button>
  `;
}

function renderAlerts(snapshot) {
  const content = document.querySelector("[data-director-alert-content]");
  const term = document.querySelector("[data-director-alert-term]");
  if (!content || !term) return;
  term.textContent = `${termLabel(snapshot.trimesterId)} · ${snapshot.total} alerta(s)`;
  document.querySelectorAll("[data-director-alert-badge]").forEach((badge) => {
    badge.textContent = snapshot.total > 99 ? "99+" : String(snapshot.total || "");
    badge.classList.toggle("hidden", !snapshot.total);
  });
  content.innerHTML = snapshot.items.length ? `
    <div>${snapshot.items.map(alertItem).join("")}</div>
    ${snapshot.total > snapshot.items.length ? `<p class="bg-slate-50 px-4 py-2 text-center text-[10px] text-slate-500">Mostrando ${snapshot.items.length} de ${snapshot.total} alertas prioritarias.</p>` : ""}
  ` : `
    <div class="grid min-h-40 place-items-center p-5 text-center">
      <div><span class="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-green-50 text-school-green">${icon("circle-check-big", "h-5 w-5")}</span><p class="mt-3 text-sm font-semibold text-slate-900">Sin alertas prioritarias</p><p class="mt-1 text-[11px] leading-4 text-slate-500">No hay alumnos sobre el limite de faltas ni debajo de la nota minima.</p></div>
    </div>
  `;
  refreshDirectorIcons();
}

function renderLoading() {
  const content = document.querySelector("[data-director-alert-content]");
  if (content) content.innerHTML = `<div class="grid min-h-40 place-items-center p-5 text-center"><div><span class="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-school-green"></span><p class="mt-3 text-xs text-slate-500">Actualizando alertas...</p></div></div>`;
}

function renderError(error, cached) {
  if (cached) {
    renderAlerts(cached);
    const term = document.querySelector("[data-director-alert-term]");
    if (term) term.textContent = `${termLabel(cached.trimesterId)} · copia local`;
    return;
  }
  const content = document.querySelector("[data-director-alert-content]");
  if (content) content.innerHTML = `<div class="grid min-h-40 place-items-center p-5 text-center"><div><p class="text-xs font-semibold text-red-700">No se pudieron cargar las alertas.</p><p class="mt-1 text-[10px] text-slate-500">${escapeDirectorHtml(error?.message || "Intente nuevamente")}</p></div></div>`;
}

function navigateToAlert(button) {
  const kind = button.dataset.alertKind;
  const studentId = button.dataset.studentId;
  const courseId = button.dataset.courseId;
  const trimesterId = button.dataset.trimesterId;
  const target = kind === "attendance" ? "/director/asistencia" : "/director/notas";
  if (kind === "attendance") {
    sessionStorage.setItem("directorAsistenciaEstudiante", studentId);
    sessionStorage.setItem("directorAsistenciaCursoSolicitado", courseId);
    sessionStorage.setItem("directorAsistenciaTrimestreSolicitado", trimesterId);
  } else {
    sessionStorage.setItem("directorNotasEstudiante", studentId);
    sessionStorage.setItem("directorNotasCursoSolicitado", courseId);
    sessionStorage.setItem("directorNotasTrimestreSolicitado", trimesterId);
    sessionStorage.setItem("directorNotasOrigen", "alertas");
  }
  const current = (window.location.hash || "#/").replace(/^#/, "");
  if (current === target) window.dispatchEvent(new Event("hashchange"));
  else window.location.hash = `#${target}`;
}

export function bindDirectorAlerts(route) {
  if (!route.startsWith("/director")) return;
  const root = document.querySelector("[data-director-alerts]");
  const toggle = root?.querySelector("[data-director-alert-toggle]");
  const panel = root?.querySelector("[data-director-alert-panel]");
  if (!root || !toggle || !panel) return;

  alertBindingsController?.abort();
  alertBindingsController = new AbortController();
  const { signal } = alertBindingsController;
  const cached = readAlertCache();
  if (cached) renderAlerts(cached);

  const setOpen = (open) => {
    panel.classList.toggle("hidden", !open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  const refresh = async (force = false) => {
    if (!cached || force) renderLoading();
    const refreshButton = root.querySelector("[data-director-alert-refresh]");
    refreshButton?.querySelector("svg")?.classList.add("animate-spin");
    if (refreshButton) refreshButton.disabled = true;
    try {
      renderAlerts(await loadAlerts(force));
    } catch (error) {
      renderError(error, readAlertCache());
    } finally {
      const currentButton = document.querySelector("[data-director-alert-refresh]");
      currentButton?.querySelector("svg")?.classList.remove("animate-spin");
      if (currentButton) currentButton.disabled = false;
    }
  };

  toggle.addEventListener("click", () => {
    const open = panel.classList.contains("hidden");
    setOpen(open);
    if (open && !cacheIsFresh(readAlertCache())) refresh(false);
  }, { signal });
  root.querySelector("[data-director-alert-refresh]")?.addEventListener("click", () => refresh(true), { signal });
  root.addEventListener("click", (event) => {
    const item = event.target.closest("[data-director-alert-item]");
    if (item) navigateToAlert(item);
  }, { signal });
  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) setOpen(false);
  }, { signal });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  }, { signal });

  if (!cacheIsFresh(cached)) refresh(false);
}
