import { selectedCourse, sortStudentsByName } from "./ComunDocente.js";
import { emptyState, escapeHtml, refreshIcons, teacherModuleHeading } from "./UtilidadesDocente.js";
import { getTeacherDataCacheMeta, getTeacherSummarySnapshot, refreshTeacherSummarySnapshot } from "../../services/teacherData.js";
import { selectedTrimester, teacherState } from "./EstadoDocente.js";
import { icon } from "../../ui/dom.js";
import { attendanceShort, attendanceTone, normalizarEstadoAsistencia } from "./AcademicoDocente.js";
import { printAttendanceSummaryByMonth } from "./exportResumenAsistencia.js";

const summaryRequests = new WeakMap();

function summaryError(error) {
  if (error?.code === "permission-denied") return "No se pudo consultar la asistencia. Revisa los permisos de tu cuenta.";
  if (error?.code === "unavailable" || error?.code === "deadline-exceeded") return "No se pudo conectar con el servidor. Intenta nuevamente.";
  return "No se pudo actualizar el resumen de asistencia. Intenta nuevamente.";
}

export async function renderSummary(context, { readCache = getTeacherSummarySnapshot, refresh = refreshTeacherSummarySnapshot } = {}) {
  const container = document.querySelector("[data-teacher-summary]");
  const course = selectedCourse(context);
  if (!container) return;
  if (!course) {
    container.innerHTML = emptyState("Sin cursos asignados", "Admin debe asignarte al menos un curso para ver resumen.");
    return;
  }

  const trimesterId = teacherState.trimesterId;
  const trimester = selectedTrimester();
  const request = {};
  summaryRequests.set(container, request);
  const isCurrent = () => summaryRequests.get(container) === request &&
    document.querySelector("[data-teacher-summary]") === container &&
    teacherState.trimesterId === trimesterId && selectedCourse(context)?.id === course.id &&
    (!teacherState.context?.uid || teacherState.context.uid === context.uid);
  let cached = null;
  const reload = () => renderSummary(context, { readCache, refresh });
  const draw = (snapshot, status = {}) => renderSummaryContent(context, course, trimester, snapshot, { ...status, reload });
  draw(null, { loading: true });
  try {
    cached = await readCache(context, course, trimesterId);
    if (!isCurrent()) return;
    if (cached) draw(cached, { loading: true });
    const snapshot = await refresh(context, course, trimesterId);
    if (isCurrent()) draw(snapshot);
  } catch (error) {
    if (isCurrent()) draw(cached, { error: summaryError(error) });
  }
}

function renderSummaryContent(context, course, trimester, snapshot, { loading = false, error = "", reload } = {}) {
  const container = document.querySelector("[data-teacher-summary]");
  if (!container) return;
  const summaryCacheMeta = getTeacherDataCacheMeta(context, "resumen_asistencia", course.id, trimester.id);
  const students = (Array.isArray(snapshot?.students) ? snapshot.students : []).filter((student) => !student.cursoId || student.cursoId === course.id);
  const records = (Array.isArray(snapshot?.records) ? snapshot.records : []).filter((record) => record.cursoId === course.id && record.trimestreId === trimester.id);
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
    const state = normalizarEstadoAsistencia(item.estado);
    byStudent[item.alumnoId][item.fecha] = ["presente", "atraso", "permiso", "falta"].includes(state) ? state : "";
  });

  container.innerHTML = `
    <div class="teacher-module-surface rounded-3xl border border-slate-200 bg-white shadow-soft" aria-busy="${loading}">
      <div class="border-b border-slate-100 p-4 sm:p-5">
        <div class="teacher-module-header flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          ${teacherModuleHeading({
            title: "Resumen de asistencia",
            course: course.nombre,
            trimester: trimester.label,
            detail: `${dates.length} fecha(s) registradas`
          })}
          <div class="flex flex-col gap-3 xl:items-end">
            <div class="flex flex-wrap gap-2 xl:justify-end">
              <button type="button" data-print-summary-attendance ${loading || !records.length ? "disabled" : ""} class="inline-flex items-center justify-center gap-2 rounded-2xl border border-school-green bg-white px-4 py-2 text-sm font-black text-school-green shadow-sm transition hover:bg-green-50 disabled:opacity-50">
                ${icon("printer", "h-4 w-4")} Imprimir
              </button>
              <button type="button" data-refresh-summary-cache ${loading ? "disabled" : ""} class="inline-flex items-center justify-center gap-2 rounded-2xl bg-school-navy px-4 py-2 text-sm font-black text-white shadow-soft transition hover:bg-school-green disabled:opacity-50">
                ${icon("refresh-cw", "h-4 w-4")} ${loading ? "Actualizando..." : error ? "Reintentar" : "Actualizar resumen"}
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
      ${error ? `<p role="alert" class="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">${escapeHtml(error)}${snapshot ? " Se mantiene la copia local anterior." : ""}</p>` : ""}
      ${!snapshot ? `<p role="status" class="px-4 py-6 text-sm text-slate-500">${loading ? "Cargando resumen de asistencia..." : "Resumen no disponible."}</p>` : ""}
      <div class="overflow-x-auto" ${!snapshot ? "hidden" : ""}>
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
                const state = byStudent[student.id]?.[date] || "";
                if (Object.hasOwn(totals, state)) totals[state] += 1;
                return `<td class="px-1 py-1 text-center"><span ${!state ? 'title="Sin registro"' : ""} class="inline-grid h-5 w-5 place-items-center rounded-md border text-[10px] font-semibold ${attendanceTone(state)}">${state ? attendanceShort(state) : "-"}</span></td>`;
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
      reload();
    });
  });

  container.querySelector("[data-refresh-summary-cache]")?.addEventListener("click", reload);
  container.querySelector("[data-print-summary-attendance]")?.addEventListener("click", () => {
    printAttendanceSummaryByMonth({
      course,
      trimesterLabel: trimester.label,
      teacherName: context.profile?.nombre || context.profile?.usuario || "Docente",
      students: studentsByName,
      records
    });
  });
  refreshIcons();
}
