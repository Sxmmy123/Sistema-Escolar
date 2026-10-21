import { icon } from "../../ui/dom.js";
import {
  COURSES,
  getDirectorAttendanceSettings,
  listDirectorAllActivities,
  listDirectorAttendanceByTrimester,
  listDirectorGrades,
  listDirectorStudents,
  subjectName
} from "../../services/directorData.js";
import { escapeDirectorHtml, refreshDirectorIcons } from "./DirectorUtils.js";
import { calculateCourseTerm } from "../../services/calculoAcademico.js";
import { auth } from "../../firebase/client.js";
import { claveCache } from "../../services/rutasFirestore.js";
import { directorAlertKey, markDirectorAlertViewed, readDirectorSeenKeys, unseenDirectorAlerts } from "../../services/avisosDirector.js";

const TRIMESTERS = [
  { id: "t1", label: "1er trimestre" },
  { id: "t2", label: "2do trimestre" },
  { id: "t3", label: "3er trimestre" }
];
const alertCacheKey = () => claveCache("director_alertas", auth.currentUser?.uid || "");
const ALERT_CACHE_VERSION = 3;
const ALERT_CACHE_TTL = 10 * 60 * 1000;

const pendingAlerts = new Map();
let alertBindingsController = null;
let activeModalAlert = null;

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

function readAlertCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(alertCacheKey()) || "null");
    return parsed?.version === ALERT_CACHE_VERSION ? parsed.snapshot || null : null;
  } catch {
    return null;
  }
}

function writeAlertCache(snapshot, key = alertCacheKey()) {
  try {
    localStorage.setItem(key, JSON.stringify({ version: ALERT_CACHE_VERSION, snapshot }));
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
    const dates = [...new Set((recordsByStudent[student.id] || [])
      .filter((record) => String(record.estado || "").toLowerCase() === "falta")
      .map((record) => record.fecha).filter(Boolean))].sort();
    return { student, absences: dates.length, dates };
  }).filter((item) => item.absences > absenceLimit)
    .sort((a, b) => b.absences - a.absences || String(a.student.nombre || "").localeCompare(String(b.student.nombre || ""), "es"));
}

function gradeAlerts(students, activities, grades, attendanceRows, trimestreId, threshold) {
  return [...new Set(students.map((student) => student.cursoId))]
    .flatMap((courseId) => calculateCourseTerm({ students, activities, grades, attendanceRows, courseId, trimestreId }).studentResults)
    .filter((result) => result.average > 0 && result.average < threshold)
    .map((result) => ({
      student: result.student,
      score: result.average,
      subjects: Object.entries(result.subjectResults)
        .filter(([, subject]) => subject.hasData && subject.final < threshold)
        .map(([id, subject]) => ({ id, name: subjectName(id), score: subject.final }))
        .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "es"))
    }))
    .sort((a, b) => a.score - b.score || String(a.student.nombre || "").localeCompare(String(b.student.nombre || ""), "es"));
}

