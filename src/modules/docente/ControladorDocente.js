import { loadSavedTrimester, teacherState } from "./EstadoDocente.js";
import { emptyState, escapeHtml, refreshIcons, setHtml, setText } from "./UtilidadesDocente.js";
import { getTeacherContext } from "../../services/teacherData.js";
import { puedeRegistrarTrimestre, trimestresDeAsignacion } from "../../services/relevoDocente.js";
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

async function renderRoute(route) {
  const context = teacherState.context;
  renderCourseTabs(context, () => renderRoute(route));
  if (!puedeRegistrarTrimestre(context, teacherState.trimesterId) && !["/docente/boletin", "/docente/horario", "/docente/resumen"].includes(route)) {
    setHtml("[data-teacher-page]", `<div class="p-5 text-sm text-slate-700">Este trimestre es de consulta. <a class="text-school-green underline" href="#/docente/boletin">Ver boletin</a></div>`);
    return;
  }
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
    const root = document.querySelector("[data-teacher-ui]");
    if (root && (context.reemplazoDeUid || context.reemplazadoPorUid)) {
      const notice = document.createElement("p");
      notice.className = "border-b border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900";
      notice.textContent = `Registro habilitado: ${trimestresDeAsignacion(context).map((id) => `${id.slice(1)} trimestre`).join(" y ")}. Otros trimestres: consulta en Boletin.`;
      notice.dataset.teacherReplacementNotice = "";
      root.querySelector("[data-teacher-replacement-notice]")?.remove();
      root.prepend(notice);
    }
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
