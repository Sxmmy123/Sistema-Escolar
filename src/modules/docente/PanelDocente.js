import { findSubject } from "../../data/catalog.js";
import {
  getTeacherScheduleCacheMeta,
  getTeacherScheduleRows,
  getTeacherStudents,
  listActivities,
  nextSchoolDayInfo,
  todayDayId,
  todayIso,
  TRIMESTERS
} from "../../services/teacherData.js";
import { persistActiveTrimester, selectedTrimester, teacherState } from "./EstadoDocente.js";
import { puedeRegistrarTrimestre } from "../../services/relevoDocente.js";
import { emptyState, escapeHtml, refreshIcons, scheduleList, setHtml, setText } from "./UtilidadesDocente.js";
import { cargarVistaDocente } from "./CargaVistaDocente.js";
import { icon } from "../../ui/dom.js";

export async function renderDashboardSchedule(context, {
  readCache = (current) => getTeacherScheduleCacheMeta(current) ? getTeacherScheduleRows(current, null, { cacheOnly: true }) : null,
  refresh = (current) => getTeacherScheduleRows(current, null, { forceRemote: true }),
  force = false
} = {}) {
  const container = document.querySelector("[data-teacher-today]");
  if (!container) return;
  const nextSchoolDay = nextSchoolDayInfo();
  const reload = () => renderDashboardSchedule(context, { readCache, refresh, force: true });
  setText("[data-teacher-next-title]", nextSchoolDay.label);
  return cargarVistaDocente({
    container, force,
    isCurrent: () => document.querySelector("[data-teacher-today]") === container &&
      (!teacherState.context?.uid || teacherState.context.uid === context.uid),
    readCache: () => readCache(context),
    refresh: () => refresh(context),
    draw: (rows, { loading = false, error = "" } = {}) => {
      const todayRows = (rows || []).filter((row) => row.diaId === todayDayId(0));
      const tomorrowRows = (rows || []).filter((row) => row.diaId === nextSchoolDay.dayId);
      const unavailable = loading ? "Cargando horario..." : "Horario no disponible.";
      const status = error ? `<p role="alert" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">${escapeHtml(error)}</p><button type="button" data-retry-dashboard-schedule class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-school-green">${icon("refresh-cw", "h-3.5 w-3.5")}Reintentar</button>` : "";
      container.setAttribute?.("aria-busy", String(loading));
      container.innerHTML = status + scheduleList(todayRows, rows ? "No hay clases asignadas para hoy." : unavailable);
      setHtml("[data-teacher-tomorrow]", scheduleList(tomorrowRows, rows ? `No hay clases asignadas para ${nextSchoolDay.label.toLowerCase()}.` : unavailable));
      setText('[data-teacher-count="classesToday"]', rows ? String(todayRows.length) : "—");
      container.querySelector("[data-retry-dashboard-schedule]")?.addEventListener("click", reload);
      refreshIcons();
    }
  });
}