async function buildAlertSnapshot() {
  const selectedTrimester = requestedTrimester();
  const gradeThreshold = Math.max(35, Math.min(100, Number(sessionStorage.getItem("directorNotasMinima")) || 51));
  const [students, activities, grades, settings] = await Promise.all([
    listDirectorStudents(),
    listDirectorAllActivities(),
    listDirectorGrades(),
    getDirectorAttendanceSettings()
  ]);
  const trimesterId = selectedTrimester || preferredTrimester(activities, grades);
  const attendance = await listDirectorAttendanceByTrimester(trimesterId);
  const activeStudents = students.filter((student) => student.activo !== false);
  const absences = attendanceAlerts(activeStudents, attendance, settings.limiteFaltas);
  const lowGrades = gradeAlerts(activeStudents, activities, grades, attendance, trimesterId, gradeThreshold);
  const items = [
    ...absences.map(({ student, absences: total, dates }) => ({
      kind: "attendance",
      studentId: student.id,
      courseId: student.cursoId,
      trimesterId,
      title: student.nombre || "Estudiante",
      detail: `${courseName(student.cursoId)} · ${total} faltas`,
      value: String(total),
      threshold: settings.limiteFaltas,
      dates
    })),
    ...lowGrades.map(({ student, score, subjects }) => ({
      kind: "grade",
      studentId: student.id,
      courseId: student.cursoId,
      trimesterId,
      title: student.nombre || "Estudiante",
      detail: `${courseName(student.cursoId)} · promedio ${score}/100`,
      value: String(score),
      threshold: gradeThreshold,
      subjects
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
  const cacheKey = alertCacheKey();
  const requestKey = `${cacheKey}|${requestedTrimester()}|${sessionStorage.getItem("directorNotasMinima") || 51}|${localStorage.getItem("directorLimiteFaltas") || 4}`;
  if (!pendingAlerts.has(requestKey)) {
    const promise = buildAlertSnapshot()
      .then((snapshot) => {
        writeAlertCache(snapshot, cacheKey);
        return snapshot;
      })
      .finally(() => { pendingAlerts.delete(requestKey); });
    pendingAlerts.set(requestKey, promise);
  }
  return pendingAlerts.get(requestKey);
}

function alertItem(item) {
  const attendance = item.kind === "attendance";
  return `
    <button type="button" data-director-alert-item="${escapeDirectorHtml(directorAlertKey(item))}" class="flex w-full items-start gap-2.5 border-b border-slate-100 px-4 py-2.5 text-left transition last:border-0 hover:bg-slate-50">
      <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg ${attendance ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}">${icon(attendance ? "user-x" : "trending-down", "h-4 w-4")}</span>
      <span class="min-w-0 flex-1">
        <strong class="block truncate text-xs font-medium text-slate-900">${escapeDirectorHtml(item.title)}</strong>
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
  const items = unseenDirectorAlerts(snapshot.items, readDirectorSeenKeys(auth.currentUser?.uid || "", snapshot.trimesterId));
  const total = items.length;
  term.textContent = `${termLabel(snapshot.trimesterId)} · ${total} aviso(s) nuevo(s)`;
  document.querySelectorAll("[data-director-alert-badge]").forEach((badge) => {
    badge.textContent = total > 99 ? "99+" : String(total || "");
    badge.classList.toggle("hidden", !total);
  });
  content.innerHTML = items.length ? `
    <div>${items.map(alertItem).join("")}</div>
  ` : `
    <div class="grid min-h-40 place-items-center p-5 text-center">
      <div><span class="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-green-50 text-school-green">${icon("circle-check-big", "h-5 w-5")}</span><p class="mt-3 text-sm font-semibold text-slate-900">No hay avisos nuevos</p><p class="mt-1 text-[11px] leading-4 text-slate-500">Los avisos que ya abriste no se vuelven a mostrar.</p></div>
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

function alertDetailRows(item) {
  if (item.kind === "attendance") {
    return `<ul class="max-h-[42dvh] overflow-y-auto rounded-md border border-slate-200 px-3 text-sm text-slate-700">${item.dates.map((date) => {
      const parsed = new Date(`${date}T12:00:00`);
      const label = Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" });
      return `<li class="flex justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0"><span>${escapeDirectorHtml(label)}</span><span class="text-red-700">Falta</span></li>`;
    }).join("")}</ul>`;
  }
  return `<section><h3 class="mb-2 text-xs font-semibold text-red-700">Materias debajo de ${escapeDirectorHtml(item.threshold)} puntos</h3><ul class="max-h-[42dvh] overflow-y-auto rounded-md border border-slate-200 px-3 text-sm text-slate-700">${item.subjects.map((subject) => `
    <li class="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0"><span>${escapeDirectorHtml(subject.name)}</span><span class="shrink-0 font-medium text-red-700">${escapeDirectorHtml(subject.score)}/100</span></li>
  `).join("")}</ul></section>`;
}

function openDirectorAlertModal(item, snapshot) {
  const modal = document.querySelector("[data-director-alert-modal]");
  const holder = modal?.querySelector("[data-director-alert-modal-content]");
  if (!holder) return;
  const attendance = item.kind === "attendance";
  holder.innerHTML = `
    <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
      <div class="min-w-0"><p class="text-xs font-medium text-school-green">${attendance ? `${escapeDirectorHtml(item.value)} faltas en el trimestre` : `Promedio ${escapeDirectorHtml(item.value)}/100`}</p><h2 id="director-alert-modal-title" class="mt-1 break-words text-base font-semibold text-slate-950">${escapeDirectorHtml(item.title)}</h2><p class="mt-1 text-xs text-slate-600">${escapeDirectorHtml(courseName(item.courseId))} · ${escapeDirectorHtml(termLabel(item.trimesterId))}</p></div>
      <button type="button" data-close-director-alert-modal aria-label="Cerrar detalle" class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100">${icon("x", "h-4 w-4")}</button>
    </div>
    <div class="px-4 py-3 sm:px-5"><p class="text-xs leading-5 text-slate-600">${attendance ? "Solo se cuentan dias con asistencia registrada." : `El promedio trimestral esta debajo de ${escapeDirectorHtml(item.threshold)} puntos.`}</p><div class="mt-3">${alertDetailRows(item)}</div></div>
    <div class="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
      <button type="button" data-close-director-alert-modal class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Cerrar</button>
      <button type="button" data-director-alert-go class="rounded-md bg-school-green px-3 py-2 text-xs font-medium text-white hover:bg-green-800">${attendance ? "Ver asistencia" : "Ver notas"}</button>
    </div>`;
  activeModalAlert = item;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.querySelector("[data-director-alert-panel]")?.classList.add("hidden");
  document.querySelector("[data-director-alert-toggle]")?.setAttribute("aria-expanded", "false");
  holder.querySelector("[data-close-director-alert-modal]")?.focus();
  markDirectorAlertViewed(auth.currentUser?.uid || "", item);
  renderAlerts(snapshot);
}

function closeDirectorAlertModal() {
  const modal = document.querySelector("[data-director-alert-modal]");
  modal?.classList.add("hidden");
  modal?.classList.remove("flex");
  activeModalAlert = null;
  document.querySelector("[data-director-alert-toggle]")?.focus();
}

function navigateToAlert(item) {
  const { kind, studentId, courseId, trimesterId } = item;
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
  alertBindingsController?.abort();
  alertBindingsController = null;
  activeModalAlert = null;
  if (!route.startsWith("/director")) return;
  const root = document.querySelector("[data-director-alerts]");
  const toggle = root?.querySelector("[data-director-alert-toggle]");
  const panel = root?.querySelector("[data-director-alert-panel]");
  if (!root || !toggle || !panel) return;

  alertBindingsController = new AbortController();
  const { signal } = alertBindingsController;
  const uid = auth.currentUser?.uid || "";
  const cached = readAlertCache();
  let currentSnapshot = cached;
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
      const snapshot = await loadAlerts(force);
      if (signal.aborted || auth.currentUser?.uid !== uid) return;
      currentSnapshot = snapshot;
      renderAlerts(snapshot);
    } catch (error) {
      if (signal.aborted || auth.currentUser?.uid !== uid) return;
      renderError(error, readAlertCache());
    } finally {
      const currentButton = signal.aborted ? null : root.querySelector("[data-director-alert-refresh]");
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
    const button = event.target.closest("[data-director-alert-item]");
    const item = currentSnapshot?.items.find((alert) => directorAlertKey(alert) === button?.dataset.directorAlertItem);
    if (item) openDirectorAlertModal(item, currentSnapshot);
  }, { signal });
  const modal = document.querySelector("[data-director-alert-modal]");
  modal?.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-close-director-alert-modal]")) return closeDirectorAlertModal();
    if (event.target.closest("[data-director-alert-go]") && activeModalAlert) {
      const item = activeModalAlert;
      closeDirectorAlertModal();
      navigateToAlert(item);
    }
  }, { signal });
  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) setOpen(false);
  }, { signal });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (activeModalAlert) closeDirectorAlertModal();
    else setOpen(false);
  }, { signal });
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith(claveCache("director_avisos_vistos", uid)) && currentSnapshot) renderAlerts(currentSnapshot);
  }, { signal });

  if (!cacheIsFresh(cached)) refresh(false);
}
