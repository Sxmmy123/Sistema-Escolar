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
import { persistActiveTrimester, selectedTrimester, setActiveTrimester, teacherState } from "./EstadoDocente.js";
import { emptyState, escapeHtml, refreshIcons, scheduleList, setHtml, setText } from "./UtilidadesDocente.js";

function teacherCoursesCards(context) {
  if (!context.courses.length) {
    return emptyState("Sin cursos asignados", "Primero asigna cursos y materias a este docente desde el panel de administrador.");
  }
  const subjectIds = [...new Set(context.courses.flatMap((course) => course.materias || []))];
  return `
    <div>
      <p class="mb-2 text-[11px] font-black text-slate-500">Cursos asignados</p>
      <div class="flex flex-wrap gap-2">
        ${context.courses.map((course) => `<span class="rounded-full bg-school-sky px-3 py-1.5 text-[11px] font-black text-school-navy">${escapeHtml(course.corto || course.nombre)}</span>`).join("")}
      </div>
    </div>
    <div>
      <p class="mb-2 text-[11px] font-black text-slate-500">Materias asignadas</p>
      <div class="flex flex-wrap gap-2">
        ${subjectIds.map((subjectId) => {
          const subject = findSubject(subjectId);
          return `<span class="rounded-full px-3 py-1.5 text-[11px] font-black text-slate-700" style="background:${subject?.color || "#e2e8f0"}">${escapeHtml(subject?.corto || subject?.nombre || subjectId)}</span>`;
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
  const modal = document.querySelector("[data-trimester-confirm-modal]");
  if (modal) modal.classList.remove("hidden");
  if (modal) modal.classList.add("flex");
}

function closeTrimesterConfirm() {
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
  setText("[data-teacher-active-trimester]", selectedTrimester().label);
  holder.innerHTML = TRIMESTERS.map((trimester) => `
    <button type="button" data-dashboard-trimester="${trimester.id}" class="shrink-0 rounded-xl border px-3 py-1.5 text-xs font-black transition ${trimester.id === teacherState.trimesterId ? "border-school-green bg-school-green text-white shadow-soft" : "border-slate-200 bg-white text-slate-600 hover:border-school-green/40"}">${escapeHtml(trimester.label)}</button>
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
    closeTrimesterConfirm();
    if (!nextTrimesterId) return;
    setActiveTrimester(nextTrimesterId);
    await persistActiveTrimester(context);
    renderDashboardTrimester(context);
    await renderDashboard(context);
  };
}

export async function renderDashboard(context) {
  renderDashboardTrimester(context);
  setText("[data-teacher-welcome]", `Bienvenido, ${context.profile?.nombre || "docente"}`);
  setText("[data-teacher-status]", context.courses.length ? "Datos cargados" : "Falta asignacion");
  setText('[data-teacher-count="courses"]', String(context.courses.length));
  setText('[data-teacher-count="subjects"]', String(context.subjectIds.length));
  setHtml("[data-teacher-courses]", teacherCoursesCards(context));

  const studentLists = await Promise.all(context.courses.map((course) => getTeacherStudents(course.id)));
  setText('[data-teacher-count="students"]', String(studentLists.flat().length));

  const nextSchoolDay = nextSchoolDayInfo();
  const scheduleCache = getTeacherScheduleCacheMeta(context);
  const todayRows = await getTeacherScheduleRows(context, todayDayId(0), { cacheOnly: true });
  const tomorrowRows = await getTeacherScheduleRows(context, nextSchoolDay.dayId, { cacheOnly: true });
  const courseById = Object.fromEntries(context.courses.map((course) => [course.id, course]));
  const activities = (await Promise.all(context.courses.map((course) => listActivities(course.id, teacherState.trimesterId))))
    .flat()
    .filter((activity) => courseById[activity.cursoId]?.materias.includes(activity.materiaId));
  const pendingTasks = activities.filter((activity) => String(activity.fecha || "") >= todayIso()).length;
  setText('[data-teacher-count="classesToday"]', String(todayRows.length));
  setText('[data-teacher-count="activities"]', String(activities.length));
  setText('[data-teacher-count="tasks"]', String(pendingTasks));
  setHtml("[data-teacher-today]", scheduleList(todayRows, scheduleCache ? "No hay clases asignadas para hoy." : "Carga el horario desde el modulo Horario."));
  setText("[data-teacher-next-title]", nextSchoolDay.label);
  setHtml("[data-teacher-tomorrow]", scheduleList(tomorrowRows, scheduleCache ? `No hay clases asignadas para ${nextSchoolDay.label.toLowerCase()}.` : "Carga el horario desde el modulo Horario."));
  refreshIcons();
}