function teacherCoursesCards(context) {
  if (!context.courses.length) {
    return emptyState("Sin cursos asignados", "Primero asigna cursos y materias a este docente desde el panel de administrador.");
  }
  const subjectIds = [...new Set(context.courses.flatMap((course) => course.materias || []))];
  return `
    <div>
      <p class="mb-1.5 text-[10px] font-semibold text-slate-500 sm:mb-2 sm:text-[11px] sm:font-black">Cursos asignados</p>
      <div class="flex flex-wrap gap-1.5 sm:gap-2">
        ${context.courses.map((course) => `<span class="rounded-full bg-school-sky px-2.5 py-1 text-[10px] font-bold text-school-navy sm:px-3 sm:py-1.5 sm:text-[11px] sm:font-black">${escapeHtml(course.corto || course.nombre)}</span>`).join("")}
      </div>
    </div>
    <div>
      <p class="mb-1.5 text-[10px] font-semibold text-slate-500 sm:mb-2 sm:text-[11px] sm:font-black">Materias asignadas</p>
      <div class="flex flex-wrap gap-1.5 sm:gap-2">
        ${subjectIds.map((subjectId) => {
          const subject = findSubject(subjectId);
          return `<span class="tinted-surface rounded-full px-2.5 py-1 text-[10px] font-bold text-slate-700 sm:px-3 sm:py-1.5 sm:text-[11px] sm:font-black" style="--surface-color:${subject?.color || "#e2e8f0"}">${escapeHtml(subject?.corto || subject?.nombre || subjectId)}</span>`;
        }).join("")}
      </div>
    </div>
  `;
}

function openTrimesterConfirm(trimesterId) {
  const trimester = TRIMESTERS.find((item) => item.id === trimesterId);
  if (!trimester || trimester.id === teacherState.trimesterId) return;
  teacherState.pendingTrimesterId = trimester.id;
  setText("[data-trimester-confirm-label]", trimester.label);
  setText("[data-trimester-confirm-status]", "");
  const modal = document.querySelector("[data-trimester-confirm-modal]");
  if (modal) modal.classList.remove("hidden");
  if (modal) modal.classList.add("flex");
}

function closeTrimesterConfirm() {
  if (document.querySelector("[data-trimester-confirm]")?.disabled) return;
  teacherState.pendingTrimesterId = "";
  const modal = document.querySelector("[data-trimester-confirm-modal]");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function renderDashboardTrimester(context) {
  const holder = document.querySelector("[data-teacher-dashboard-trimesters]");
  if (!holder) return;
  const shortLabels = ["1ro", "2do", "3er"];
  setText("[data-teacher-active-trimester]", selectedTrimester().label);
  holder.innerHTML = TRIMESTERS.map((trimester, index) => `
    <button type="button" data-dashboard-trimester="${trimester.id}" ${puedeRegistrarTrimestre(context, trimester.id) ? "" : 'disabled title="Consulta este trimestre en Boletin"'} class="shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold transition disabled:opacity-40 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs sm:font-black ${trimester.id === teacherState.trimesterId ? "border-school-green bg-school-green text-white shadow-soft" : "border-slate-200 bg-white text-slate-600 hover:border-school-green/40"}"><span class="sm:hidden">${shortLabels[index]}</span><span class="hidden sm:inline">${escapeHtml(trimester.label)}</span></button>
  `).join("");
  holder.querySelectorAll("[data-dashboard-trimester]").forEach((button) => {
    button.addEventListener("click", () => openTrimesterConfirm(button.dataset.dashboardTrimester));
  });
  const cancelButton = document.querySelector("[data-trimester-cancel]");
  const modal = document.querySelector("[data-trimester-confirm-modal]");
  const confirmButton = document.querySelector("[data-trimester-confirm]");
  if (cancelButton) cancelButton.onclick = closeTrimesterConfirm;
  if (modal) {
    modal.onclick = (event) => {
      if (event.target?.matches("[data-trimester-confirm-modal]")) closeTrimesterConfirm();
    };
  }
  if (confirmButton) confirmButton.onclick = async () => {
    const nextTrimesterId = teacherState.pendingTrimesterId;
    if (!nextTrimesterId || confirmButton.disabled) return;
    confirmButton.disabled = true;
    if (cancelButton) cancelButton.disabled = true;
    setText("[data-trimester-confirm-status]", "Guardando trimestre...");
    try {
      await persistActiveTrimester(context, nextTrimesterId);
      confirmButton.disabled = false;
      closeTrimesterConfirm();
      await renderDashboard(context);
    } catch (error) {
      setText("[data-trimester-confirm-status]", `No se guardo el cambio. Se mantiene ${selectedTrimester().label}. ${error.message}`);
    } finally {
      confirmButton.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
    }
  };
}

export async function renderDashboard(context) {
  renderDashboardTrimester(context);
  setText("[data-teacher-welcome]", `Bienvenido, ${context.profile?.nombre || "docente"}`);
  setText("[data-teacher-header-courses]", context.courses.length
    ? context.courses.map((course) => course.corto || course.nombre).join(", ")
    : "Sin cursos asignados");
  setText("[data-teacher-status]", context.courses.length ? "Datos cargados" : "Falta asignacion");
  setText('[data-teacher-count="courses"]', String(context.courses.length));
  setText('[data-teacher-count="subjects"]', String(context.subjectIds.length));
  setHtml("[data-teacher-courses]", teacherCoursesCards(context));

  const courseById = Object.fromEntries(context.courses.map((course) => [course.id, course]));
  const trimesterId = teacherState.trimesterId;
  const container = document.querySelector("[data-teacher-today]");
  const [studentLists, activityLists] = await Promise.all([
    Promise.all(context.courses.map((course) => getTeacherStudents(course.id))),
    Promise.all(context.courses.map((course) => listActivities(course.id, trimesterId))),
    renderDashboardSchedule(context)
  ]);
  if (document.querySelector("[data-teacher-today]") !== container || teacherState.trimesterId !== trimesterId ||
    teacherState.context?.uid && teacherState.context.uid !== context.uid) return;
  setText('[data-teacher-count="students"]', String(studentLists.flat().length));
  const activities = activityLists
    .flat()
    .filter((activity) => courseById[activity.cursoId]?.materias.includes(activity.materiaId));
  const pendingTasks = activities.filter((activity) => !["material", "materiales"].includes(String(activity.tipo || "").toLowerCase()) && String(activity.fecha || "") >= todayIso()).length;
  setText('[data-teacher-count="activities"]', String(activities.length));
  setText('[data-teacher-count="tasks"]', String(pendingTasks));
  refreshIcons();
}

