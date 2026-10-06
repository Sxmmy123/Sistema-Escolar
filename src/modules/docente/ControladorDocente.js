import { loadSavedTrimester, persistActiveTrimester, setActiveTrimester, teacherState } from "./EstadoDocente.js";
import { emptyState, escapeHtml, refreshIcons, setHtml, setText } from "./UtilidadesDocente.js";
import { TRIMESTERS, getTeacherContext } from "../../services/teacherData.js";
import { renderAttendance } from "./AsistenciaDocente.js";
import { renderTasks } from "./AgendaDocente.js";
import { renderDateGrading } from "./CalificarDocente.js";
import { renderRegularization } from "./RegularizacionDocente.js";
import { renderNotes } from "./NotasDocente.js";
import { renderBulletin } from "./BoletinDocente.js";
import { renderSummary } from "./ResumenAsistenciaDocente.js";
import { renderTeacherSchedule } from "./HorarioDocente.js";
import { renderDashboard } from "./PanelDocente.js";

function focusTeacherNotification(route) {
  const focus = teacherState.notificationFocus;
  if (!focus || focus.route !== route) return;
  const container = document.querySelector(route === "/docente/regularizacion" ? "[data-teacher-regularization]" : route === "/docente/resumen" ? "[data-teacher-summary]" : route === "/docente/notas" ? "[data-teacher-notes]" : "[data-teacher-grading]");
  const selector = focus.studentId
    ? `[data-teacher-alert-student="${CSS.escape(focus.studentId)}"]`
    : `[data-grade-activity="${CSS.escape(focus.activityId || "")}"]`;
  const target = container?.querySelector(selector);
  if (!target) return;
  teacherState.notificationFocus = null;
  target.classList.add("teacher-alert-focus");
  requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }));
  setTimeout(() => target.classList.remove("teacher-alert-focus"), 8000);
}

function renderCourseTabs(context, onSelect) {
  const holder = document.querySelector("[data-teacher-course-tabs]");
  if (!holder) return;

  if (!context.courses.length) {
    holder.innerHTML = `<span class="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-500">Sin cursos asignados</span>`;
    return;
  }

  if (!context.courses.some((course) => course.id === teacherState.selectedCourseId)) {
    teacherState.selectedCourseId = context.courses[0].id;
    sessionStorage.setItem("docenteCursoId", teacherState.selectedCourseId);
  }

  holder.innerHTML = context.courses.map((course) => `
    <button type="button" data-teacher-course-id="${course.id}" class="shrink-0 rounded-2xl border px-4 py-2 text-sm font-black transition ${course.id === teacherState.selectedCourseId ? "border-school-navy bg-school-green text-white shadow-soft" : "border-slate-200 bg-white text-slate-600 hover:border-school-navy/40"}">${escapeHtml(course.corto)}</button>
  `).join("");

  holder.querySelectorAll("[data-teacher-course-id]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.selectedCourseId = button.dataset.teacherCourseId;
      teacherState.selectedActivityId = "";
      sessionStorage.setItem("docenteCursoId", teacherState.selectedCourseId);
      onSelect?.();
    });
  });
}

function renderTrimesterTabs(onSelect) {
  const holder = document.querySelector("[data-teacher-trimester-tabs]");
  if (!holder) return;

  holder.innerHTML = TRIMESTERS.map((trimester) => `
    <button type="button" data-teacher-trimester-id="${trimester.id}" class="shrink-0 rounded-2xl border px-4 py-2 text-sm font-black transition ${trimester.id === teacherState.trimesterId ? "border-school-navy bg-school-sky text-school-navy shadow-soft ring-2 ring-school-navy/10" : "border-slate-200 bg-white text-slate-600 hover:border-school-navy/40"}">${escapeHtml(trimester.label)}</button>
  `).join("");

  holder.querySelectorAll("[data-teacher-trimester-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      setActiveTrimester(button.dataset.teacherTrimesterId);
      await persistActiveTrimester(teacherState.context);
      onSelect?.();
    });
  });
}

async function renderRoute(route) {
  const context = teacherState.context;
  renderCourseTabs(context, () => renderRoute(route));
  renderTrimesterTabs(() => renderRoute(route));
  setText("[data-teacher-page-status]", context.courses.length ? "Datos del docente cargados" : "Sin asignaciones");

  if (route === "/docente/asistencia") await renderAttendance(context);
  if (route === "/docente/tareas") await renderTasks(context);
  if (route === "/docente/calificar") await renderDateGrading(context);
  if (route === "/docente/regularizacion") await renderRegularization(context);
  if (route === "/docente/notas") await renderNotes(context);
  if (route === "/docente/boletin") await renderBulletin(context);
  if (route === "/docente/resumen") await renderSummary(context);
  if (route === "/docente/horario") await renderTeacherSchedule(context);
  if (["/docente/calificar", "/docente/regularizacion", "/docente/notas", "/docente/resumen"].includes(route)) focusTeacherNotification(route);
  refreshIcons();
}

export async function bindDocentePages(route) {
  if (!route.startsWith("/docente")) return;

  try {
    const context = await getTeacherContext();
    teacherState.context = context;
    loadSavedTrimester(context);
    setText("[data-current-user-name]", context.profile?.nombre || "Docente");

    if (route === "/docente") {
      await renderDashboard(context);
    } else {
      await renderRoute(route);
    }
  } catch (error) {
    console.error("No se pudo cargar docente", error);
    setHtml("[data-teacher-today]", emptyState("No se pudo cargar docente", error.message || "Revisa la conexion y los permisos de Firebase."));
    setHtml("[data-teacher-page-status]", "Error de carga");
  }
}
