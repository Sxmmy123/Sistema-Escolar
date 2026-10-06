import { activityEvaluationLabel, activityPointsLabel, selectedCourse, sortStudentsByName } from "./ComunDocente.js";
import { courseAccent, emptyState, escapeHtml, refreshIcons, teacherModuleHeading } from "./UtilidadesDocente.js";
import { getTeacherDataCacheMeta, getTeacherSummarySnapshot, refreshTeacherSummarySnapshot } from "../../services/teacherData.js";
import { selectedTrimester, teacherState } from "./EstadoDocente.js";
import { findSubject } from "../../data/catalog.js";
import { icon } from "../../ui/dom.js";
import { attendanceShort, attendanceTone, normalizarEstadoAsistencia } from "./AcademicoDocente.js";
import { printAttendanceSummaryByMonth } from "./exportResumenAsistencia.js";

export async function renderSummary(context) {
  const container = document.querySelector("[data-teacher-summary]");
  const course = selectedCourse(context);
  if (!container) return;
  if (!course) {
    container.innerHTML = emptyState("Sin cursos asignados", "Admin debe asignarte al menos un curso para ver resumen.");
    return;
  }

  const summaryCacheMeta = getTeacherDataCacheMeta(context, "resumen_asistencia", course.id, teacherState.trimesterId);
  const summarySnapshot = await getTeacherSummarySnapshot(context, course, teacherState.trimesterId);
  if (!summarySnapshot) {
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
      <div class="teacher-module-surface rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:rounded-3xl sm:p-5">
        ${teacherModuleHeading({
          title: "Resumen de asistencia",
          course: course.nombre,
          trimester: selectedTrimester().label,
          detail: "Sin copia local"
        })}
        <p class="mt-3 max-w-2xl text-sm font-normal text-slate-500">Para ahorrar lecturas, el resumen se carga manualmente y luego queda guardado en este dispositivo.</p>
        <button type="button" data-refresh-summary-cache class="mt-4 inline-flex items-center gap-2 rounded-2xl bg-school-navy px-4 py-3 text-sm font-black text-white shadow-soft transition hover:bg-school-green">
          ${icon("cloud-download", "h-4 w-4")} Cargar resumen
        </button>
      </div>
    `;

    container.querySelector("[data-refresh-summary-cache]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Cargando resumen...";
      await refreshTeacherSummarySnapshot(context, course, teacherState.trimesterId);
      await renderSummary(context);
    });
    refreshIcons();
    return;
  }
  const { students = [], records = [] } = summarySnapshot;
  const studentsByName = sortStudentsByName(students);
  const dates = [...new Set(records.map((item) => item.fecha))].sort();
  const monthGroups = dates.reduce((groups, date) => {
    const key = String(date || "").slice(0, 7);
    if (!key) return groups;
    const label = new Date(`${date}T12:00:00`).toLocaleDateString("es-BO", { month: "long" });
    const current = groups.find((item) => item.key === key);
    if (current) current.dates.push(date);
    else groups.push({ key, label, dates: [date] });
    return groups;
  }, []);
  const byStudent = {};
  records.forEach((item) => {
    byStudent[item.alumnoId] ||= {};
    byStudent[item.alumnoId][item.fecha] = normalizarEstadoAsistencia(item.estado);
  });

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
      <div class="border-b border-slate-100 p-4 sm:p-5">
        <div class="teacher-module-header flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          ${teacherModuleHeading({
            title: "Resumen de asistencia",
            course: course.nombre,
            trimester: selectedTrimester().label,
            detail: `${dates.length} fecha(s) registradas`
          })}
          <div class="flex flex-col gap-3 xl:items-end">
            <div class="flex flex-wrap gap-2 xl:justify-end">
              <button type="button" data-print-summary-attendance class="inline-flex items-center justify-center gap-2 rounded-2xl border border-school-green bg-white px-4 py-2 text-sm font-black text-school-green shadow-sm transition hover:bg-green-50">
                ${icon("printer", "h-4 w-4")} Imprimir
              </button>
              <button type="button" data-refresh-summary-cache class="inline-flex items-center justify-center gap-2 rounded-2xl bg-school-navy px-4 py-2 text-sm font-black text-white shadow-soft transition hover:bg-school-green">
                ${icon("refresh-cw", "h-4 w-4")} Actualizar resumen
              </button>
            </div>
            <div class="rounded-2xl bg-school-sky px-4 py-2 text-xs font-black text-school-navy">
              ${summaryCacheMeta ? `Copia local: ${escapeHtml(summaryCacheMeta.label)}` : "Sin copia local"}
            </div>
            <div class="${context.courses.length > 1 ? "flex" : "hidden"} max-w-full gap-2 overflow-x-auto pb-1">
              ${context.courses.map((item) => `
                <button type="button" data-summary-course="${item.id}" class="shrink-0 rounded-2xl border px-4 py-2 text-sm font-black transition ${item.id === course.id ? "border-school-navy bg-school-green text-white shadow-soft" : "border-slate-200 bg-white text-slate-600 hover:border-school-navy/40"}">${escapeHtml(item.corto || item.nombre)}</button>
              `).join("")}
            </div>

          </div>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-xs">
          <thead class="bg-school-navy text-white">
            <tr>
              <th rowspan="2" class="sticky left-0 z-20 bg-school-navy px-3 py-3 text-center">No.</th>
              <th rowspan="2" class="sticky left-11 z-20 min-w-56 bg-school-navy px-3 py-3">Alumno</th>
              ${monthGroups.map((group) => `<th colspan="${group.dates.length}" class="border-l border-white/20 px-3 py-2 text-center capitalize">${escapeHtml(group.label)}</th>`).join("") || `<th rowspan="2" class="px-4 py-3 text-center text-white/80">Sin fechas</th>`}
              <th colspan="4" class="border-l border-white/20 px-3 py-2 text-center">Totales</th>
            </tr>
            <tr>
              ${dates.map((date) => `<th class="min-w-7 border-l border-white/10 px-1 py-2 text-center">${escapeHtml(String(date).slice(8, 10))}</th>`).join("")}
              <th class="w-7 border-l border-white/20 px-1 py-2 text-center">P</th>
              <th class="w-7 px-1 py-2 text-center">A</th>
              <th class="w-7 px-1 py-2 text-center">L</th>
              <th class="w-7 px-1 py-2 text-center">F</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${studentsByName.map((student, index) => {
              const totals = { presente: 0, atraso: 0, permiso: 0, falta: 0 };
              const cells = dates.map((date) => {
                const state = byStudent[student.id]?.[date] || "falta";
                totals[state] = (totals[state] || 0) + 1;
                return `<td class="px-1 py-1 text-center"><span class="inline-grid h-5 w-5 place-items-center rounded-md border text-[10px] font-semibold ${attendanceTone(state)}">${attendanceShort(state)}</span></td>`;
              }).join("");
               return `<tr data-teacher-alert-student="${student.id}" class="hover:bg-school-sky/40"><td class="sticky left-0 z-10 bg-white px-3 py-2 text-center font-black">${index + 1}</td><td class="sticky left-11 z-10 min-w-56 bg-white px-3 py-2 font-semibold text-slate-800">${escapeHtml(student.nombre)}</td>${dates.length ? cells : `<td class="px-4 py-3 text-center font-bold text-slate-400">-</td>`}<td class="w-7 px-1 py-1 text-center font-semibold">${totals.presente}</td><td class="w-7 px-1 py-1 text-center font-semibold">${totals.atraso}</td><td class="w-7 px-1 py-1 text-center font-semibold">${totals.permiso}</td><td class="w-7 px-1 py-1 text-center font-semibold">${totals.falta}</td></tr>`;
            }).join("") || `<tr><td colspan="${dates.length + 6}" class="px-4 py-5 font-bold text-slate-500">Sin alumnos.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-summary-course]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.selectedCourseId = button.dataset.summaryCourse;
      sessionStorage.setItem("docenteCursoId", teacherState.selectedCourseId);
      renderSummary(context);
    });
  });

  container.querySelector("[data-refresh-summary-cache]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Actualizando...";
    await refreshTeacherSummarySnapshot(context, course, teacherState.trimesterId);
    await renderSummary(context);
  });
  container.querySelector("[data-print-summary-attendance]")?.addEventListener("click", () => {
    printAttendanceSummaryByMonth({
      course,
      trimesterLabel: selectedTrimester().label,
      teacherName: context.profile?.nombre || context.profile?.usuario || "Docente",
      students: studentsByName,
      records
    });
  });
  refreshIcons();
}
