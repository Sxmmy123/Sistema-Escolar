import { compactSubjectName, courseAccent, emptyState, escapeHtml, refreshIcons, setText, subjectIconName, teacherModuleHeading } from "./UtilidadesDocente.js";
import { getTeacherScheduleCacheMeta, getTeacherScheduleRows, refreshTeacherScheduleCache } from "../../services/teacherData.js";
import { DAYS, findSubject, periodsForCourse } from "../../data/catalog.js";
import { teacherState } from "./EstadoDocente.js";
import { activityEvaluationLabel, activityPointsLabel } from "./ComunDocente.js";
import { icon } from "../../ui/dom.js";

export async function renderTeacherSchedule(context) {
  const container = document.querySelector("[data-teacher-schedule]");
  if (!container) return;
  if (!context.courses.length) {
    container.innerHTML = emptyState("Sin horario", "Primero asigna cursos y materias a este docente.");
    return;
  }

  const rows = await getTeacherScheduleRows(context);
  const rowsBySlot = {};
  rows.forEach((row) => {
    const key = `${row.periodo}|${row.hora}|${row.diaId}`;
    rowsBySlot[key] ||= [];
    rowsBySlot[key].push(row);
  });
  const periodMap = new Map();
  context.courses.forEach((course) => {
    periodsForCourse(course.id)
      .filter((period) => !period.recreo)
      .forEach((period) => periodMap.set(`${period.label}|${period.hora}`, period));
  });
  const periods = [...periodMap.values()].sort((a, b) => String(a.hora || "").localeCompare(String(b.hora || "")) || String(a.label || "").localeCompare(String(b.label || "")));
  const subjectIds = [...new Set(context.courses.flatMap((course) => course.materias || []))];
  const showCourseColors = context.courses.length >= 2;
  const scheduleCache = getTeacherScheduleCacheMeta(context);
  function compactGradeActivityButton(item, widthClass = "") {
    const subject = findSubject(item.materiaId);
    const courseItem = coursesById[item.cursoId] || {};
    const courseNumber = String(courseItem.corto || courseItem.nombre || "").replace(/\D/g, "") || "I";
    const accent = showCourse ? courseAccent(item.cursoId) : (subject?.color || "#e2e8f0");
    const background = showCourse ? "#ffffff" : (subject?.color || "#f8fafc");
    const active = item.id === teacherState.gradeModalActivityId;
    return `
      <button type="button" data-grade-activity="${item.id}" class="group flex min-h-10 ${widthClass} items-stretch overflow-hidden rounded-lg border bg-white text-left transition hover:-translate-y-0.5 hover:shadow-soft ${active ? "ring-2 ring-school-green/15" : ""}" style="border-color:${accent}; background:${background}">
        <span class="min-w-0 flex-1 px-2.5 py-1.5">
          <span class="block truncate text-[12px] font-medium leading-tight text-slate-900">${showCourse ? `${escapeHtml(courseItem.corto || courseItem.nombre || item.cursoId)} · ` : ""}${escapeHtml(item.titulo || "Sin titulo")}</span>
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${activityEvaluationLabel(item)} · ${activityPointsLabel(item)}</span>
        </span>
        ${showCourse ? `<span class="grid w-7 shrink-0 place-items-center text-xs font-semibold text-white" style="background:${accent}">${escapeHtml(courseNumber)}</span>` : ""}
      </button>
    `;
  }

  function compactGradeDateCard(dateKey) {
    const dayActivities = activities.filter((item) => (item.fecha || gradeDate) === dateKey);
    if (!dayActivities.length) return "";
    const label = planningDayLabel(dateKey);
    return `
      <article class="min-w-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div class="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-wide text-school-green">${escapeHtml(label.day)}</p>
            <p class="text-[11px] font-medium text-slate-500">${escapeHtml(label.date)}</p>
          </div>
          <span class="rounded-full bg-school-sky px-2 py-0.5 text-[10px] font-semibold text-school-green">${dayActivities.length}</span>
        </div>
        <div class="grid gap-1.5">
          ${dayActivities.map((item) => compactGradeActivityButton(item)).join("")}
        </div>
      </article>
    `;
  }
  container.innerHTML = `
    <div class="teacher-module-surface rounded-3xl border border-slate-200 bg-white shadow-soft">
      <div class="border-b border-slate-100 p-4">
        <div class="teacher-module-header flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          ${teacherModuleHeading({
            title: "Horario semanal",
            course: context.courses.length === 1 ? context.courses[0].nombre : `${context.courses.length} cursos asignados`,
            trimester: "Horario general",
            detail: scheduleCache ? `Copia local: ${scheduleCache.label}` : "Sin copia local"
          })}
          <div class="flex flex-col gap-2 lg:max-w-xl lg:items-end">
            <button type="button" data-refresh-teacher-schedule class="inline-flex items-center justify-center gap-2 rounded-2xl bg-school-navy px-4 py-2 text-sm font-black text-white shadow-soft transition hover:bg-school-green">
              ${icon("cloud-download", "h-4 w-4")} Cargar horario
            </button>
            <div class="${showCourseColors ? "flex" : "hidden"} flex-wrap gap-2 lg:justify-end">
              ${context.courses.map((courseItem) => {
                const courseNumber = String(courseItem.corto || courseItem.nombre || "").replace(/\D/g, "") || "I";
                return `
                  <span class="inline-flex items-center overflow-hidden rounded-full border border-slate-200 bg-white text-xs font-black text-slate-700 shadow-sm">
                    <span class="px-2 py-1 text-white" style="background:${courseAccent(courseItem.id)}">${escapeHtml(courseNumber)}</span>
                    <span class="px-2 py-1">${escapeHtml(courseItem.corto || courseItem.nombre)}</span>
                  </span>
                `;
              }).join("")}
            </div>
            <div class="flex flex-wrap gap-1.5 lg:justify-end">
              ${subjectIds.map((subjectId) => {
                const subject = findSubject(subjectId);
                return `<span class="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-black text-slate-700" style="background:${subject?.color || "#f8fafc"}">${escapeHtml(subject?.corto || subject?.nombre || subjectId)}</span>`;
              }).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="overflow-x-auto p-3">
        <table class="${showCourseColors ? "min-w-[680px]" : "min-w-[620px]"} w-full overflow-hidden rounded-2xl border border-slate-200 text-xs">
          <thead class="bg-school-navy text-white">
            <tr>
              <th class="w-10 px-2 py-2.5 text-center font-black">Per.</th>
              <th class="w-24 px-2 py-2.5 text-left font-black">Hora</th>
              ${DAYS.map((day) => `<th class="px-2 py-2.5 text-center font-black">${escapeHtml(day.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${periods.map((period) => {
              return `
                <tr class="align-top">
                  <td class="bg-school-sky/50 px-2 py-1.5 text-center font-black text-school-navy">${escapeHtml(period.label)}</td>
                  <td class="bg-school-sky/30 px-2 py-1.5 text-[11px] font-black text-slate-500">${escapeHtml(period.hora)}</td>
                  ${DAYS.map((day) => {
                    const cellRows = rowsBySlot[`${period.label}|${period.hora}|${day.id}`] || [];
                    return `<td class="min-w-24 px-1.5 py-1.5 text-center sm:min-w-32">
                      ${cellRows.length ? `
                        <div class="space-y-1">
                          ${cellRows.map((row) => {
                            const rowCourse = context.courses.find((item) => item.id === row.cursoId) || {};
                            const accent = courseAccent(row.cursoId);
                            const courseNumber = String(rowCourse.corto || rowCourse.nombre || "").replace(/\D/g, "") || "I";
                            const subjectIcon = subjectIconName(row.materiaId, row.materia);
                            return showCourseColors ? `
                              <div class="flex min-h-12 items-center gap-2 overflow-hidden rounded-2xl border border-black/5 px-2 py-2 text-left shadow-sm sm:min-h-14 sm:gap-3 sm:px-3" style="background:${row.color || "#fff"}" title="${escapeHtml(row.materia)} · ${escapeHtml(row.curso)}">
                                <span class="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/55 text-school-green sm:h-9 sm:w-9">${icon(subjectIcon, "h-4 w-4 sm:h-5 sm:w-5")}</span>
                                <span class="min-w-0 flex-1">
                                  <span class="block truncate text-[12px] font-black leading-tight text-school-bark sm:hidden">${escapeHtml(compactSubjectName(row.materiaId, row.materia))}</span>
                                  <span class="hidden truncate text-sm font-black leading-tight text-school-bark sm:block lg:text-base">${escapeHtml(row.materia)}</span>
                                </span>
                                <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg font-black leading-none text-white shadow-sm sm:h-11 sm:w-11 sm:rounded-2xl sm:text-2xl" style="background:${accent}">${escapeHtml(courseNumber)}</span>
                              </div>
                            ` : `
                              <div class="flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl border border-slate-200 px-2 py-2 text-center shadow-sm sm:min-h-14 sm:px-3" style="background:${row.color}" title="${escapeHtml(row.materia)}">
                                <span class="shrink-0 text-school-green">${icon(subjectIcon, "h-4 w-4")}</span>
                                <p class="truncate text-xs font-black leading-tight text-slate-900 sm:hidden">${escapeHtml(compactSubjectName(row.materiaId, row.materia))}</p>
                                <p class="hidden truncate text-sm font-black leading-tight text-slate-900 sm:block">${escapeHtml(row.materia)}</p>
                              </div>
                            `;
                          }).join("")}
                        </div>
                      ` : `<div class="min-h-8 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-300">--</div>`}
                    </td>`;
                  }).join("")}
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
        ${!rows.length ? `<p class="mt-4 rounded-2xl bg-yellow-50 px-4 py-3 text-sm font-black text-yellow-800">${scheduleCache ? "No hay materias de este docente registradas en el horario." : "Presiona Cargar horario para descargar tu horario y guardarlo en este dispositivo."}</p>` : ""}
      </div>
    </div>
  `;
  container.querySelector("[data-refresh-teacher-schedule]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = `${icon("loader-2", "h-4 w-4 animate-spin")} Cargando`;
    refreshIcons();
    try {
      await refreshTeacherScheduleCache(context);
      setText("[data-teacher-page-status]", "Horario cargado");
      await renderTeacherSchedule(context);
    } catch (error) {
      console.error("No se pudo cargar horario", error);
      alert("No se pudo cargar el horario. Revisa la conexion e intenta nuevamente.");
      button.disabled = false;
      button.innerHTML = `${icon("cloud-download", "h-4 w-4")} Cargar horario`;
      refreshIcons();
    }
  });
  refreshIcons();
}
