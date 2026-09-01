import { DAYS, findSubject, periodsForCourse } from "../../data/catalog.js";
import { icon } from "../../ui/dom.js";
import { renderBulletin } from "./BoletinDocente.js";
import { exportNotesToExcel } from "./exportNotasExcel.js";
import { openTeacherNotesPrintModal } from "./imprimirNotasDocente.js";
import { printAttendanceSummaryByMonth } from "./exportResumenAsistencia.js";
import { renderDashboard } from "./PanelDocente.js";
import {
  loadSavedTrimester,
  persistActiveTrimester,
  selectedTrimester,
  setActiveTrimester,
  teacherState
} from "./EstadoDocente.js";
import {
  activityTone,
  compactSubjectName,
  courseAccent,
  courseSubjectsBadges,
  dayIdFromIso,
  emptyState,
  escapeHtml,
  longDateLabel,
  monthLabel,
  nextScheduleDates,
  refreshIcons,
  scheduleList,
  setHtml,
  setText,
  shiftMonth,
  shortDateLabel,
  subjectIconName,
  workingDaysCalendar
} from "./UtilidadesDocente.js";
import {
  activityHasGrades,
  attendanceByStudentAndDate,
  attendanceLabel,
  attendanceScore,
  attendanceShort,
  attendanceStateForDate,
  attendanceStates,
  attendanceTone,
  calculateStudentTerm,
  gradeByActivityAndStudent,
  gradeNumber,
  gradeTone,
  isSaberActivity,
  optionalStudentActivityGrade,
  studentActivityGrade
} from "./AcademicoDocente.js";
import {
  TRIMESTERS,
  deleteActivity,
  getTeacherContext,
  getTeacherDataCacheMeta,
  getTeacherNotesSnapshot,
  getTeacherScheduleCacheMeta,
  getTeacherScheduleRows,
  getTeacherSummarySnapshot,
  getTeacherStudents,
  listActivities,
  listAttendanceForCourse,
  listAttendanceForCourseDate,
  listGradesForCourse,
  listGradesForActivity,
  normalizeGrade,
  refreshTeacherScheduleCache,
  refreshTeacherNotesSnapshot,
  refreshTeacherSummarySnapshot,
  saveActivity,
  saveAttendance,
  saveGrade,
  saveInternalActivity,
  todayIso,
  updateActivity,
  upsertTeacherNotesSnapshotActivity,
  upsertTeacherNotesSnapshotGrade,
  removeTeacherNotesSnapshotActivity
} from "../../services/teacherData.js";



let regularizationSearchTimer = null;

function sortStudentsByName(students = []) {
  return [...students].sort((a, b) => {
    const nameOrder = String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" });
    return nameOrder || Number(a.numeroLista || 9999) - Number(b.numeroLista || 9999);
  });
}

function selectedCourse(context = teacherState.context) {
  return context?.courses?.find((course) => course.id === teacherState.selectedCourseId) || context?.courses?.[0] || null;
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

function guidedAttendanceModal(course, students, attendanceMap) {
  const guidedStudent = students[teacherState.guidedIndex] || null;
  const guidedState = guidedStudent ? (attendanceMap[guidedStudent.id]?.estado || "falta") : "falta";
  return `
    <div class="fixed inset-0 z-50 ${teacherState.attendanceMode === "guia" ? "flex" : "hidden"} items-start justify-center overflow-y-auto bg-slate-950/60 px-4 pb-4" style="padding-top:${Math.max(16, teacherState.guidedModalTop)}px" data-guided-modal>
      <section class="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div class="bg-school-navy px-5 py-4 text-white">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-xs font-black uppercase tracking-[.18em] text-white/70">${escapeHtml(course.nombre)} · ${escapeHtml(selectedTrimester().label)}</p>
              <h3 class="mt-1 text-2xl font-black">Modo guía</h3>
            </div>
            <button type="button" class="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white hover:bg-white/20" data-guided-close aria-label="Cerrar">${icon("x", "h-5 w-5")}</button>
          </div>
        </div>
        ${guidedStudent ? `
          <div class="p-5">
            <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-center">
              <p class="text-xs font-black uppercase tracking-[.18em] text-slate-400">Alumno ${teacherState.guidedIndex + 1} de ${students.length}</p>
              <div class="mx-auto mt-3 grid h-16 w-16 place-items-center rounded-2xl bg-school-sky text-2xl font-black text-school-navy">${teacherState.guidedIndex + 1}</div>
              <h4 class="mt-4 text-2xl font-black text-slate-900">${escapeHtml(guidedStudent.nombre)}</h4>
              <p class="mt-2 text-sm font-black text-slate-500">Actual: ${attendanceLabel(guidedState)} (${attendanceShort(guidedState)})</p>
            </div>

            <div class="mt-5 grid grid-cols-2 gap-3">
              ${attendanceStates.map((state) => `
                <button type="button" data-guided-state="${state.id}" data-student-id="${guidedStudent.id}" class="aspect-[1.35] rounded-3xl border-2 p-4 text-center font-black transition hover:-translate-y-1 hover:shadow-soft ${guidedState === state.id ? `${state.tone} border-school-navy ring-4 ring-school-navy/10` : `${state.tone} border-transparent`}">
                  <span class="block text-4xl">${state.short}</span>
                  <span class="mt-2 block text-base">${state.label}</span>
                </button>
              `).join("")}
            </div>

            <div class="mt-5 flex items-center gap-3">
              <button type="button" data-guided-prev class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-school-navy">${icon("chevron-left", "mr-1 inline h-4 w-4")}Anterior</button>
              <div class="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div class="h-full rounded-full bg-school-navy transition-all" style="width:${students.length ? Math.round(((teacherState.guidedIndex + 1) / students.length) * 100) : 0}%"></div>
              </div>
              <button type="button" data-guided-next class="rounded-2xl bg-school-navy px-4 py-3 text-sm font-black text-white">Siguiente${icon("chevron-right", "ml-1 inline h-4 w-4")}</button>
            </div>
          </div>
        ` : `<div class="p-5">${emptyState("Sin alumnos", "No hay alumnos activos en este curso.")}</div>`}
      </section>
    </div>
  `;
}

async function renderAttendance(context) {
  const container = document.querySelector("[data-teacher-attendance]");
  if (!container) return;
  if (!context.courses.length) {
    container.innerHTML = emptyState("Sin cursos asignados", "Admin debe asignarte al menos un curso antes de tomar asistencia.");
    return;
  }

  const attendanceDayId = dayIdFromIso(teacherState.attendanceDate);
  let attendanceCourses = context.courses;
  if (context.courses.length > 1) {
    if (!attendanceDayId) {
      attendanceCourses = [];
    } else {
      try {
        const scheduleCache = getTeacherScheduleCacheMeta(context);
        const rowsForDay = await getTeacherScheduleRows(context, attendanceDayId, { cacheOnly: true });
        const courseIdsForDay = [...new Set(rowsForDay.map((row) => row.cursoId).filter(Boolean))];
        attendanceCourses = courseIdsForDay.length
          ? context.courses.filter((item) => courseIdsForDay.includes(item.id))
          : (scheduleCache ? [] : context.courses);
      } catch (error) {
        console.warn("No se pudo filtrar asistencia por horario", error);
        attendanceCourses = context.courses;
      }
    }
  }

  if (attendanceCourses.length && !attendanceCourses.some((item) => item.id === teacherState.selectedCourseId)) {
    teacherState.selectedCourseId = attendanceCourses[0].id;
    sessionStorage.setItem("docenteCursoId", teacherState.selectedCourseId);
  }

  const course = attendanceCourses.find((item) => item.id === teacherState.selectedCourseId) || attendanceCourses[0] || null;
  if (!course) {
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
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
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
      <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-xs font-black uppercase tracking-[.18em] text-school-navy">Asistencia</p>
            <h2 class="mt-1 text-xl font-black text-slate-900">Sin clases en esta fecha</h2>
            <p class="mt-1 text-sm font-bold text-slate-500">Segun el horario, no tienes cursos para tomar asistencia este dia.</p>
          </div>
          <label class="text-sm font-black text-slate-700">Fecha
            <input class="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 font-semibold" type="date" value="${teacherState.attendanceDate}" data-attendance-date>
          </label>
        </div>
      </div>
    `;
    container.querySelector("[data-attendance-date]")?.addEventListener("change", (event) => {
      teacherState.attendanceDate = event.target.value || todayIso();
      teacherState.guidedIndex = 0;
      teacherState.attendanceModalStudentId = "";
      renderAttendance(context);
    });
    refreshIcons();
    return;
  }

  const [studentsRaw, attendanceMap] = await Promise.all([
    getTeacherStudents(course.id),
    listAttendanceForCourseDate(course.id, teacherState.attendanceDate, teacherState.trimesterId)
  ]);
  const students = sortStudentsByName(studentsRaw);

  const totals = attendanceStates.reduce((acc, state) => ({ ...acc, [state.id]: 0 }), {});
  students.forEach((student) => {
    const estado = attendanceMap[student.id]?.estado || "falta";
    totals[estado] = (totals[estado] || 0) + 1;
  });
  if (teacherState.guidedIndex >= students.length) teacherState.guidedIndex = Math.max(students.length - 1, 0);
  if (!students.some((student) => student.id === teacherState.selectedAttendanceStudentId)) teacherState.selectedAttendanceStudentId = "";
  if (!students.some((student) => student.id === teacherState.attendanceModalStudentId)) teacherState.attendanceModalStudentId = "";
  const guidedStudent = students[teacherState.guidedIndex] || null;
  const guidedState = guidedStudent ? (attendanceMap[guidedStudent.id]?.estado || "falta") : "falta";
  const listMode = teacherState.attendanceMode === "lista";
  const modalStudent = students.find((student) => student.id === teacherState.attendanceModalStudentId) || null;
  const modalRecord = modalStudent ? (attendanceMap[modalStudent.id] || {}) : {};
  const modalState = modalRecord.estado || "falta";
  const canSwitchAttendanceCourse = attendanceCourses.length > 1;
  const otherCourses = attendanceCourses.filter((item) => item.id !== course.id);

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
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
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
    <div class="rounded-3xl border border-slate-200 bg-white shadow-soft">
      <div class="flex flex-col gap-4 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="min-w-0">
          <p class="text-xs font-black uppercase tracking-[.18em] text-school-navy">Asistencia del curso</p>
          <div class="relative mt-1 inline-flex max-w-full items-center gap-2">
            ${canSwitchAttendanceCourse ? `
              <button type="button" data-attendance-course-toggle class="inline-flex max-w-full items-center gap-2 rounded-2xl border border-school-navy/20 bg-school-sky px-4 py-2 text-xl font-black text-school-navy shadow-sm transition hover:border-school-navy/50">
                <span class="truncate">${escapeHtml(course.nombre)}</span>
                ${icon(teacherState.attendanceCoursePickerOpen ? "chevron-left" : "chevron-right", "h-5 w-5 shrink-0")}
              </button>
              <div class="${teacherState.attendanceCoursePickerOpen ? "flex" : "hidden"} absolute left-0 top-full z-30 mt-2 max-w-[calc(100vw-2rem)] gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl sm:left-full sm:top-0 sm:ml-2 sm:mt-0">
                ${otherCourses.map((item) => `
                  <button type="button" data-attendance-course-pick="${item.id}" class="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 transition hover:border-school-navy hover:bg-school-sky">${escapeHtml(item.corto || item.nombre)}</button>
                `).join("")}
              </div>
            ` : `
              <div class="inline-flex max-w-full items-center gap-2 rounded-2xl border border-school-navy/20 bg-school-sky px-4 py-2 text-xl font-black text-school-navy shadow-sm">
                <span class="truncate">${escapeHtml(course.nombre)}</span>
              </div>
            `}
          </div>
          <p class="mt-1 text-sm font-bold text-slate-500">${escapeHtml(selectedTrimester().label)} · ${students.length} alumnos</p>
        </div>
        <div class="grid gap-3 sm:grid-cols-[auto_auto] sm:items-end">
          <label class="text-sm font-black text-slate-700">Fecha
            <input class="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 font-semibold" type="date" value="${teacherState.attendanceDate}" data-attendance-date>
          </label>
          <div>
            <p class="text-sm font-black text-slate-700">Modo</p>
            <div class="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button type="button" data-attendance-mode="lista" class="rounded-xl px-4 py-2 text-sm font-black transition ${listMode ? "bg-school-green text-white shadow-soft" : "text-slate-600"}">${icon("list", "mr-1 inline h-4 w-4")}Lista</button>
              <button type="button" data-attendance-mode="guia" class="rounded-xl px-4 py-2 text-sm font-black transition ${!listMode ? "bg-school-green text-white shadow-soft" : "text-slate-600"}">${icon("user-check", "mr-1 inline h-4 w-4")}Guía</button>
            </div>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5 px-4 py-3">
        ${attendanceStates.map((state) => `<span class="rounded-full border px-2.5 py-1 text-[11px] font-black sm:text-xs ${state.tone}">${state.label}: ${totals[state.id] || 0}</span>`).join("")}
      </div>
      <div class="space-y-1 p-2.5 pt-0">
        ${students.map((student, index) => {
          const record = attendanceMap[student.id] || {};
          const estado = record.estado || "falta";
          return `
            <article class="overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-school-navy/40 hover:shadow-soft" data-attendance-card="${student.id}">
              <button type="button" class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left" data-attendance-open="${student.id}">
                <span class="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-school-sky text-xs font-black text-school-navy">${index + 1}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold text-slate-900 sm:text-[15px]">${escapeHtml(student.nombre)}</span>
                </span>
                <span class="rounded-full border px-3 py-1.5 text-xs font-black ${attendanceTone(estado)}">${attendanceLabel(estado)}</span>
                <span class="text-school-navy">${icon("chevron-right", "h-4 w-4")}</span>
              </button>
              ${teacherState.attendanceModalStudentId === student.id ? `
                <div class="border-t border-slate-100 bg-slate-50/80 p-3" data-attendance-inline-modal>
                  <div class="mb-2 flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-bold text-slate-900">${escapeHtml(student.nombre)}</p>
                    </div>
                    <button type="button" class="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500" data-attendance-modal-close>${icon("x", "h-4 w-4")}</button>
                  </div>
                  <div class="grid grid-cols-4 gap-2">
                    ${attendanceStates.map((state) => {
                      const stateIcon = { presente: "check-circle-2", atraso: "clock-3", permiso: "file-text", falta: "x-circle" }[state.id] || "circle";
                      return `
                        <button type="button" data-attendance-state="${state.id}" data-student-id="${student.id}" class="min-h-16 rounded-2xl border-2 px-1 py-2 text-center font-black transition hover:-translate-y-0.5 hover:shadow-soft ${estado === state.id ? `${state.tone} border-school-navy ring-4 ring-school-navy/10` : `${state.tone} border-transparent`}">
                          <span class="mx-auto grid h-7 w-7 place-items-center rounded-full bg-white/70">${icon(stateIcon, "h-4 w-4")}</span>
                          <span class="mt-1.5 block text-[10px] uppercase leading-tight">${state.label}</span>
                        </button>
                      `;
                    }).join("")}
                  </div>
                  <label class="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500">
                    ${icon("message-square", "h-4 w-4 text-slate-400")}
                    <input class="w-full bg-transparent outline-none" data-attendance-observation="${student.id}" value="${escapeHtml(record.observacion || "")}" placeholder="Observacion (opcional)...">
                  </label>
                  <div class="mt-2 hidden text-right text-sm font-black text-green-700" data-attendance-saved="${student.id}">${icon("check", "mr-1 inline h-4 w-4")}Guardado</div>
                </div>
              ` : ""}
            </article>
          `;
        }).join("") || emptyState("Sin alumnos", "No hay alumnos activos en este curso.")}
      </div>
      <div class="hidden" data-attendance-modal></div>
      ${guidedAttendanceModal(course, students, attendanceMap)}
    </div>
  `;

  container.querySelector("[data-attendance-date]")?.addEventListener("change", (event) => {
    teacherState.attendanceDate = event.target.value || todayIso();
    teacherState.guidedIndex = 0;
    teacherState.attendanceModalStudentId = "";
    teacherState.attendanceCoursePickerOpen = false;
    renderAttendance(context);
  });

  container.querySelector("[data-attendance-course-toggle]")?.addEventListener("click", () => {
    teacherState.attendanceCoursePickerOpen = !teacherState.attendanceCoursePickerOpen;
    renderAttendance(context);
  });
  container.querySelectorAll("[data-attendance-course-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.selectedCourseId = button.dataset.attendanceCoursePick;
      teacherState.selectedAttendanceStudentId = "";
      teacherState.attendanceModalStudentId = "";
      teacherState.guidedIndex = 0;
      teacherState.attendanceCoursePickerOpen = false;
      sessionStorage.setItem("docenteCursoId", teacherState.selectedCourseId);
      renderAttendance(context);
    });
  });

  container.querySelectorAll("[data-attendance-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.attendanceMode === "guia") {
        const rect = button.getBoundingClientRect();
        teacherState.guidedModalTop = Math.max(16, Math.round(rect.top));
      }
      teacherState.attendanceMode = button.dataset.attendanceMode;
      if (teacherState.attendanceMode === "guia") teacherState.guidedIndex = Math.min(teacherState.guidedIndex, Math.max(students.length - 1, 0));
      sessionStorage.setItem("docenteAsistenciaModo", teacherState.attendanceMode);
      renderAttendance(context);
    });
  });
  container.querySelector("[data-guided-close]")?.addEventListener("click", () => {
    teacherState.attendanceMode = "lista";
    sessionStorage.setItem("docenteAsistenciaModo", "lista");
    renderAttendance(context);
  });
  container.querySelector("[data-guided-modal]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-guided-modal]")) {
      teacherState.attendanceMode = "lista";
      sessionStorage.setItem("docenteAsistenciaModo", "lista");
      renderAttendance(context);
    }
  });

  container.querySelectorAll("[data-attendance-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const rect = button.getBoundingClientRect();
      teacherState.attendanceModalTop = Math.max(16, Math.round(rect.top));
      teacherState.selectedAttendanceStudentId = button.dataset.attendanceOpen;
      teacherState.attendanceModalStudentId = button.dataset.attendanceOpen;
      renderAttendance(context);
    });
  });
  container.querySelector("[data-attendance-modal-close]")?.addEventListener("click", () => {
    teacherState.attendanceModalStudentId = "";
    renderAttendance(context);
  });
  container.querySelector("[data-attendance-modal]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-attendance-modal]")) {
      teacherState.attendanceModalStudentId = "";
      renderAttendance(context);
    }
  });

  container.querySelectorAll("[data-attendance-state]").forEach((button) => {
    button.addEventListener("click", async () => {
      const student = students.find((item) => item.id === button.dataset.studentId);
      if (!student) return;
      teacherState.selectedAttendanceStudentId = student.id;
      const observation = container.querySelector(`[data-attendance-observation="${student.id}"]`)?.value || "";
      button.disabled = true;
      try {
        await saveAttendance({ course, student, fecha: teacherState.attendanceDate, estado: button.dataset.attendanceState, trimestreId: teacherState.trimesterId, observacion: observation });
        const saved = container.querySelector(`[data-attendance-saved="${student.id}"]`);
        if (saved) {
          saved.classList.remove("hidden");
          setTimeout(() => saved.classList.add("hidden"), 1200);
        }
        teacherState.attendanceModalStudentId = "";
        await renderAttendance(context);
      } catch (error) {
        alert(error?.code === "permission-denied" ? "Sin permiso para guardar asistencia." : `No se pudo guardar: ${error.message}`);
        button.disabled = false;
      }
    });
  });
  container.querySelector("[data-guided-prev]")?.addEventListener("click", () => {
    teacherState.guidedIndex = Math.max(teacherState.guidedIndex - 1, 0);
    renderAttendance(context);
  });
  container.querySelector("[data-guided-next]")?.addEventListener("click", () => {
    teacherState.guidedIndex = Math.min(teacherState.guidedIndex + 1, Math.max(students.length - 1, 0));
    renderAttendance(context);
  });
  container.querySelectorAll("[data-guided-state]").forEach((button) => {
    button.addEventListener("click", async () => {
      const student = students.find((item) => item.id === button.dataset.studentId);
      if (!student) return;
      button.disabled = true;
      try {
        await saveAttendance({ course, student, fecha: teacherState.attendanceDate, estado: button.dataset.guidedState, trimestreId: teacherState.trimesterId });
        const isLastStudent = teacherState.guidedIndex >= students.length - 1;
        if (isLastStudent) {
          teacherState.guidedIndex = 0;
          teacherState.attendanceMode = "lista";
          sessionStorage.setItem("docenteAsistenciaModo", "lista");
        } else {
          teacherState.guidedIndex = teacherState.guidedIndex + 1;
        }
        await renderAttendance(context);
      } catch (error) {
        alert(error?.code === "permission-denied" ? "Sin permiso para guardar asistencia." : `No se pudo guardar: ${error.message}`);
        button.disabled = false;
      }
    });
  });

  refreshIcons();
}

function subjectOptions(course) {
  return course.materias.map((subjectId) => {
    const subject = findSubject(subjectId);
    return `<option value="${subjectId}">${escapeHtml(subject?.nombre || subjectId)}</option>`;
  }).join("");
}

async function renderTasks(context) {
  const container = document.querySelector("[data-teacher-tasks]");
  const course = selectedCourse(context);
  if (!container) return;
  teacherState.gradeModalActivityId = "";
  teacherState.gradeIndex = 0;
  if (!context.courses.length) {
    container.innerHTML = emptyState("Sin cursos asignados", "Admin debe asignarte al menos un curso antes de agendar actividades.");
    return;
  }
  if (!context.courses.some((item) => item.materias.length)) {
    container.innerHTML = emptyState("Sin materias asignadas", "Tus cursos no tienen materias asignadas para tu usuario.");
    return;
  }

  const coursesById = Object.fromEntries(context.courses.map((item) => [item.id, item]));
  const showCourseInAgenda = context.courses.length >= 2;
  const singleCourse = context.courses.length === 1 ? context.courses[0] : null;
  const activities = (await Promise.all(context.courses.map((item) => listActivities(item.id, teacherState.trimesterId)))).flat();
  const visibleActivities = activities.filter((item) => coursesById[item.cursoId]?.materias.includes(item.materiaId) && !item.interno && !["ser", "auto"].includes(item.tipo));
  const monthActivities = visibleActivities.filter((item) => String(item.fecha || "").startsWith(teacherState.taskMonth));
  const byDate = {};
  monthActivities.forEach((activity) => {
    byDate[activity.fecha] ||= [];
    byDate[activity.fecha].push(activity);
  });
  const weeks = workingDaysCalendar(teacherState.taskMonth);
  teacherState.activities = visibleActivities;

  const today = todayIso();
  const modalDate = teacherState.taskModalDate || today;
  const scheduleRows = await getTeacherScheduleRows(context);
  const hasClassOnDate = (isoDate) => {
    const dateDayId = dayIdFromIso(isoDate);
    if (!dateDayId) return false;
    return scheduleRows.some((row) => row.diaId === dateDayId && coursesById[row.cursoId]?.materias.includes(row.materiaId));
  };
  const scheduleByDay = DAYS.map((day) => {
    const seen = new Set();
    const items = scheduleRows
      .filter((row) => row.diaId === day.id && coursesById[row.cursoId]?.materias.includes(row.materiaId))
      .sort((a, b) => String(a.hora || "").localeCompare(String(b.hora || "")) || String(a.materia || "").localeCompare(String(b.materia || "")))
      .filter((row) => {
        const key = `${row.cursoId}|${row.materiaId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return { day, items };
  });
  const draftDate = modalDate;
  const draftDayId = dayIdFromIso(draftDate);
  const coursesForDate = context.courses
    .map((item) => ({
      course: item,
      subjectIds: [...new Set(
        scheduleRows
          .filter((row) => row.cursoId === item.id && row.diaId === draftDayId && item.materias.includes(row.materiaId))
          .map((row) => row.materiaId)
      )]
    }))
    .filter((item) => item.subjectIds.length);
  if (!coursesForDate.some((item) => item.course.id === teacherState.taskDraftCourseId)) {
    teacherState.taskDraftCourseId = coursesForDate.some((item) => item.course.id === course.id)
      ? course.id
      : (coursesForDate[0]?.course.id || "");
  }
  const draftCourseData = coursesForDate.find((item) => item.course.id === teacherState.taskDraftCourseId) || coursesForDate[0] || { course: course || context.courses[0], subjectIds: [] };
  const draftCourse = draftCourseData.course;
  const scheduledSubjectIds = draftCourseData.subjectIds;
  if (!scheduledSubjectIds.includes(teacherState.taskDraftMateriaId)) {
    teacherState.taskDraftMateriaId = scheduledSubjectIds[0] || "";
  }
  const taskDraftMateriaId = teacherState.taskDraftMateriaId;
  if (teacherState.gradeModalActivityId && !visibleActivities.some((item) => item.id === teacherState.gradeModalActivityId)) {
    teacherState.gradeModalActivityId = "";
    teacherState.gradeIndex = 0;
  }
  const activity = visibleActivities.find((item) => item.id === teacherState.gradeModalActivityId);
  const editActivity = visibleActivities.find((item) => item.id === teacherState.taskEditActivityId);
  const activityCourse = activity ? (coursesById[activity.cursoId] || course) : course;
  const editCourseId = teacherState.taskDraftCourseId || editActivity?.cursoId || course?.id || context.courses[0]?.id;
  const editCourse = context.courses.find((item) => item.id === editCourseId) || context.courses.find((item) => item.id === editActivity?.cursoId) || course || context.courses[0];
  const editSubjectIds = editCourse?.materias || [];
  const [students, gradesList, attendanceRows] = activity
    ? await Promise.all([
      getTeacherStudents(activityCourse.id),
      listGradesForCourse(activityCourse.id, teacherState.trimesterId),
      listAttendanceForCourse(activityCourse.id, teacherState.trimesterId)
    ])
    : [[], [], []];
  const gradesMap = gradeByActivityAndStudent(gradesList);
  const activityAttendance = {};
  if (activity) {
    attendanceRows
      .filter((row) => row.fecha === activity.fecha)
      .forEach((row) => { activityAttendance[row.alumnoId] = row; });
  }
  const studentsToGrade = activity
    ? students.filter((student) => ["presente", "atraso"].includes(activityAttendance[student.id]?.estado))
    : [];
  const studentsNotEnabled = activity
    ? students.filter((student) => !["presente", "atraso"].includes(activityAttendance[student.id]?.estado))
    : [];
  if (teacherState.gradeIndex >= studentsToGrade.length) teacherState.gradeIndex = Math.max(studentsToGrade.length - 1, 0);
  const currentStudent = studentsToGrade[teacherState.gradeIndex] || null;
  const currentGrade = activity && currentStudent ? gradesMap[activity.id]?.[currentStudent.id] : null;
  const currentResult = currentGrade ? normalizeGrade(currentGrade.valor, activity?.maximo) : null;

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
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
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
    <section class="space-y-3 sm:space-y-5">
      <style>
        @keyframes agendaNoticeIn {
          0% { opacity: 0; transform: translateY(-10px) scale(.96); }
          18% { opacity: 1; transform: translateY(0) scale(1); }
          82% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-8px) scale(.98); }
        }
      </style>
      <div class="rounded-3xl border border-slate-200 bg-white shadow-soft">
        <div class="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0">
            <p class="text-xs font-black uppercase tracking-[.18em] text-school-navy">AGENDA DE ACTIVIDADES</p>
            <h2 class="capitalize text-2xl font-black text-slate-900">${escapeHtml(monthLabel(teacherState.taskMonth))}</h2>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500"><span>${singleCourse ? `Curso: ${escapeHtml(singleCourse.nombre)}` : `${context.courses.length} cursos asignados`}</span><span class="rounded-full border border-school-green/20 bg-school-green/10 px-3 py-1 text-xs font-black uppercase tracking-[.08em] text-school-green">${escapeHtml(selectedTrimester().label)}</span><span>${monthActivities.length} actividad(es) este mes</span></div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-school-navy" data-task-month-prev>${icon("chevron-left", "mr-1 inline h-4 w-4")}Anterior</button>
            <button type="button" class="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-school-navy" data-task-month-next>Siguiente${icon("chevron-right", "ml-1 inline h-4 w-4")}</button>
          </div>
        </div>
        <div class="overflow-x-auto p-4 lg:p-5">
          <div class="min-w-[760px] rounded-2xl border border-slate-200 lg:min-w-0">
            <div class="grid grid-cols-5 border-b border-slate-200 bg-slate-50">
              ${scheduleByDay.map(({ items }) => `
                <div class="min-h-16 border-r border-slate-200 p-2 last:border-r-0">
                  <div class="grid gap-1.5">
                    ${items.map((row) => {
                      const subject = findSubject(row.materiaId);
                      const rowCourse = coursesById[row.cursoId] || {};
                      const accent = courseAccent(row.cursoId);
                      const courseNumber = String(rowCourse.corto || rowCourse.nombre || "").replace(/\D/g, "") || "I";
                      return showCourseInAgenda ? `
                        <div class="flex items-stretch overflow-hidden rounded-lg border-2 bg-white text-left shadow-sm" style="border-color:${accent}" title="${escapeHtml(row.materia)} · ${escapeHtml(row.curso)}">
                          <span class="min-w-0 flex-1 truncate px-1.5 py-0.5 text-[11px] font-black leading-4 text-slate-900">${escapeHtml(subject?.nombre || row.materia || row.materiaId)}</span>
                          <span class="grid min-w-6 place-items-center px-1 text-xs font-black text-white" style="background:${accent}">${escapeHtml(courseNumber)}</span>
                        </div>
                      ` : `
                        <div class="overflow-hidden rounded-lg border border-slate-200 px-1.5 py-0.5 text-left shadow-sm" style="background:${subject?.color || "#fff"}" title="${escapeHtml(row.materia)}">
                          <span class="block truncate text-[11px] font-black leading-4 text-slate-900">${escapeHtml(subject?.nombre || row.materia || row.materiaId)}</span>
                        </div>
                      `;
                    }).join("") || `<p class="rounded-xl bg-white px-2 py-1.5 text-xs font-bold text-slate-400">Sin clases</p>`}
                  </div>
                </div>
              `).join("")}
            </div>
            <div class="grid grid-cols-5 bg-school-navy text-center text-sm font-black text-white">
              ${DAYS.map((day) => `<div class="border-r border-white/10 px-2 py-3 last:border-r-0">${escapeHtml(day.label)}</div>`).join("")}
            </div>
            <div class="divide-y divide-slate-200">
              ${weeks.map((week) => `
                <div class="grid grid-cols-5">
                  ${week.map((date) => {
                    const dayActivities = date ? (byDate[date] || []) : [];
                    const isToday = date === today;
                    const hasClass = date ? hasClassOnDate(date) : false;
                    return `
                      <div class="min-h-36 border-r border-slate-200 p-2 transition last:border-r-0 ${date ? (hasClass ? "bg-white" : "bg-slate-50/80") : "bg-slate-50"} ${isToday ? "bg-blue-50/70 ring-2 ring-inset ring-school-navy" : ""}" ${date ? `data-drop-activity-date="${date}"` : ""}>
                        ${date ? `<div class="mb-2 flex items-center justify-between gap-2"><span class="grid h-8 w-8 place-items-center rounded-xl ${isToday ? "bg-school-navy text-white" : hasClass ? "bg-school-sky text-school-navy" : "bg-slate-200 text-slate-500"} text-sm font-black">${Number(date.slice(8))}</span><button type="button" class="grid h-8 w-8 place-items-center rounded-xl border ${hasClass ? "border-slate-200 bg-white text-school-navy hover:-translate-y-0.5 hover:border-school-navy hover:shadow-soft" : "border-slate-200 bg-slate-100 text-slate-400"} shadow-sm transition" data-open-activity-date="${date}" data-date-has-class="${hasClass ? "1" : "0"}" title="${hasClass ? "Agenda" : "Sin clases"}">${icon("plus", "h-4 w-4")}</button></div>` : ""}
                        <div class="grid grid-cols-1 gap-1.5">
                          ${dayActivities.map((activity) => {
                            const subject = findSubject(activity.materiaId);
                            const activityCourse = coursesById[activity.cursoId] || {};
                            const accent = courseAccent(activity.cursoId);
                            const courseNumber = String(activityCourse.corto || activityCourse.nombre || "")
                              .replace(/\D/g, "") || "I";
                            const title = `${subject?.nombre || activity.materiaId} - ${activity.titulo || "Sin titulo"}`;
                            return showCourseInAgenda ? `
                            <button type="button" draggable="true" class="flex w-full cursor-grab touch-none items-stretch overflow-hidden rounded-lg border-2 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft active:cursor-grabbing" style="border-color:${accent}" data-edit-activity="${activity.id}" title="${escapeHtml(activity.titulo)}">
                              <span class="min-w-0 flex-1 truncate px-1.5 py-0.5 text-[11px] font-black leading-4 text-slate-900">
                                ${escapeHtml(title)}
                              </span>
                              <span class="grid min-w-6 place-items-center px-1 text-xs font-black text-white" style="background:${accent}">${escapeHtml(courseNumber)}</span>
                            </button>
                          ` : `
                            <button type="button" draggable="true" class="flex w-full cursor-grab touch-none items-stretch overflow-hidden rounded-lg border-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft active:cursor-grabbing" style="border-color:${subject?.color || "#e2e8f0"}; background:${subject?.color || "#fff"}" data-edit-activity="${activity.id}" title="${escapeHtml(activity.titulo)}">
                              <span class="min-w-0 flex-1 truncate px-1.5 py-0.5 text-[11px] font-black leading-4 text-slate-900">
                                ${escapeHtml(title)}
                              </span>
                            </button>
                          `;
                          }).join("") || (date ? `<p class="rounded-xl ${hasClass ? "bg-slate-50" : "bg-white/70"} px-2 py-2 text-xs font-bold text-slate-400">${hasClass ? "Sin actividad" : "Sin clases"}</p>` : "")}
                        </div>
                      </div>
                    `;
                  }).join("")}
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="pointer-events-none fixed left-1/2 top-24 z-[70] hidden -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black text-amber-800 shadow-soft" data-agenda-no-class-toast>
        ${icon("calendar-x", "mr-2 inline h-4 w-4")}Sin clases asignadas para este dia
      </div>
      <div class="fixed inset-0 z-50 ${teacherState.taskModalDate ? "flex" : "hidden"} items-start justify-center overflow-y-auto bg-slate-950/60 p-4 pt-10" data-activity-modal>
        <form class="w-full max-w-3xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl" data-activity-form>
          <div class="flex items-center justify-between gap-3 bg-school-navy p-5 text-white">
            <div>
              <p class="text-xs font-black uppercase tracking-[.18em] text-white/70">${escapeHtml(draftCourse?.nombre || course.nombre)} · ${escapeHtml(selectedTrimester().label)}</p>
              <h2 class="mt-1 text-2xl font-black">Agenda</h2>
            </div>
            <button type="button" class="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-white hover:bg-white/20" data-close-activity-modal>${icon("x", "h-5 w-5")}</button>
          </div>
          <div class="space-y-4 p-5">
            <div class="rounded-3xl border border-school-navy/20 bg-school-sky p-4 text-school-navy">
              <p class="text-xs font-black uppercase tracking-[.18em] opacity-70">Fecha seleccionada</p>
              <p class="mt-1 text-xl font-black capitalize">${escapeHtml(longDateLabel(draftDate))}</p>
              <p class="mt-1 text-sm font-semibold opacity-80">La agenda se guardara para este dia.</p>
            </div>

            ${singleCourse ? `
              <input type="hidden" name="cursoId" value="${escapeHtml(draftCourse.id || singleCourse.id)}">
            ` : `
              <div class="rounded-3xl border border-slate-200 bg-white p-4">
                <label class="block text-sm font-black text-slate-700">Curso</label>
                <select class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold" name="cursoId" data-task-modal-course required>
                  ${coursesForDate.map((item) => `
                    <option value="${item.course.id}" ${item.course.id === draftCourse.id ? "selected" : ""}>${escapeHtml(item.course.nombre)}</option>
                  `).join("")}
                </select>
                ${coursesForDate.length ? "" : `<div class="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">No tienes clases asignadas en ningun curso para esta fecha.</div>`}
              </div>
            `}

            <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-sm font-black text-slate-700">Materia</p>
              <input type="hidden" name="materiaId" value="${escapeHtml(taskDraftMateriaId)}">
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                ${scheduledSubjectIds.map((subjectId) => {
                  const subject = findSubject(subjectId);
                  const active = subjectId === taskDraftMateriaId;
                  return `
                    <button type="button" data-task-materia="${subjectId}" class="rounded-2xl border-2 px-4 py-3 text-left text-sm font-black transition hover:-translate-y-0.5 hover:shadow-soft ${active ? "border-school-navy bg-school-sky text-school-navy ring-4 ring-school-navy/10" : "border-slate-200 bg-white text-slate-700"}">
                      ${escapeHtml(subject?.nombre || subjectId)}
                    </button>
                  `;
                }).join("")}
              </div>
              ${scheduledSubjectIds.length ? "" : `<div class="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">No hay materias asignadas en el horario para este curso y fecha.</div>`}
            </div>

            <div class="rounded-3xl border border-slate-200 bg-white p-4">
              <p class="text-sm font-black text-slate-700">Tipo de actividad</p>
              <div class="mt-3 grid gap-3 sm:grid-cols-2">
                <button type="button" data-task-type="tarea" class="rounded-3xl border-2 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-soft ${teacherState.taskDraftTipo === "tarea" ? "border-green-500 bg-green-50 text-green-800 ring-4 ring-green-100" : "border-slate-200 bg-white text-slate-700"}">
                  <h4 class="text-xl font-black">HACER</h4>
                  <p class="mt-1 text-sm font-semibold text-slate-500">Tareas, ejercicios</p>
                </button>
                <button type="button" data-task-type="examen" class="rounded-3xl border-2 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-soft ${teacherState.taskDraftTipo === "examen" ? "border-blue-500 bg-blue-50 text-blue-800 ring-4 ring-blue-100" : "border-slate-200 bg-white text-slate-700"}">
                  <h4 class="text-xl font-black">SABER</h4>
                  <p class="mt-1 text-sm font-semibold text-slate-500">Examenes, cuestionarios</p>
                </button>
              </div>
            </div>

            <div class="${teacherState.taskDraftTipo ? "" : "hidden"} rounded-3xl border border-slate-200 bg-white p-4">
              <div class="grid gap-3 md:grid-cols-[1fr_160px]">
                <label class="block text-sm font-black text-slate-700">Titulo
                  <input class="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold" name="titulo" placeholder="Ej: Investigacion Unidad 1" required>
                </label>
                <label class="block text-sm font-black text-slate-700">Nota maxima
                  <input class="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold" type="number" name="maximo" min="1" placeholder="Ej: 10" required>
                </label>
              </div>
            </div>

            <input type="hidden" name="tipo" value="${escapeHtml(teacherState.taskDraftTipo)}">
            <input type="hidden" name="fecha" value="${escapeHtml(draftDate)}">
            <p class="mt-4 hidden rounded-2xl border px-4 py-3 text-sm font-bold" data-activity-status></p>
            <div class="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600" data-close-activity-modal>Cancelar</button>
              <button class="rounded-2xl bg-green-600 px-5 py-3 text-sm font-black text-white shadow-soft transition hover:bg-green-700" type="submit">${icon("save", "mr-1 inline h-5 w-5")} Guardar</button>
            </div>
          </div>
        </form>
      </div>
      <div class="fixed inset-0 z-50 ${editActivity ? "flex" : "hidden"} items-start justify-center overflow-y-auto bg-slate-950/60 p-4 pt-10" data-edit-activity-modal>
        <form class="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl" data-edit-activity-form>
          <div class="flex items-center justify-between gap-3 bg-school-navy p-5 text-white">
            <div class="min-w-0">
              <p class="text-xs font-black uppercase tracking-[.18em] text-white/70">${editActivity ? `${escapeHtml(editCourse?.nombre || "Curso")} · ${escapeHtml(selectedTrimester().label)}` : ""}</p>
              <h2 class="mt-1 truncate text-2xl font-black">Editar actividad</h2>
            </div>
            <button type="button" class="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-white hover:bg-white/20" data-close-edit-activity-modal>${icon("x", "h-5 w-5")}</button>
          </div>
          ${editActivity ? `
            <div class="space-y-4 p-5">
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-2xl border border-school-navy/15 bg-school-sky px-4 py-3 text-school-navy">
                  <p class="text-xs font-black uppercase tracking-[.14em] opacity-70">Fecha</p>
                  <p class="mt-1 text-sm font-black capitalize">${escapeHtml(longDateLabel(editActivity.fecha || todayIso()))}</p>
                  <input type="hidden" name="fecha" value="${escapeHtml(editActivity.fecha || todayIso())}">
                </div>
                <label class="${singleCourse ? "hidden" : "block"} text-sm font-black text-slate-700">Curso
                  <select class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold" name="cursoId" data-edit-activity-course required>
                    ${context.courses.map((item) => `<option value="${item.id}" ${item.id === editCourse?.id ? "selected" : ""}>${escapeHtml(item.nombre)}</option>`).join("")}
                  </select>
                </label>
                ${singleCourse ? `<input type="hidden" name="cursoId" value="${escapeHtml(singleCourse.id)}">` : ""}
              </div>
              <label class="block text-sm font-black text-slate-700">Materia
                <select class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold" name="materiaId" required>
                  ${editSubjectIds.map((subjectId) => {
                    const subject = findSubject(subjectId);
                    return `<option value="${subjectId}" ${subjectId === editActivity.materiaId ? "selected" : ""}>${escapeHtml(subject?.nombre || subjectId)}</option>`;
                  }).join("")}
                </select>
              </label>
              <label class="block text-sm font-black text-slate-700">Tipo
                <select class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold" name="tipo" required>
                  <option value="tarea" ${editActivity.tipo === "tarea" ? "selected" : ""}>HACER - tareas, ejercicios</option>
                  <option value="examen" ${isSaberActivity(editActivity) ? "selected" : ""}>SABER - examenes, cuestionarios</option>
                </select>
              </label>
              <div class="grid gap-3 sm:grid-cols-[1fr_150px]">
                <label class="block text-sm font-black text-slate-700">Titulo
                  <input class="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold" name="titulo" value="${escapeHtml(editActivity.titulo || "")}" required>
                </label>
                <label class="block text-sm font-black text-slate-700">Nota maxima
                  <input class="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold" type="number" name="maximo" min="1" value="${escapeHtml(editActivity.maximo || 100)}" required>
                </label>
              </div>
              <p class="hidden rounded-2xl border px-4 py-3 text-sm font-bold" data-edit-activity-status></p>
              <div class="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700 transition hover:bg-red-100" data-delete-edit-activity="${editActivity.id}">${icon("trash-2", "mr-1 inline h-4 w-4")} Eliminar</button>
                <div class="flex justify-end gap-2">
                  <button type="button" class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600" data-close-edit-activity-modal>Cancelar</button>
                  <button class="rounded-2xl bg-green-600 px-5 py-3 text-sm font-black text-white shadow-soft transition hover:bg-green-700" type="submit">${icon("save", "mr-1 inline h-5 w-5")} Guardar cambios</button>
                </div>
              </div>
            </div>
          ` : ""}
        </form>
      </div>
      <div class="fixed inset-0 z-50 ${activity ? "flex" : "hidden"} items-start justify-center overflow-y-auto bg-slate-950/60 p-4 pt-10" data-grade-modal>
        <section class="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
          <div class="bg-school-navy px-5 py-4 text-white">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-xs font-black uppercase tracking-[.18em] text-white/70">${activity ? `${escapeHtml(activityCourse?.nombre || "Curso")} · ${escapeHtml(findSubject(activity.materiaId)?.nombre || activity.materiaId)}` : ""}</p>
                <h3 class="mt-1 text-2xl font-black">${activity ? escapeHtml(activity.titulo) : "Calificar"}</h3>
              </div>
              <button type="button" class="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white hover:bg-white/20" data-close-grade-modal>${icon("x", "h-5 w-5")}</button>
            </div>
          </div>
          ${activity && studentsNotEnabled.length ? `
            <details class="mx-5 mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              <summary class="cursor-pointer font-black">${studentsNotEnabled.length} alumno(s) no habilitados. Clic para ver.</summary>
              <ul class="mt-3 list-disc space-y-1 pl-5">
                ${studentsNotEnabled.map((student) => `<li>${escapeHtml(student.nombre)} · ${attendanceLabel(activityAttendance[student.id]?.estado || "falta")}</li>`).join("")}
              </ul>
            </details>
          ` : ""}
          ${activity && currentStudent ? `
            <div class="p-5">
              <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-center">
                <p class="text-xs font-black uppercase tracking-[.18em] text-slate-400">Alumno ${teacherState.gradeIndex + 1} de ${studentsToGrade.length}</p>
                <div class="mx-auto mt-3 grid h-16 w-16 place-items-center rounded-2xl bg-school-sky text-2xl font-black text-school-navy">${teacherState.gradeIndex + 1}</div>
                <h4 class="mt-4 text-2xl font-black text-slate-900">${escapeHtml(currentStudent.nombre)}</h4>
                <p class="mt-2 text-sm font-black text-slate-500">Nota maxima: ${activity.maximo || 100}</p>
              </div>
              <div class="mt-5 grid gap-4 sm:grid-cols-[1fr_150px] sm:items-end">
                <label class="text-sm font-black text-slate-700">Nota obtenida
                  <input class="mt-2 w-full rounded-3xl border border-slate-200 px-5 py-4 text-center text-3xl font-black outline-none focus:border-school-navy focus:ring-4 focus:ring-school-navy/10" type="number" min="0" max="${activity.maximo || 100}" value="${currentGrade?.valor ?? ""}" data-guided-grade-value>
                </label>
                <div class="rounded-3xl border border-slate-200 bg-white p-4 text-center">
                  <p class="text-xs font-black uppercase tracking-[.14em] text-slate-400">Nota final</p>
                  <p class="mt-2 text-4xl font-black ${Number(currentResult?.nota || 0) <= 50 ? "text-red-600" : "text-green-700"}" data-guided-grade-final>${currentResult?.nota ?? "-"}</p>
                </div>
              </div>
              ${(Number(activity.maximo || 100) <= 20) ? `
                <div class="mt-4 flex flex-wrap justify-center gap-2">
                  ${Array.from({ length: Number(activity.maximo || 100) + 1 }, (_, value) => `<button type="button" data-grade-quick="${value}" class="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-sm font-black text-slate-700 hover:border-school-navy hover:bg-school-sky">${value}</button>`).join("")}
                </div>
              ` : ""}
              <div class="mt-5 flex items-center gap-3">
                <button type="button" data-grade-prev class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-school-navy">${icon("chevron-left", "mr-1 inline h-4 w-4")}Anterior</button>
                <div class="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div class="h-full rounded-full bg-school-navy transition-all" style="width:${studentsToGrade.length ? Math.round(((teacherState.gradeIndex + 1) / studentsToGrade.length) * 100) : 0}%"></div>
                </div>
                <button type="button" data-grade-next class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-school-navy">Siguiente${icon("chevron-right", "ml-1 inline h-4 w-4")}</button>
              </div>
              <button type="button" class="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-school-navy px-4 py-3 font-black text-white" data-save-guided-grade="${currentStudent.id}">
                ${icon("save", "h-5 w-5")} Guardar y avanzar
              </button>
            </div>
          ` : `<div class="p-5">${emptyState("No hay alumnos habilitados", "Para calificar esta actividad, primero debe existir asistencia o atraso en esa fecha.")}</div>`}
        </section>
      </div>
    </section>
  `;

  container.querySelector("[data-task-modal-course]")?.addEventListener("change", (event) => {
    teacherState.taskDraftCourseId = event.target.value;
    teacherState.taskDraftMateriaId = "";
    teacherState.taskDraftTipo = "";
    renderTasks(context);
  });
  container.querySelectorAll("[data-task-materia]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.taskDraftMateriaId = button.dataset.taskMateria;
      renderTasks(context);
    });
  });
  container.querySelectorAll("[data-task-type]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.taskDraftTipo = button.dataset.taskType;
      renderTasks(context);
    });
  });
  container.querySelectorAll("[data-task-date]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.taskModalDate = button.dataset.taskDate || todayIso();
      renderTasks(context);
    });
  });

  container.querySelector("[data-activity-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector("[data-activity-status]");
    const data = new FormData(form);
    const button = form.querySelector("button[type='submit']");
    const targetCourse = context.courses.find((item) => item.id === data.get("cursoId")) || draftCourse;
    const materiaPermitida = scheduledSubjectIds.includes(data.get("materiaId"));
    if (!targetCourse || !data.get("cursoId") || !data.get("materiaId") || !data.get("tipo") || !data.get("fecha") || !data.get("titulo") || !data.get("maximo") || !materiaPermitida) {
      if (status) {
        status.className = "mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800";
        status.textContent = "Complete curso, materia valida segun horario, tipo, titulo y nota maxima.";
        status.classList.remove("hidden");
      }
      return;
    }
    button.disabled = true;
    if (status) {
      status.className = "mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700";
      status.textContent = "Guardando actividad...";
      status.classList.remove("hidden");
    }
    try {
      await saveActivity({ course: targetCourse, materiaId: data.get("materiaId"), fecha: data.get("fecha"), titulo: data.get("titulo"), tipo: data.get("tipo"), maximo: data.get("maximo"), trimestreId: teacherState.trimesterId });
      teacherState.taskMonth = String(data.get("fecha") || todayIso()).slice(0, 7);
      teacherState.taskModalDate = "";
      teacherState.taskDraftCourseId = "";
      teacherState.taskDraftTipo = "";
      form.reset();
      await renderTasks(context);
    } catch (error) {
      if (status) {
        status.className = "mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700";
        status.textContent = error?.code === "permission-denied" ? "Sin permiso para guardar actividad." : error.message;
      }
      button.disabled = false;
    }
  });

  container.querySelectorAll("[data-open-activity-date]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.dateHasClass !== "1") {
        const toast = container.querySelector("[data-agenda-no-class-toast]");
        if (toast) {
          toast.classList.remove("hidden");
          toast.style.animation = "none";
          void toast.offsetHeight;
          toast.style.animation = "agendaNoticeIn 2.2s ease both";
          window.setTimeout(() => toast.classList.add("hidden"), 2200);
        }
        return;
      }
      teacherState.taskModalDate = button.dataset.openActivityDate || todayIso();
      teacherState.taskDraftCourseId = teacherState.selectedCourseId;
      teacherState.taskDraftMateriaId = "";
      teacherState.taskDraftTipo = "";
      teacherState.taskEditActivityId = "";
      renderTasks(context);
    });
  });

  const clearDropHighlights = () => {
    container.querySelectorAll("[data-drop-activity-date]").forEach((zone) => {
      zone.classList.remove("ring-4", "ring-school-green", "bg-green-50");
    });
  };
  const highlightDropZone = (zone) => {
    clearDropHighlights();
    zone?.classList.add("ring-4", "ring-school-green", "bg-green-50");
  };
  const moveActivityToDate = async (activityId, targetDate) => {
    const selected = visibleActivities.find((item) => item.id === activityId);
    if (!selected || !targetDate || selected.fecha === targetDate) return;
    const targetDayId = dayIdFromIso(targetDate);
    const canMove = scheduleRows.some((row) => row.cursoId === selected.cursoId && row.materiaId === selected.materiaId && row.diaId === targetDayId);
    if (!canMove) {
      alert("No se puede mover a esa fecha porque esa materia no esta en tu horario de ese dia.");
      return;
    }
    const targetCourse = coursesById[selected.cursoId] || context.courses.find((item) => item.id === selected.cursoId);
    if (!targetCourse) return;
    if (!confirm(`Mover "${selected.titulo || "actividad"}" a ${longDateLabel(targetDate)}?`)) return;
    await updateActivity({
      activity: selected,
      course: targetCourse,
      materiaId: selected.materiaId,
      fecha: targetDate,
      titulo: selected.titulo,
      tipo: selected.tipo,
      maximo: selected.maximo,
      trimestreId: selected.trimestreId || teacherState.trimesterId
    });
    teacherState.taskMonth = targetDate.slice(0, 7);
    teacherState.taskEditActivityId = "";
    teacherState.taskDraftCourseId = "";
    await renderTasks(context);
  };

  container.querySelectorAll("[data-edit-activity]").forEach((button) => {
    button.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", button.dataset.editActivity || "");
      button.dataset.dragMoved = "true";
      button.classList.add("opacity-50");
    });
    button.addEventListener("dragend", () => {
      button.classList.remove("opacity-50");
      clearDropHighlights();
      setTimeout(() => { delete button.dataset.dragMoved; }, 300);
    });
    let holdTimer = null;
    let isTouchDragging = false;
    let dragGhost = null;
    let currentDropZone = null;
    let startPoint = null;
    const stopTouchDrag = () => {
      clearTimeout(holdTimer);
      holdTimer = null;
      isTouchDragging = false;
      startPoint = null;
      currentDropZone = null;
      dragGhost?.remove();
      dragGhost = null;
      button.classList.remove("opacity-50");
      clearDropHighlights();
    };
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      startPoint = { x: event.clientX, y: event.clientY };
      holdTimer = setTimeout(() => {
        isTouchDragging = true;
        button.dataset.dragMoved = "true";
        button.classList.add("opacity-50");
        dragGhost = button.cloneNode(true);
        dragGhost.className = `${button.className} fixed z-[9999] w-56 opacity-95 shadow-2xl pointer-events-none`;
        dragGhost.style.left = `${event.clientX + 10}px`;
        dragGhost.style.top = `${event.clientY + 10}px`;
        document.body.appendChild(dragGhost);
      }, 350);
    });
    button.addEventListener("pointermove", (event) => {
      if (!startPoint) return;
      if (!isTouchDragging && Math.abs(event.clientX - startPoint.x) + Math.abs(event.clientY - startPoint.y) > 12) {
        clearTimeout(holdTimer);
      }
      if (!isTouchDragging) return;
      event.preventDefault();
      if (dragGhost) {
        dragGhost.style.left = `${event.clientX + 10}px`;
        dragGhost.style.top = `${event.clientY + 10}px`;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY);
      currentDropZone = target?.closest("[data-drop-activity-date]");
      highlightDropZone(currentDropZone);
    });
    button.addEventListener("pointerup", async () => {
      clearTimeout(holdTimer);
      if (isTouchDragging) {
        const targetDate = currentDropZone?.dataset.dropActivityDate || "";
        stopTouchDrag();
        setTimeout(() => { delete button.dataset.dragMoved; }, 300);
        await moveActivityToDate(button.dataset.editActivity, targetDate);
        return;
      }
      stopTouchDrag();
    });
    button.addEventListener("pointercancel", stopTouchDrag);
    button.addEventListener("click", () => {
      if (button.dataset.dragMoved === "true") {
        delete button.dataset.dragMoved;
        return;
      }
      const selected = visibleActivities.find((item) => item.id === button.dataset.editActivity);
      teacherState.taskEditActivityId = button.dataset.editActivity || "";
      teacherState.taskDraftCourseId = selected?.cursoId || teacherState.selectedCourseId;
      teacherState.taskModalDate = "";
      teacherState.taskDraftMateriaId = "";
      teacherState.taskDraftTipo = "";
      renderTasks(context);
    });
  });

  container.querySelectorAll("[data-drop-activity-date]").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      highlightDropZone(zone);
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("ring-4", "ring-school-green", "bg-green-50"));
    zone.addEventListener("drop", async (event) => {
      event.preventDefault();
      const activityId = event.dataTransfer.getData("text/plain");
      clearDropHighlights();
      await moveActivityToDate(activityId, zone.dataset.dropActivityDate);
    });
  });


  container.querySelector("[data-edit-activity-course]")?.addEventListener("change", (event) => {
    teacherState.taskDraftCourseId = event.target.value;
    renderTasks(context);
  });

  container.querySelector("[data-edit-activity-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editActivity) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const status = form.querySelector("[data-edit-activity-status]");
    const button = form.querySelector("button[type='submit']");
    const targetCourse = context.courses.find((item) => item.id === data.get("cursoId")) || editCourse;
    if (!targetCourse || !data.get("materiaId") || !data.get("fecha") || !data.get("titulo") || !data.get("maximo")) {
      if (status) {
        status.className = "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800";
        status.textContent = "Complete fecha, curso, materia, titulo y nota maxima.";
        status.classList.remove("hidden");
      }
      return;
    }
    button.disabled = true;
    if (status) {
      status.className = "rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700";
      status.textContent = "Guardando cambios...";
      status.classList.remove("hidden");
    }
    try {
      await updateActivity({
        activity: editActivity,
        course: targetCourse,
        materiaId: data.get("materiaId"),
        fecha: data.get("fecha"),
        titulo: data.get("titulo"),
        tipo: data.get("tipo"),
        maximo: data.get("maximo"),
        trimestreId: teacherState.trimesterId
      });
      teacherState.taskMonth = String(data.get("fecha") || todayIso()).slice(0, 7);
      teacherState.taskEditActivityId = "";
      teacherState.taskDraftCourseId = "";
      await renderTasks(context);
    } catch (error) {
      if (status) {
        status.className = "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700";
        status.textContent = error?.code === "permission-denied" ? "Sin permiso para editar actividad." : error.message;
      }
      button.disabled = false;
    }
  });

  container.querySelector("[data-delete-edit-activity]")?.addEventListener("click", async (event) => {
    if (!editActivity) return;
    if (!confirm(`Esta seguro que desea eliminar "${editActivity.titulo || "esta actividad"}"?`)) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await deleteActivity(editActivity);
      teacherState.taskEditActivityId = "";
      teacherState.taskDraftCourseId = "";
      await renderTasks(context);
    } catch (error) {
      alert(error?.code === "permission-denied" ? "Sin permiso para eliminar actividad." : error.message);
      button.disabled = false;
    }
  });

  container.querySelectorAll("[data-close-activity-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.taskModalDate = "";
      teacherState.taskDraftCourseId = "";
      teacherState.taskDraftTipo = "";
      renderTasks(context);
    });
  });

  container.querySelector("[data-activity-modal]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-activity-modal]")) {
      teacherState.taskModalDate = "";
      teacherState.taskDraftCourseId = "";
      teacherState.taskDraftTipo = "";
      renderTasks(context);
    }
  });

  container.querySelectorAll("[data-close-edit-activity-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.taskEditActivityId = "";
      teacherState.taskDraftCourseId = "";
      renderTasks(context);
    });
  });

  container.querySelector("[data-edit-activity-modal]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-edit-activity-modal]")) {
      teacherState.taskEditActivityId = "";
      teacherState.taskDraftCourseId = "";
      renderTasks(context);
    }
  });

  container.querySelectorAll("[data-open-grade]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.gradeModalActivityId = button.dataset.openGrade;
      teacherState.gradeIndex = 0;
      renderTasks(context);
    });
  });
  container.querySelector("[data-close-grade-modal]")?.addEventListener("click", () => {
    teacherState.gradeModalActivityId = "";
    teacherState.gradeIndex = 0;
    renderTasks(context);
  });
  container.querySelector("[data-grade-modal]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-grade-modal]")) {
      teacherState.gradeModalActivityId = "";
      teacherState.gradeIndex = 0;
      renderTasks(context);
    }
  });
  container.querySelector("[data-grade-prev]")?.addEventListener("click", () => {
    teacherState.gradeIndex = Math.max(teacherState.gradeIndex - 1, 0);
    renderTasks(context);
  });
  container.querySelector("[data-grade-next]")?.addEventListener("click", () => {
    teacherState.gradeIndex = Math.min(teacherState.gradeIndex + 1, Math.max(studentsToGrade.length - 1, 0));
    renderTasks(context);
  });
  container.querySelectorAll("[data-grade-quick]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = container.querySelector("[data-guided-grade-value]");
      if (!input) return;
      input.value = button.dataset.gradeQuick;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  container.querySelector("[data-guided-grade-value]")?.addEventListener("input", (event) => {
    const result = normalizeGrade(event.target.value, activity?.maximo);
    const final = container.querySelector("[data-guided-grade-final]");
    if (final) {
      final.textContent = result?.nota ?? "-";
      final.className = `mt-2 text-4xl font-black ${Number(result?.nota || 0) <= 50 ? "text-red-600" : "text-green-700"}`;
    }
  });
  container.querySelector("[data-save-guided-grade]")?.addEventListener("click", async (buttonEvent) => {
    const button = buttonEvent.currentTarget;
    const student = studentsToGrade.find((item) => item.id === button.dataset.saveGuidedGrade);
    const input = container.querySelector("[data-guided-grade-value]");
    if (!student || !activity || !input) return;
    button.disabled = true;
    try {
      const savedGrade = await saveGrade({ activity, student, value: input.value });
      upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
      teacherState.gradeIndex = Math.min(teacherState.gradeIndex + 1, Math.max(studentsToGrade.length - 1, 0));
      await renderTasks(context);
    } catch (error) {
      alert(error?.code === "permission-denied" ? "Sin permiso para guardar nota." : error.message);
      button.disabled = false;
    }
  });
  container.querySelector("[data-task-month-prev]")?.addEventListener("click", () => {
    teacherState.taskMonth = shiftMonth(teacherState.taskMonth, -1);
    renderTasks(context);
  });
  container.querySelector("[data-task-month-next]")?.addEventListener("click", () => {
    teacherState.taskMonth = shiftMonth(teacherState.taskMonth, 1);
    renderTasks(context);
  });
  refreshIcons();
}

async function renderDateGrading(context) {
  const container = document.querySelector("[data-teacher-grading]");
  if (!container) return;
  if (!context.courses.length) {
    container.innerHTML = emptyState("Sin cursos asignados", "Admin debe asignarte cursos y materias antes de calificar.");
    return;
  }

  const coursesById = Object.fromEntries(context.courses.map((item) => [item.id, item]));
  const gradeDate = todayIso();
  teacherState.gradeDate = gradeDate;
  const gradeScope = ["pendientes", "semana"].includes(teacherState.gradeScope) ? teacherState.gradeScope : "dia";
  const nextSchoolDays = [];
  const nextDayCursor = new Date(`${gradeDate}T12:00:00`);
  while (nextSchoolDays.length < 7) {
    nextSchoolDays.push(nextDayCursor.toISOString().slice(0, 10));
    nextDayCursor.setDate(nextDayCursor.getDate() + 1);
  }
  const forwardRange = {
    start: nextSchoolDays[0],
    end: nextSchoolDays[nextSchoolDays.length - 1]
  };
  const allActivities = (await Promise.all(context.courses.map((item) => listActivities(item.id, teacherState.trimesterId)))).flat();
  const gradedActivityIds = gradeScope === "pendientes"
    ? new Set((await Promise.all(context.courses.map((item) => listGradesForCourse(item.id, teacherState.trimesterId))))
      .flat()
      .map((grade) => grade.actividadId)
      .filter(Boolean))
    : new Set();
  const activities = allActivities
    .filter((item) => {
      const inAssignedCourse = coursesById[item.cursoId]?.materias.includes(item.materiaId);
      const itemDate = item.fecha || "";
      const inRange = gradeScope === "pendientes"
        ? itemDate && itemDate < gradeDate && !gradedActivityIds.has(item.id)
        : gradeScope === "semana"
          ? nextSchoolDays.includes(itemDate)
          : itemDate === gradeDate;
      return inAssignedCourse && inRange && !item.interno && !["ser", "auto"].includes(item.tipo);
    })
    .sort((a, b) => {
      const dateOrder = gradeScope === "pendientes"
        ? String(b.fecha || "").localeCompare(String(a.fecha || ""))
        : String(a.fecha || "").localeCompare(String(b.fecha || ""));
      return dateOrder || String(a.cursoId || "").localeCompare(String(b.cursoId || "")) || String(a.materiaId || "").localeCompare(String(b.materiaId || ""));
    });

  if (teacherState.gradeModalActivityId && !activities.some((item) => item.id === teacherState.gradeModalActivityId)) {
    teacherState.gradeModalActivityId = "";
    teacherState.gradeStudentId = "";
    teacherState.gradeIndex = 0;
    teacherState.gradeModalClosed = true;
  }

  const activity = activities.find((item) => item.id === teacherState.gradeModalActivityId) || null;
  const activityCourse = activity ? coursesById[activity.cursoId] : null;
  const [students, gradesMap, attendanceMap] = activity
    ? await Promise.all([
      getTeacherStudents(activity.cursoId),
      listGradesForActivity(activity.id),
      listAttendanceForCourseDate(activity.cursoId, activity.fecha, teacherState.trimesterId)
    ])
    : [[], {}, {}];
  const studentOrderMap = new Map(students.map((student, index) => [student.id, index + 1]));

  const ignoreAttendanceForGrading = Boolean(teacherState.gradeIgnoreAttendance);
  const attendanceAllowsGrade = (student) => ["presente", "atraso"].includes(attendanceMap[student.id]?.estado);
  const studentsToGrade = activity
    ? (ignoreAttendanceForGrading ? students : students.filter(attendanceAllowsGrade))
    : [];
  const studentsNotEnabled = activity && !ignoreAttendanceForGrading
    ? students.filter((student) => !attendanceAllowsGrade(student))
    : [];
  if (teacherState.gradeStudentId && !studentsToGrade.some((student) => student.id === teacherState.gradeStudentId)) {
    teacherState.gradeStudentId = "";
  }
  if (teacherState.gradeStudentId) {
    teacherState.gradeIndex = Math.max(studentsToGrade.findIndex((student) => student.id === teacherState.gradeStudentId), 0);
  }
  if (teacherState.gradeIndex >= studentsToGrade.length) teacherState.gradeIndex = Math.max(studentsToGrade.length - 1, 0);
  const currentStudent = activity && !teacherState.gradeModalClosed
    ? (teacherState.gradeStudentId ? (studentsToGrade.find((student) => student.id === teacherState.gradeStudentId) || null) : (studentsToGrade[teacherState.gradeIndex] || null))
    : null;
  const currentGrade = currentStudent ? gradesMap[currentStudent.id] : null;
  const currentResult = currentGrade ? normalizeGrade(currentGrade.valor, activity?.maximo) : null;
  const gradedStudents = studentsToGrade.filter((student) => gradesMap[student.id]);
  const pendingStudents = studentsToGrade.filter((student) => !gradesMap[student.id]);
  const gradedIds = new Set(gradedStudents.map((student) => student.id));
  const gradeModalOpen = Boolean(activity && !teacherState.gradeModalClosed);
  const listPickerStudent = teacherState.gradeMode === "lista" && gradeModalOpen && teacherState.gradeStudentId
    ? (studentsToGrade.find((student) => student.id === teacherState.gradeStudentId) || null)
    : null;
  const listPickerGrade = listPickerStudent ? gradesMap[listPickerStudent.id] : null;
  const showCourse = context.courses.length >= 2;
  const tomorrowDate = new Date(`${todayIso()}T12:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowIso = tomorrowDate.toISOString().slice(0, 10);
  const activitiesByDate = activities.reduce((groups, item) => {
    const key = item.fecha || gradeDate;
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
  const activityDates = Object.keys(activitiesByDate).sort();
  const dateColumnLabel = (isoDate) => {
    const dayNumber = Number(String(isoDate || "").slice(8, 10)) || "";
    if (isoDate === todayIso()) return `Hoy ${dayNumber}`;
    if (isoDate === tomorrowIso) return `Mañana ${dayNumber}`;
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString("es-BO", {
      weekday: "short",
      day: "numeric"
    }).replace(".", "");
  };
  const scopeTitle = gradeScope === "pendientes"
    ? "Pendientes de calificar"
    : gradeScope === "semana"
      ? `7 dias desde ${dateColumnLabel(forwardRange.start)}`
      : longDateLabel(gradeDate);
  const emptyActivityText = gradeScope === "pendientes"
    ? "No hay actividades anteriores pendientes de calificar."
    : gradeScope === "semana"
      ? "No hay actividades en esta semana."
      : "No hay actividades en esta fecha.";
  const pendingDates = [...new Set(activities.map((item) => item.fecha).filter(Boolean))].sort((a, b) => String(b).localeCompare(String(a))).slice(0, 7);
  const planningDates = gradeScope === "pendientes" ? pendingDates : gradeScope === "semana" ? nextSchoolDays : [gradeDate];
  const subjectOrder = [...new Set(context.courses.flatMap((courseItem) => courseItem.materias || []))];
  const subjectsInView = [...new Set(activities.map((item) => item.materiaId))]
    .sort((a, b) => {
      const orderA = subjectOrder.includes(a) ? subjectOrder.indexOf(a) : 999;
      const orderB = subjectOrder.includes(b) ? subjectOrder.indexOf(b) : 999;
      return orderA - orderB || String(findSubject(a)?.nombre || a).localeCompare(String(findSubject(b)?.nombre || b));
    });
  const activitiesBySubjectDate = activities.reduce((groups, item) => {
    const subjectKey = item.materiaId || "sin_materia";
    const dateKey = item.fecha || gradeDate;
    groups[subjectKey] = groups[subjectKey] || {};
    groups[subjectKey][dateKey] = groups[subjectKey][dateKey] || [];
    groups[subjectKey][dateKey].push(item);
    return groups;
  }, {});
  const planningDayLabel = (isoDate) => {
    const date = new Date(`${isoDate}T12:00:00`);
    return {
      date: date.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit" }),
      day: date.toLocaleDateString("es-BO", { weekday: "long" }).toUpperCase()
    };
  };
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
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
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
    <section class="space-y-3 sm:space-y-5">
      <style>
        @keyframes gradePanelIn {
          from { opacity: 0; transform: translateX(78px) scale(.985); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes gradeRowsPush {
          from { transform: scaleX(1.015); }
          to { transform: scaleX(1); }
        }
        .grade-list-shell {
          display: grid;
          gap: .75rem;
          grid-template-columns: 1fr;
          transition: grid-template-columns 560ms cubic-bezier(.22, 1, .36, 1), gap 560ms cubic-bezier(.22, 1, .36, 1);
        }
        .grade-list-rows {
          min-width: 0;
          transform-origin: left center;
          transition: transform 560ms cubic-bezier(.22, 1, .36, 1), opacity 420ms ease, max-width 560ms cubic-bezier(.22, 1, .36, 1);
        }
        .grade-list-panel {
          min-width: 0;
          animation: gradePanelIn 520ms cubic-bezier(.22, 1, .36, 1) both;
          will-change: transform, opacity;
        }
        .grade-list-shell.has-picker .grade-list-rows {
          animation: gradeRowsPush 520ms cubic-bezier(.22, 1, .36, 1) both;
        }
        .grade-plan-grid {
          display: grid;
          grid-template-columns: minmax(3.15rem, .32fr) repeat(var(--grade-days), minmax(6.4rem, 1fr));
        }
        @media (min-width: 768px) {
          .grade-plan-grid {
            grid-template-columns: minmax(7rem, .7fr) repeat(var(--grade-days), minmax(6.5rem, 1fr));
          }
        }
        @media (min-width: 1024px) {
          .grade-list-shell.has-picker {
            grid-template-columns: minmax(8.5rem, .58fr) minmax(18rem, 1fr);
          }
        }
      </style>
      <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:rounded-3xl sm:p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[.18em] text-school-green">Calificar</p>
            <h2 class="mt-1 text-lg font-semibold capitalize leading-tight text-slate-900 sm:text-xl">${escapeHtml(scopeTitle)}</h2>
            <p class="mt-1 text-xs font-medium text-slate-500">${activities.length} actividad(es) para ${escapeHtml(selectedTrimester().label)}</p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div class="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button type="button" data-grade-scope="pendientes" class="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition sm:gap-2 sm:px-4 sm:py-2 ${gradeScope === "pendientes" ? "bg-school-green text-white shadow-soft" : "text-slate-600 hover:bg-white"}">${icon("clipboard-clock", "h-3.5 w-3.5 sm:h-4 sm:w-4")}Pendientes</button>
              <button type="button" data-grade-scope="dia" class="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition sm:gap-2 sm:px-4 sm:py-2 ${gradeScope === "dia" ? "bg-school-green text-white shadow-soft" : "text-slate-600 hover:bg-white"}">${icon("sun", "h-3.5 w-3.5 sm:h-4 sm:w-4")}Hoy</button>
              <button type="button" data-grade-scope="semana" class="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition sm:gap-2 sm:px-4 sm:py-2 ${gradeScope === "semana" ? "bg-school-green text-white shadow-soft" : "text-slate-600 hover:bg-white"}">${icon("calendar-range", "h-3.5 w-3.5 sm:h-4 sm:w-4")}7 dias</button>
            </div>
            <button type="button" data-toggle-grade-ignore-attendance class="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition sm:rounded-2xl ${teacherState.gradeIgnoreAttendance ? "border-school-green bg-green-50 text-school-green" : "border-slate-200 bg-white text-slate-600 hover:border-school-green/40"}">
              <span class="grid h-4 w-7 place-items-center rounded-full ${teacherState.gradeIgnoreAttendance ? "bg-school-green" : "bg-slate-300"}"><span class="h-3 w-3 rounded-full bg-white transition ${teacherState.gradeIgnoreAttendance ? "translate-x-1.5" : "-translate-x-1.5"}"></span></span>
              Ignorar asistencia
            </button>
            <a href="#/docente/tareas" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-school-green sm:rounded-2xl">${icon("calendar-plus", "mr-1 inline h-3.5 w-3.5 sm:h-4 sm:w-4")}Agenda</a>
          </div>
        </div>
        <div class="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white sm:mt-5">
          ${activities.length ? `
            <div class="min-w-[470px] md:min-w-[620px] lg:min-w-0">
              <div class="grade-plan-grid bg-school-green text-white" style="--grade-days:${planningDates.length};">
                <div class="border-r border-white/15 px-1.5 py-2 text-center text-[10px] font-semibold uppercase tracking-[.05em] sm:px-3 sm:text-left"><span class="md:hidden">Mat.</span><span class="hidden md:inline">Materia</span></div>
                ${planningDates.map((dateKey) => {
                  const label = planningDayLabel(dateKey);
                  return `
                    <div class="border-r border-white/15 px-2 py-1.5 text-center last:border-r-0 sm:px-3">
                      <p class="text-[10px] font-medium text-white/80">${escapeHtml(label.date)}</p>
                      <p class="truncate text-[11px] font-semibold">${escapeHtml(label.day)}</p>
                    </div>
                  `;
                }).join("")}
              </div>
              <div>
                ${subjectsInView.map((subjectId, rowIndex) => {
                  const subject = findSubject(subjectId);
                  return `
                    <div class="grade-plan-grid min-h-14 border-b border-slate-200 last:border-b-0 sm:min-h-16 ${rowIndex % 2 ? "bg-white" : "bg-slate-50"}" style="--grade-days:${planningDates.length};">
                      <div class="flex min-w-0 items-center justify-center border-r border-slate-200 px-1.5 py-2 md:justify-start md:px-3">
                        <div class="min-w-0">
                          <p class="truncate text-center text-[9px] font-medium uppercase leading-tight text-slate-700 md:hidden" title="${escapeHtml(subject?.nombre || subjectId)}">${escapeHtml(compactSubjectName(subjectId, subject?.nombre || subjectId))}</p>
                          <p class="hidden truncate text-[11px] font-medium uppercase leading-tight text-slate-700 md:block" title="${escapeHtml(subject?.nombre || subjectId)}">${escapeHtml(subject?.nombre || subjectId)}</p>
                        </div>
                      </div>
                      ${planningDates.map((dateKey) => {
                        const cellActivities = activitiesBySubjectDate[subjectId]?.[dateKey] || [];
                        return `
                          <div class="min-h-14 border-r border-slate-200 p-1.5 last:border-r-0 sm:min-h-16">
                            ${cellActivities.length ? `
                              <div class="grid gap-1">
                                ${cellActivities.map((item) => {
                                  const active = item.id === teacherState.gradeModalActivityId;
                                  const courseItem = coursesById[item.cursoId] || {};
                                  const courseNumber = String(courseItem.corto || courseItem.nombre || "").replace(/\D/g, "") || "I";
                                  const accent = showCourse ? courseAccent(item.cursoId) : (subject?.color || "#e2e8f0");
                                  const background = showCourse ? "#ffffff" : (subject?.color || "#f8fafc");
                                  return `
                                    <button type="button" data-grade-activity="${item.id}" class="group flex w-full items-stretch overflow-hidden rounded-lg border bg-white text-left transition hover:-translate-y-0.5 hover:shadow-soft ${active ? "ring-2 ring-school-green/15" : ""}" style="border-color:${accent}; background:${background}">
                                      <span class="min-w-0 flex-1 px-2 py-1">
                                        <span class="block truncate text-[11px] font-medium leading-tight text-slate-900" title="${escapeHtml(item.titulo || "Sin titulo")}">${showCourse ? `${escapeHtml(courseItem.corto || courseItem.nombre || item.cursoId)} · ` : ""}${escapeHtml(item.titulo || "Sin titulo")}</span>
                                        <span class="block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
                                      </span>
                                      ${showCourse ? `<span class="grid w-7 shrink-0 place-items-center text-xs font-semibold text-white" style="background:${accent}">${escapeHtml(courseNumber)}</span>` : ""}
                                    </button>
                                  `;
                                }).join("")}
                              </div>
                            ` : ""}
                          </div>
                        `;
                      }).join("")}
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          ` : `<div class="w-full rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm font-medium text-slate-600">${escapeHtml(emptyActivityText)}</div>`}
        </div>
      </div>
      <div class="fixed inset-0 z-50 ${gradeModalOpen ? "flex" : "hidden"} items-center justify-center bg-slate-950/60 p-2 sm:p-4" data-student-grade-modal>
        <section class="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-[2rem]">
          ${activity ? (() => {
            const subject = findSubject(activity.materiaId);
            const accent = showCourse ? courseAccent(activity.cursoId) : (subject?.color || "#e2e8f0");
            const courseNumber = String(activityCourse?.corto || activityCourse?.nombre || "").replace(/\D/g, "") || "I";
            return `
              <div class="flex items-stretch border-b border-slate-100" style="border-color:${accent}">
                <div class="min-w-0 flex-1 px-3 py-2.5 sm:px-4" style="background:${subject?.color || "#fff"}">
                  <p class="truncate text-[10px] font-black uppercase tracking-[.12em] text-slate-500">${showCourse ? `${escapeHtml(activityCourse?.nombre || "")} · ` : ""}${isSaberActivity(activity) ? "Saber" : "Hacer"}</p>
                  <div class="mt-1 flex min-w-0 items-center gap-2">
                    <h3 class="truncate text-sm font-black text-slate-900 sm:text-lg">${escapeHtml(subject?.nombre || activity.materiaId)} - ${escapeHtml(activity.titulo || "Sin titulo")}</h3>
                    <span class="shrink-0 rounded-full bg-white/70 px-2 py-1 text-xs font-black text-school-navy">${activity.maximo || 100} pts</span>
                  </div>
                </div>
                ${showCourse ? `<span class="grid w-11 place-items-center text-lg font-black text-white sm:w-14 sm:text-2xl" style="background:${accent}">${escapeHtml(courseNumber)}</span>` : ""}
              </div>
            `;
          })() : ""}
          <div class="flex items-center justify-between gap-2 bg-school-navy px-3 py-2.5 text-white sm:px-4">
            <div class="min-w-0">
              <p class="text-[10px] font-black uppercase tracking-[.14em] text-white/70">${studentsToGrade.length} habilitados · ${gradedStudents.length} calificados</p>
              <h3 class="truncate text-sm font-black sm:text-lg">${teacherState.gradeMode === "lista" ? "Modo lista" : (currentStudent ? escapeHtml(currentStudent.nombre) : "Modo guiado")}</h3>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <div class="flex rounded-xl bg-white/10 p-1">
                <button type="button" data-grade-mode="guiado" class="rounded-lg px-2.5 py-1.5 text-[11px] font-black transition ${teacherState.gradeMode === "guiado" ? "bg-white text-school-navy" : "text-white/80 hover:bg-white/10"}">Guiado</button>
                <button type="button" data-grade-mode="lista" class="rounded-lg px-2.5 py-1.5 text-[11px] font-black transition ${teacherState.gradeMode === "lista" ? "bg-white text-school-navy" : "text-white/80 hover:bg-white/10"}">Lista</button>
              </div>
              <button type="button" class="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white" data-close-student-grade>${icon("x", "h-5 w-5")}</button>
            </div>
          </div>
          ${studentsNotEnabled.length ? `
            <details class="mx-3 mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-bold text-amber-800 sm:mx-4 sm:text-sm">
              <summary class="cursor-pointer font-black">${studentsNotEnabled.length} alumno(s) ausentes. Clic para ver.</summary>
              <div class="mt-2 grid gap-1.5 sm:grid-cols-2">
                ${studentsNotEnabled.map((student) => `<div class="rounded-lg bg-white/70 px-2.5 py-1.5">${escapeHtml(studentOrderMap.get(student.id) || "-")}. ${escapeHtml(student.nombre)} · ${attendanceLabel(attendanceMap[student.id]?.estado || "falta")}</div>`).join("")}
              </div>
            </details>
          ` : ""}
          ${activity ? `
            <div class="grid min-h-0 flex-1 gap-2 overflow-hidden p-2 sm:gap-3 sm:p-3 ${teacherState.gradeMode === "lista" ? "" : "lg:grid-cols-[140px_1fr]"}">
              ${teacherState.gradeMode === "lista" ? "" : `
                <aside class="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 sm:rounded-2xl">
                  <p class="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Calificados</p>
                  <div class="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto lg:block lg:max-h-none lg:space-y-1.5">
                    ${gradedStudents.map((student) => {
                      const grade = gradesMap[student.id];
                      const result = normalizeGrade(grade?.valor, activity.maximo);
                      const didNotSubmit = grade && Number(grade.valor || 0) === 0;
                      const lowGrade = result && Number(result.porcentaje || 0) < 50;
                      const tone = didNotSubmit
                        ? "border-purple-200 bg-purple-50 text-purple-800"
                        : lowGrade
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-green-200 bg-green-50 text-green-800";
                      const badgeTone = didNotSubmit
                        ? "bg-purple-600 text-white"
                        : lowGrade
                          ? "bg-red-600 text-white"
                          : "bg-green-600 text-white";
                      return `<button type="button" data-open-student-grade="${student.id}" class="inline-flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-[11px] font-black lg:w-full ${tone}">
                        <span class="grid h-6 w-6 place-items-center rounded-md ${badgeTone}">${escapeHtml(studentOrderMap.get(student.id) || "-")}</span>
                        <span class="hidden min-w-0 flex-1 truncate text-left lg:block">${escapeHtml(student.nombre)}</span>
                        <span>${didNotSubmit ? "Ø" : (result?.nota ?? "-")}</span>
                      </button>`;
                    }).join("") || `<p class="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-400">Aun no hay calificados.</p>`}
                  </div>
                </aside>
              `}
              <div class="min-h-0 overflow-y-auto">
                ${teacherState.gradeMode === "lista" ? `
                  <div class="grade-list-shell min-h-0 ${listPickerStudent ? "has-picker" : ""}">
                    <div class="grade-list-rows min-h-0 space-y-1.5 overflow-y-auto sm:space-y-2">
                      ${studentsToGrade.map((student) => {
                        const studentOrder = studentOrderMap.get(student.id) || "-";
                        const grade = gradesMap[student.id];
                        const result = grade ? normalizeGrade(grade.valor, activity.maximo) : null;
                        const didNotSubmit = grade && Number(grade.valor || 0) === 0;
                        const lowGrade = result && Number(result.porcentaje || 0) < 50;
                        const gradeTone = didNotSubmit || lowGrade
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-green-200 bg-green-50 text-green-800";
                        const compactName = String(student.nombre || "").split(/\s+/).filter(Boolean)[0] || student.nombre;
                        const selected = listPickerStudent?.id === student.id;
                        return `
                          <button type="button" data-list-student-grade="${student.id}" class="grid w-full items-center gap-1.5 rounded-xl border bg-white p-1.5 text-left transition-all duration-500 hover:border-school-navy/40 hover:bg-school-sky/40 sm:gap-2 sm:p-2 ${selected ? "border-school-navy ring-4 ring-school-navy/10" : "border-slate-200"} ${listPickerStudent ? "grid-cols-[28px_1fr_auto]" : "grid-cols-[34px_1fr_auto]"}">
                            <span class="grid place-items-center rounded-lg ${grade ? "bg-green-600 text-white" : "bg-school-sky text-school-navy"} text-xs font-black sm:text-sm ${listPickerStudent ? "h-7 w-7" : "h-8 w-8"}">${escapeHtml(studentOrder)}</span>
                            <div class="min-w-0">
                              <p class="truncate text-[11px] font-bold text-slate-900 sm:text-sm">${escapeHtml(listPickerStudent ? compactName : student.nombre)}</p>
                              <p class="text-[10px] font-bold text-slate-400 ${listPickerStudent ? "hidden" : ""}">${grade ? "Tocar para cambiar" : "Tocar para calificar"}</p>
                            </div>
                            ${grade ? `
                              <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${gradeTone}">
                                ${didNotSubmit ? `${icon("ban", "h-4 w-4")}<span class="${listPickerStudent ? "hidden xl:inline" : ""}">No presento</span>` : `${result?.nota ?? "-"}`}
                              </span>
                            ` : `<span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-400">${listPickerStudent ? "-" : "Pendiente"}</span>`}
                          </button>
                        `;
                      }).join("")}
                    </div>
                    ${listPickerStudent ? (() => {
                      const subject = findSubject(activity.materiaId);
                      const accent = showCourse ? courseAccent(activity.cursoId) : (subject?.color || "#e2e8f0");
                      const courseNumber = String(activityCourse?.corto || activityCourse?.nombre || "").replace(/\D/g, "") || "I";
                      return `
                        <section class="grade-list-panel min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
                          <div class="flex items-stretch border-b border-slate-100" style="border-color:${accent}">
                            <div class="min-w-0 flex-1 px-4 py-3" style="background:${subject?.color || "#fff"}">
                              <p class="truncate text-[10px] font-black uppercase tracking-[.12em] text-slate-500">${showCourse ? `${escapeHtml(activityCourse?.nombre || "")} · ` : ""}${escapeHtml(subject?.nombre || activity.materiaId)}</p>
                              <h4 class="mt-1 truncate text-base font-black text-slate-900">${escapeHtml(activity.titulo || "Sin titulo")}</h4>
                            </div>
                            ${showCourse ? `<span class="grid w-12 place-items-center text-xl font-black text-white" style="background:${accent}">${escapeHtml(courseNumber)}</span>` : ""}
                          </div>
                          <div class="min-h-0 overflow-y-auto p-3 sm:p-4">
                            <div class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <div class="min-w-0">
                                <p class="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">Alumno</p>
                                <h5 class="truncate text-base font-black text-slate-900">${escapeHtml(listPickerStudent.nombre)}</h5>
                              </div>
                              <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-school-sky text-lg font-black text-school-navy">${escapeHtml(studentOrderMap.get(listPickerStudent.id) || "-")}</span>
                            </div>
                            <p class="mt-3 text-center text-xs font-black text-slate-500">Puntaje sobre ${activity.maximo || 100}</p>
                            <div class="mt-3 grid max-h-[44vh] grid-cols-5 gap-2 overflow-y-auto pr-1 sm:grid-cols-8 lg:grid-cols-6 xl:grid-cols-8">
                              ${Array.from({ length: Math.min(Number(activity.maximo || 100), 100) }, (_, index) => index + 1).map((value) => {
                                const selected = Number(listPickerGrade?.valor) === value;
                                const result = normalizeGrade(value, activity.maximo);
                                const low = Number(result?.porcentaje || 0) < 50;
                                return `<button type="button" data-list-grade-auto="${value}" class="grid h-9 place-items-center rounded-lg border text-sm font-black transition sm:h-10 sm:rounded-xl sm:text-base ${selected ? "border-green-600 bg-green-600 text-white" : low ? "border-red-200 bg-red-50 text-red-700 hover:border-red-400" : "border-slate-200 bg-slate-100 text-slate-700 hover:border-school-navy hover:bg-school-sky"}">${value}</button>`;
                              }).join("")}
                            </div>
                            <div class="mt-3 grid grid-cols-[1fr_auto] gap-2">
                              <button type="button" data-list-grade-no-work="${listPickerStudent.id}" class="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-black text-red-700">${icon("ban", "mr-1 inline h-4 w-4")}No hizo su tarea</button>
                              <button type="button" data-close-list-grade class="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-600">Cerrar</button>
                            </div>
                            <p class="mt-3 hidden rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-black text-green-700" data-list-grade-status></p>
                          </div>
                        </section>
                      `;
                    })() : ""}
                  </div>
                ` : currentStudent ? `
                  <div class="text-center">
                    <div class="flex items-center justify-center gap-3">
                      <div class="grid h-12 w-12 place-items-center rounded-xl bg-school-sky text-xl font-black text-school-navy">${escapeHtml(studentOrderMap.get(currentStudent.id) || teacherState.gradeIndex + 1)}</div>
                      <div class="min-w-0 text-left">
                        <p class="text-[11px] font-black uppercase tracking-[.12em] text-slate-400">Alumno ${teacherState.gradeIndex + 1} de ${studentsToGrade.length}</p>
                        <h4 class="truncate text-lg font-black text-slate-900 sm:text-2xl">${escapeHtml(currentStudent.nombre)}</h4>
                      </div>
                    </div>
                    <p class="mt-2 text-xs font-black text-slate-500 sm:text-sm">Nota sobre ${activity.maximo || 100}. Avanza apenas termina de guardar.</p>
                    <div class="mt-3 grid max-h-[46vh] grid-cols-5 gap-2 overflow-y-auto pr-1 sm:grid-cols-8 lg:grid-cols-10">
                      ${Array.from({ length: Math.min(Number(activity.maximo || 100), 100) + 1 }, (_, value) => {
                        const selected = Number(currentGrade?.valor) === value;
                        return `<button type="button" data-date-grade-auto="${value}" class="grid h-9 min-w-0 place-items-center rounded-lg border text-sm font-black transition sm:h-11 sm:rounded-xl sm:text-base ${selected ? "border-green-600 bg-green-600 text-white" : "border-slate-200 bg-slate-100 text-slate-700 hover:border-school-navy hover:bg-school-sky"}">${value}</button>`;
                      }).join("")}
                    </div>
                    <div class="mt-3 grid grid-cols-3 gap-2">
                      <button type="button" data-date-grade-prev class="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-black text-school-navy">${icon("chevron-left", "mr-1 inline h-4 w-4")}Anterior</button>
                      <button type="button" data-grade-no-work="${currentStudent.id}" class="rounded-xl border border-red-200 bg-red-50 px-2 py-2 text-xs font-black text-red-700">${icon("x-circle", "mr-1 inline h-4 w-4")}No hizo</button>
                      <button type="button" data-date-grade-next class="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-black text-school-navy">Siguiente${icon("chevron-right", "ml-1 inline h-4 w-4")}</button>
                    </div>
                    <p class="mt-3 hidden rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-black text-green-700" data-auto-grade-status></p>
                  </div>
                ` : `<div>${emptyState("Todo calificado", "No quedan alumnos pendientes para esta actividad.")}</div>`}
              </div>
            </div>
          ` : ""}
        </section>
      </div>
    </section>
  `;

  container.querySelectorAll("[data-grade-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.gradeScope = ["pendientes", "semana"].includes(button.dataset.gradeScope) ? button.dataset.gradeScope : "dia";
      teacherState.gradeModalActivityId = "";
      teacherState.gradeStudentId = "";
      teacherState.gradeIndex = 0;
      teacherState.gradeModalClosed = true;
      sessionStorage.setItem("docenteCalificarVista", teacherState.gradeScope);
      renderDateGrading(context);
    });
  });
  container.querySelectorAll("[data-grade-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.gradeMode = button.dataset.gradeMode === "lista" ? "lista" : "guiado";
      sessionStorage.setItem("docenteCalificarModo", teacherState.gradeMode);
      renderDateGrading(context);
    });
  });
  container.querySelector("[data-toggle-grade-ignore-attendance]")?.addEventListener("click", () => {
    teacherState.gradeIgnoreAttendance = !teacherState.gradeIgnoreAttendance;
    sessionStorage.setItem("docenteCalificarIgnorarAsistencia", teacherState.gradeIgnoreAttendance ? "1" : "0");
    teacherState.gradeStudentId = "";
    teacherState.gradeIndex = 0;
    renderDateGrading(context);
  });
  container.querySelectorAll("[data-grade-activity]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.gradeModalActivityId = button.dataset.gradeActivity;
      teacherState.gradeStudentId = "";
      teacherState.gradeIndex = 0;
      teacherState.gradeMode = "lista";
      sessionStorage.setItem("docenteCalificarModo", "lista");
      teacherState.gradeModalClosed = false;
      renderDateGrading(context);
    });
  });
  container.querySelector("[data-delete-selected-activity]")?.addEventListener("click", async () => {
    if (!activity) return;
    const detail = `${activity.tipo || "Actividad"}: ${activity.titulo || "Sin titulo"}\nFecha: ${activity.fecha || ""}`;
    if (!confirm(`Esta seguro que desea eliminar esta actividad?\n\n${detail}`)) return;
    try {
      await deleteActivity(activity);
      teacherState.gradeModalActivityId = "";
      teacherState.gradeStudentId = "";
      teacherState.gradeIndex = 0;
      teacherState.gradeModalClosed = true;
      await renderDateGrading(context);
    } catch (error) {
      alert(error?.code === "permission-denied" ? "Sin permiso para eliminar actividad." : error.message);
    }
  });
  container.querySelectorAll("[data-open-student-grade]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.gradeStudentId = button.dataset.openStudentGrade;
      teacherState.gradeIndex = Math.max(studentsToGrade.findIndex((student) => student.id === teacherState.gradeStudentId), 0);
      teacherState.gradeMode = "guiado";
      sessionStorage.setItem("docenteCalificarModo", "guiado");
      teacherState.gradeModalClosed = false;
      renderDateGrading(context);
    });
  });
  container.querySelectorAll("[data-list-student-grade]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.gradeStudentId = button.dataset.listStudentGrade;
      teacherState.gradeIndex = Math.max(studentsToGrade.findIndex((student) => student.id === teacherState.gradeStudentId), 0);
      teacherState.gradeMode = "lista";
      sessionStorage.setItem("docenteCalificarModo", "lista");
      teacherState.gradeModalClosed = false;
      renderDateGrading(context);
    });
  });
  container.querySelector("[data-close-list-grade]")?.addEventListener("click", () => {
    teacherState.gradeStudentId = "";
    renderDateGrading(context);
  });
  container.querySelector("[data-list-grade-picker]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-list-grade-picker]")) {
      teacherState.gradeStudentId = "";
      renderDateGrading(context);
    }
  });
  container.querySelector("[data-close-student-grade]")?.addEventListener("click", () => {
    teacherState.gradeStudentId = "";
    teacherState.gradeModalClosed = true;
    renderDateGrading(context);
  });
  container.querySelector("[data-student-grade-modal]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-student-grade-modal]")) {
      teacherState.gradeStudentId = "";
      teacherState.gradeModalClosed = true;
      renderDateGrading(context);
    }
  });
  container.querySelector("[data-date-grade-prev]")?.addEventListener("click", () => {
    teacherState.gradeIndex = Math.max(teacherState.gradeIndex - 1, 0);
    renderDateGrading(context);
  });
  container.querySelector("[data-date-grade-next]")?.addEventListener("click", () => {
    teacherState.gradeIndex = Math.min(teacherState.gradeIndex + 1, Math.max(studentsToGrade.length - 1, 0));
    renderDateGrading(context);
  });
  container.querySelectorAll("[data-date-grade-quick]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = container.querySelector("[data-date-grade-value]");
      if (!input) return;
      input.value = button.dataset.dateGradeQuick;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  container.querySelectorAll("[data-date-grade-auto]").forEach((button) => {
    button.addEventListener("click", async () => {
      const student = currentStudent;
      const value = button.dataset.dateGradeAuto;
      const status = container.querySelector("[data-auto-grade-status]");
      if (!student || !activity) return;

      container.querySelectorAll("[data-date-grade-auto]").forEach((item) => {
        item.disabled = true;
        item.classList.add("opacity-60");
      });
      if (status) {
        const result = normalizeGrade(value, activity.maximo);
        status.classList.remove("hidden", "border-red-200", "bg-red-50", "text-red-700");
        status.classList.add("border-green-200", "bg-green-50", "text-green-700");
        status.textContent = `Guardando nota ${result?.nota ?? value}...`;
      }

      try {
        const savedGrade = await saveGrade({ activity, student, value });
        upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
        if (status) status.textContent = "Nota guardada";
        const nextStudent = studentsToGrade.find((item, index) => index > teacherState.gradeIndex && item.id !== student.id && !gradesMap[item.id]) || null;
        teacherState.gradeStudentId = nextStudent?.id || "";
        teacherState.gradeIndex = nextStudent ? studentsToGrade.findIndex((item) => item.id === nextStudent.id) : Math.max(studentsToGrade.length - 1, 0);
        teacherState.gradeModalClosed = !nextStudent;
        await renderDateGrading(context);
      } catch (error) {
        if (status) {
          status.classList.remove("border-green-200", "bg-green-50", "text-green-700");
          status.classList.add("border-red-200", "bg-red-50", "text-red-700");
          status.textContent = error?.code === "permission-denied" ? "Sin permiso para guardar nota." : error.message;
        } else {
          alert(error?.code === "permission-denied" ? "Sin permiso para guardar nota." : error.message);
        }
        container.querySelectorAll("[data-date-grade-auto]").forEach((item) => {
          item.disabled = false;
          item.classList.remove("opacity-60");
        });
      }
    });
  });
  container.querySelector("[data-grade-no-work]")?.addEventListener("click", async (event) => {
    const student = studentsToGrade.find((item) => item.id === event.currentTarget.dataset.gradeNoWork);
    if (!student || !activity) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const savedGrade = await saveGrade({ activity, student, value: 0 });
      upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
      const nextStudent = studentsToGrade.find((item, index) => index > teacherState.gradeIndex && item.id !== student.id && !gradesMap[item.id]) || null;
      teacherState.gradeStudentId = nextStudent?.id || "";
      teacherState.gradeIndex = nextStudent ? studentsToGrade.findIndex((item) => item.id === nextStudent.id) : Math.max(studentsToGrade.length - 1, 0);
      teacherState.gradeModalClosed = !nextStudent;
      await renderDateGrading(context);
    } catch (error) {
      alert(error?.code === "permission-denied" ? "Sin permiso para guardar nota." : error.message);
      button.disabled = false;
    }
  });
  container.querySelectorAll("[data-list-grade-auto]").forEach((button) => {
    button.addEventListener("click", async () => {
      const student = listPickerStudent;
      const value = button.dataset.listGradeAuto;
      const status = container.querySelector("[data-list-grade-status]");
      if (!student || !activity) return;
      container.querySelectorAll("[data-list-grade-auto], [data-list-grade-no-work]").forEach((item) => {
        item.disabled = true;
        item.classList.add("opacity-60");
      });
      if (status) {
        const result = normalizeGrade(value, activity.maximo);
        status.classList.remove("hidden", "border-red-200", "bg-red-50", "text-red-700");
        status.classList.add("border-green-200", "bg-green-50", "text-green-700");
        status.textContent = `Guardando nota ${result?.nota ?? value}...`;
      }
      try {
        const savedGrade = await saveGrade({ activity, student, value });
        upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
        if (status) status.textContent = "Nota guardada";
        teacherState.gradeStudentId = "";
        await renderDateGrading(context);
      } catch (error) {
        if (status) {
          status.classList.remove("border-green-200", "bg-green-50", "text-green-700");
          status.classList.add("border-red-200", "bg-red-50", "text-red-700");
          status.textContent = error?.code === "permission-denied" ? "Sin permiso para guardar nota." : error.message;
        } else {
          alert(error?.code === "permission-denied" ? "Sin permiso para guardar nota." : error.message);
        }
        container.querySelectorAll("[data-list-grade-auto], [data-list-grade-no-work]").forEach((item) => {
          item.disabled = false;
          item.classList.remove("opacity-60");
        });
      }
    });
  });
  container.querySelector("[data-list-grade-no-work]")?.addEventListener("click", async (event) => {
    const student = studentsToGrade.find((item) => item.id === event.currentTarget.dataset.listGradeNoWork);
    const status = container.querySelector("[data-list-grade-status]");
    if (!student || !activity) return;
    container.querySelectorAll("[data-list-grade-auto], [data-list-grade-no-work]").forEach((item) => {
      item.disabled = true;
      item.classList.add("opacity-60");
    });
    if (status) {
      status.classList.remove("hidden", "border-red-200", "bg-red-50", "text-red-700");
      status.classList.add("border-green-200", "bg-green-50", "text-green-700");
      status.textContent = "Guardando como no presentado...";
    }
    try {
      const savedGrade = await saveGrade({ activity, student, value: 0 });
      upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
      teacherState.gradeStudentId = "";
      await renderDateGrading(context);
    } catch (error) {
      if (status) {
        status.classList.remove("border-green-200", "bg-green-50", "text-green-700");
        status.classList.add("border-red-200", "bg-red-50", "text-red-700");
        status.textContent = error?.code === "permission-denied" ? "Sin permiso para guardar nota." : error.message;
      } else {
        alert(error?.code === "permission-denied" ? "Sin permiso para guardar nota." : error.message);
      }
      container.querySelectorAll("[data-list-grade-auto], [data-list-grade-no-work]").forEach((item) => {
        item.disabled = false;
        item.classList.remove("opacity-60");
      });
    }
  });
  container.querySelector("[data-date-grade-value]")?.addEventListener("input", (event) => {
    const result = normalizeGrade(event.target.value, activity?.maximo);
    const final = container.querySelector("[data-date-grade-final]");
    if (final) {
      final.textContent = result?.nota ?? "-";
      final.className = `mt-2 text-4xl font-black ${Number(result?.nota || 0) <= 50 ? "text-red-600" : "text-green-700"}`;
    }
  });
  container.querySelector("[data-save-date-grade]")?.addEventListener("click", async (buttonEvent) => {
    const button = buttonEvent.currentTarget;
    const student = studentsToGrade.find((item) => item.id === button.dataset.saveDateGrade);
    const input = container.querySelector("[data-date-grade-value]");
    if (!student || !activity || !input) return;
    button.disabled = true;
    try {
      const savedGrade = await saveGrade({ activity, student, value: input.value });
      upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
      const nextStudent = studentsToGrade[teacherState.gradeIndex + 1] || null;
      teacherState.gradeStudentId = nextStudent?.id || "";
      teacherState.gradeIndex = nextStudent ? teacherState.gradeIndex + 1 : Math.max(studentsToGrade.length - 1, 0);
      teacherState.gradeModalClosed = !nextStudent;
      await renderDateGrading(context);
    } catch (error) {
      alert(error?.code === "permission-denied" ? "Sin permiso para guardar nota." : error.message);
      button.disabled = false;
    }
  });
  refreshIcons();
}

function notesCriterionModal(criterion = null) {
  if (!teacherState.notesCriterionOpen) return "";
  const isEditing = Boolean(criterion);
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6">
      <section class="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p class="text-[11px] font-black uppercase tracking-[.18em] text-school-green">SER</p>
            <h3 class="text-lg font-black text-slate-900">${isEditing ? "Editar casillero" : "Nuevo casillero"}</h3>
          </div>
          <button type="button" data-close-notes-modal class="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200">${icon("x", "h-5 w-5")}</button>
        </div>
        <form data-ser-criterion-form class="space-y-4 p-5">
          <label class="block">
            <span class="text-xs font-black uppercase tracking-[.14em] text-slate-500">Titulo</span>
            <input name="titulo" required value="${escapeHtml(criterion?.titulo || "")}" class="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-school-green" placeholder="Participacion, respeto, honestidad">
          </label>
          <label class="block">
            <span class="text-xs font-black uppercase tracking-[.14em] text-slate-500">Nota maxima</span>
            <input name="maximo" required type="number" min="1" max="100" value="${escapeHtml(criterion?.maximo || 10)}" class="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-school-green" placeholder="10">
          </label>
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            ${isEditing ? `<button type="button" data-delete-ser-criterion class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700 hover:bg-red-100">Eliminar</button>` : `<span></span>`}
            <div class="flex gap-2">
              <button type="button" data-close-notes-modal class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="submit" class="rounded-2xl bg-school-green px-5 py-3 text-sm font-black text-white shadow-soft hover:bg-school-navy">${isEditing ? "Guardar" : "Crear"}</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  `;
}

function notesGradeModal({ activity, student, currentGrade, totalStudents = 0, currentIndex = 0 }) {
  if (!teacherState.notesGradeStudentId || !activity || !student) return "";
  const max = Math.max(1, Math.min(100, Number(activity.maximo || 5)));
  const values = Array.from({ length: max }, (_, index) => index + 1);
  const isAuto = teacherState.notesGradeKind === "auto";
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-3 py-5">
      <section class="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="border-b border-slate-100 px-5 py-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-[11px] font-black uppercase tracking-[.18em] text-school-green">${isAuto ? "Autoevaluacion" : "SER"}</p>
              <p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(activity.titulo || "Nota")}</p>
              <h3 class="mt-1 text-2xl font-black leading-tight text-slate-950">${escapeHtml(currentIndex + 1)}. ${escapeHtml(student.nombre)}</h3>
            </div>
            <button type="button" data-close-notes-modal class="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200">${icon("x", "h-5 w-5")}</button>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-school-sky px-3 py-1 text-xs font-black text-school-navy">Sobre ${max}</span>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Alumno ${currentIndex + 1} de ${totalStudents}</span>
            <button type="button" data-toggle-notes-guided class="rounded-full px-3 py-1 text-xs font-black transition ${teacherState.notesGradeGuided ? "bg-school-green text-white" : "bg-slate-100 text-slate-600"}">Modo guiado</button>
          </div>
        </div>
        <div class="p-5">
          <div class="grid grid-cols-5 gap-2 sm:grid-cols-10">
            ${values.map((value) => {
              const active = Number(currentGrade?.valor) === value;
              return `<button type="button" data-note-grade-value="${value}" class="rounded-2xl border px-2 py-3 text-sm font-black transition ${active ? "border-school-green bg-school-green text-white shadow-soft" : "border-slate-200 bg-slate-50 text-slate-800 hover:border-school-green hover:bg-green-50"}">${value}</button>`;
            }).join("")}
          </div>
          <p class="mt-4 hidden rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-black text-green-700" data-notes-grade-status>Guardando...</p>
        </div>
      </section>
    </div>
  `;
}

function closeNotesModals() {
  teacherState.notesCriterionId = "";
  teacherState.notesCriterionOpen = false;
  teacherState.notesGradeActivityId = "";
  teacherState.notesGradeStudentId = "";
  teacherState.notesGradeKind = "";
}

function regularizationActivityLabel(activity) {
  const subject = findSubject(activity?.materiaId);
  const date = activity?.fecha ? activity.fecha.split("-").reverse().join("/") : "Sin fecha";
  const type = activity?.tipo === "examen" || activity?.tipo === "saber" ? "SABER" : "HACER";
  return `${subject?.corto || subject?.nombre || activity?.materiaId || "Materia"} · ${type} · ${date}`;
}

function regularizationCourseTabs(context, course) {
  if ((context?.courses || []).length <= 1) {
    return `<div class="inline-flex items-center gap-1 rounded-lg bg-school-sky px-2 py-1 text-[10px] font-black text-school-navy sm:gap-2 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs">${icon("users-round", "h-3.5 w-3.5 sm:h-4 sm:w-4")} ${escapeHtml(course?.nombre || "Curso")}</div>`;
  }
  return `
    <div class="flex gap-1.5 overflow-x-auto pb-1 sm:gap-2">
      ${context.courses.map((item) => {
        const active = item.id === course?.id;
        return `
          <button type="button" data-regularization-course="${item.id}" class="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-black transition sm:gap-2 sm:rounded-xl sm:px-3.5 sm:py-2 sm:text-xs ${active ? "border-school-green bg-school-green text-white shadow-soft" : "border-slate-200 bg-white text-slate-700 hover:border-school-green/50"}">
            ${icon("users-round", "h-3.5 w-3.5 sm:h-4 sm:w-4")} ${escapeHtml(item.nombre)}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function regularizationStudentCard(student, items, tone = "red", displayNumber = "-") {
  const toneClass = tone === "amber"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-red-200 bg-red-50 text-red-800";
  const subjects = [...new Set(items.map((item) => {
    const subject = findSubject(item.materiaId);
    return subject?.corto || subject?.nombre || item.materiaId;
  }).filter(Boolean))];
  return `
    <details class="group rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition hover:border-school-green/40">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-school-sky text-[10px] font-black text-school-navy">${escapeHtml(displayNumber)}</span>
            <h4 class="truncate text-xs font-semibold text-slate-900">${escapeHtml(student.nombre)}</h4>
          </div>
          <div class="mt-1 flex flex-wrap gap-1">
            ${subjects.slice(0, 4).map((subject) => `<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">${escapeHtml(subject)}</span>`).join("")}
          </div>
        </div>
        <span class="shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-black ${toneClass}">${items.length}</span>
      </summary>
      <div class="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
        ${items.map((item) => `
          <button type="button" data-regularization-grade-activity="${item.id}" data-regularization-grade-student="${student.id}" class="block w-full rounded-lg bg-slate-50 px-2.5 py-1.5 text-left transition hover:bg-green-50 hover:ring-1 hover:ring-school-green">
            <span class="block truncate text-[11px] font-semibold text-slate-900">${escapeHtml(item.titulo || "Actividad")}</span>
            <span class="mt-0.5 block text-[10px] font-semibold text-slate-500">${escapeHtml(regularizationActivityLabel(item))}${item.pendienteMotivo ? ` · ${escapeHtml(item.pendienteMotivo)}` : ""}${item.nota ? ` · Nota ${item.nota}` : ""}</span>
          </button>
        `).join("")}
      </div>
    </details>
  `;
}

function regularizationPendingTable(rows, studentOrderMap = new Map()) {
  if (!rows.length) {
    return `<div class="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-[11px] font-bold text-slate-400 sm:rounded-2xl sm:text-xs">Sin alumnos</div>`;
  }
  return `
    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white sm:rounded-2xl">
      <table class="w-full table-fixed text-left text-[10px] sm:text-[11px]">
        <thead class="bg-slate-50 text-[10px] font-black text-slate-500">
          <tr>
            <th class="w-9 px-1.5 py-1.5 sm:w-12 sm:px-3 sm:py-2">N°</th>
            <th class="px-1.5 py-1.5 sm:px-2 sm:py-2">Alumno</th>
            <th class="w-10 px-1.5 py-1.5 text-center sm:w-12 sm:px-3 sm:py-2">Pend.</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${rows.map(({ student, items }) => {
            const firstSubject = findSubject(items[0]?.materiaId);
            const hasAbsent = items.some((item) => item.pendienteMotivo === "Ausente");
            const numberTone = hasAbsent ? "bg-amber-50 text-amber-700" : "bg-green-50 text-school-green";
            const displayNumber = studentOrderMap.get(student.id) || "-";
            return `
              <tr class="hover:bg-slate-50">
                <td class="px-1.5 py-1.5 align-top sm:px-3 sm:py-2">
                  <span class="grid h-6 w-6 place-items-center rounded-md ${numberTone} font-black sm:h-7 sm:w-7 sm:rounded-lg">${escapeHtml(displayNumber)}</span>
                </td>
                <td class="min-w-0 px-1.5 py-1.5 sm:px-2 sm:py-2">
                  <details>
                    <summary class="cursor-pointer list-none">
                      <p class="truncate font-bold text-slate-800 sm:font-black">${escapeHtml(student.nombre)}</p>
                      <p class="mt-0.5 truncate text-[10px] font-bold text-slate-400">${escapeHtml(firstSubject?.corto || firstSubject?.nombre || "Materia")}</p>
                    </summary>
                    <div class="mt-1.5 space-y-1">
                      ${items.map((item) => `
                        <button type="button" data-regularization-grade-activity="${item.id}" data-regularization-grade-student="${student.id}" class="block w-full rounded-md bg-slate-50 px-1.5 py-1 text-left transition hover:bg-green-50 hover:ring-1 hover:ring-school-green sm:rounded-lg sm:px-2">
                          <p class="truncate font-bold text-slate-700">${escapeHtml(item.titulo || "Actividad")}</p>
                          <p class="text-[10px] font-semibold text-slate-400">${escapeHtml(item.pendienteMotivo || "Pendiente")} · ${escapeHtml(regularizationActivityLabel(item))}</p>
                        </button>
                      `).join("")}
                    </div>
                  </details>
                </td>
                <td class="px-1.5 py-1.5 text-center align-top sm:px-3 sm:py-2">
                  <span class="inline-flex min-w-5 justify-center rounded-md bg-red-50 px-1.5 py-0.5 font-black text-red-600 sm:min-w-6 sm:rounded-lg sm:px-2 sm:py-1">${items.length}</span>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function regularizationGradeModal({ activity, student, currentGrade, displayNumber = "" }) {
  if (!activity || !student) return "";
  const subject = findSubject(activity.materiaId);
  const max = Math.max(1, Math.min(100, Number(activity.maximo || 100)));
  const quickValues = max <= 20 ? Array.from({ length: max }, (_, index) => index + 1) : [];
  const currentValue = Number(currentGrade?.valor || "");
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-3 py-5">
      <section class="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="bg-school-green px-4 py-3 text-white">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[10px] font-black uppercase tracking-[.16em] text-white/75">Regularizacion</p>
              <h3 class="mt-0.5 truncate text-lg font-black">${escapeHtml(displayNumber)}. ${escapeHtml(student.nombre)}</h3>
              <p class="mt-1 truncate text-xs font-bold text-white/80">${escapeHtml(subject?.nombre || activity.materiaId)} · ${escapeHtml(activity.titulo || "Actividad")}</p>
            </div>
            <button type="button" data-close-regularization-grade class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20">${icon("x", "h-5 w-5")}</button>
          </div>
        </div>
        <div class="space-y-3 p-4">
          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p class="text-[11px] font-black uppercase tracking-[.14em] text-slate-400">Nota maxima</p>
            <p class="text-xl font-black text-slate-900">${max}</p>
          </div>
          ${quickValues.length ? `
            <div class="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
              ${quickValues.map((value) => `
                <button type="button" data-regularization-grade-value="${value}" class="rounded-xl border px-2 py-2 text-xs font-black transition ${currentValue === value ? "border-school-green bg-school-green text-white" : "border-slate-200 bg-white text-slate-700 hover:border-school-green hover:bg-green-50"}">${value}</button>
              `).join("")}
            </div>
          ` : `
            <label class="block">
              <span class="text-xs font-black uppercase tracking-[.14em] text-slate-400">Puntaje obtenido</span>
              <input type="number" min="0" max="${max}" value="${currentValue || ""}" data-regularization-grade-input class="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-center text-xl font-black outline-none focus:border-school-green">
            </label>
            <button type="button" data-save-regularization-grade-input class="w-full rounded-2xl bg-school-green px-4 py-3 text-sm font-black text-white">Guardar nota</button>
          `}
          <button type="button" data-regularization-grade-value="0" class="w-full rounded-2xl border border-red-100 bg-red-50 px-4 py-2.5 text-xs font-black text-red-700 transition hover:bg-red-100">No presento</button>
          <p class="hidden rounded-2xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-black text-green-700" data-regularization-grade-status>Guardando...</p>
        </div>
      </section>
    </div>
  `;
}

async function renderRegularization(context) {
  const container = document.querySelector("[data-teacher-regularization]");
  const course = selectedCourse(context);
  if (!container) return;
  if (!course) {
    container.innerHTML = emptyState("Sin cursos asignados", "Admin debe asignarte un curso antes de revisar regularizacion.");
    return;
  }

  const cacheMeta = getTeacherDataCacheMeta(context, "notas", course.id, teacherState.trimesterId);
  const snapshot = await getTeacherNotesSnapshot(context, course, teacherState.trimesterId);
  if (!snapshot) {
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
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
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
      <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <p class="text-xs font-black uppercase tracking-[.18em] text-school-green">${escapeHtml(course.nombre)} · ${escapeHtml(selectedTrimester().label)}</p>
        <h2 class="mt-1 text-2xl font-black text-slate-900">Regularizacion</h2>
        <p class="mt-2 max-w-2xl font-semibold text-slate-500">Carga las notas del curso para detectar estudiantes con actividades no presentadas o notas bajas.</p>
        <button type="button" data-refresh-regularization-cache class="mt-4 inline-flex items-center gap-2 rounded-2xl bg-school-green px-4 py-3 text-sm font-black text-white shadow-soft transition hover:bg-school-navy">
          ${icon("cloud-download", "h-4 w-4")} Cargar regularizacion
        </button>
      </section>
    `;
    container.querySelector("[data-refresh-regularization-cache]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Cargando...";
      await refreshTeacherNotesSnapshot(context, course, teacherState.trimesterId);
      await renderRegularization(context);
    });
    refreshIcons();
    return;
  }

  const { students = [], activities = [], gradesList = [], attendanceRows = [] } = snapshot;
  const studentsByName = sortStudentsByName(students);
  const regularizationOrderMap = new Map(studentsByName.map((student, index) => [student.id, index + 1]));
  const gradesMap = gradeByActivityAndStudent(gradesList);
  const currentDate = todayIso();
  const lowLimit = Math.max(35, Math.min(100, Number(teacherState.regularizationLowLimit || 50)));
  const activitiesToReview = activities
    .filter((item) => course.materias.includes(item.materiaId))
    .filter((item) => !item.interno && !["ser", "auto"].includes(item.tipo))
    .filter((item) => !item.fecha || item.fecha <= currentDate)
    .filter((item) => activityHasGrades(item, gradesMap))
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));

  const pendingByStudent = [];
  const lowByStudent = [];
  studentsByName.forEach((student) => {
    const pending = [];
    const low = [];
    activitiesToReview.forEach((activity) => {
      const grade = gradesMap[activity.id]?.[student.id];
      const attendanceState = attendanceStateForDate(student.id, activity.fecha, attendanceRows);
      if (!grade) {
        pending.push({ ...activity, pendienteMotivo: attendanceState === "falta" ? "Ausente" : "Sin calificar", nota: 35 });
        return;
      }
      if (Number(grade.valor || 0) <= 0) {
        pending.push({ ...activity, pendienteMotivo: "No presento", nota: 35 });
        return;
      }
      const note = gradeNumber(grade.nota);
      if (note < lowLimit) low.push({ ...activity, nota: note });
    });
    if (pending.length) pendingByStudent.push({ student, items: pending });
    if (low.length) lowByStudent.push({ student, items: low });
  });

  pendingByStudent.sort((a, b) => b.items.length - a.items.length || (regularizationOrderMap.get(a.student.id) || 999) - (regularizationOrderMap.get(b.student.id) || 999));
  lowByStudent.sort((a, b) => b.items.length - a.items.length || (regularizationOrderMap.get(a.student.id) || 999) - (regularizationOrderMap.get(b.student.id) || 999));
  const alertedStudents = new Set([...pendingByStudent.map((item) => item.student.id), ...lowByStudent.map((item) => item.student.id)]);
  const pendingTotal = pendingByStudent.reduce((total, item) => total + item.items.length, 0);
  const lowTotal = lowByStudent.reduce((total, item) => total + item.items.length, 0);
  const clearSearch = teacherState.regularizationSearch.trim().toLowerCase();
  const filterReason = teacherState.regularizationFilter;
  const filteredPending = pendingByStudent
    .map(({ student, items }) => ({
      student,
      items: items.filter((item) => filterReason === "todos" || item.pendienteMotivo === filterReason)
    }))
    .filter(({ student, items }) => items.length && (!clearSearch || String(student.nombre || "").toLowerCase().includes(clearSearch)));
  const responsiveColumnCount = window.innerWidth < 768 ? 1 : window.innerWidth < 1280 ? 2 : 3;
  const pendingColumns = Array.from({ length: responsiveColumnCount }, (_, column) => filteredPending.filter((_, index) => index % responsiveColumnCount === column));
  const selectedRegularizationActivity = activitiesToReview.find((item) => item.id === teacherState.regularizationGradeActivityId) || null;
  const selectedRegularizationStudent = studentsByName.find((item) => item.id === teacherState.regularizationGradeStudentId) || null;
  const selectedRegularizationGrade = selectedRegularizationActivity && selectedRegularizationStudent
    ? gradesMap[selectedRegularizationActivity.id]?.[selectedRegularizationStudent.id]
    : null;

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
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
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
    <section class="space-y-3 sm:space-y-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-soft sm:rounded-3xl sm:p-5">
        <div class="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between sm:gap-3">
          <div>
            <p class="text-[9px] font-black uppercase tracking-[.12em] text-school-green sm:text-[11px] sm:tracking-[.18em]">Regularizacion</p>
            <h2 class="mt-0.5 text-base font-black text-slate-900 sm:mt-2 sm:text-2xl">${escapeHtml(course.nombre)}</h2>
            <p class="text-[10px] font-semibold text-slate-500 sm:mt-1 sm:text-sm">${escapeHtml(selectedTrimester().label)} · ${activitiesToReview.length} actividad(es) revisadas</p>
          </div>
          <div class="flex flex-col gap-1.5 xl:items-end sm:gap-3">
            ${regularizationCourseTabs(context, course)}
            <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span class="inline-flex items-center gap-1 rounded-md border border-green-100 bg-green-50 px-2 py-1 text-[9px] font-black text-school-green sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[11px]">${icon("calendar-check", "h-3 w-3 sm:h-4 sm:w-4")} ${cacheMeta ? `Copia: ${escapeHtml(cacheMeta.label)}` : "Sin copia local"}</span>
              <button type="button" data-refresh-regularization-cache class="inline-flex items-center gap-1 rounded-md border border-school-green bg-white px-2 py-1 text-[9px] font-black text-school-green transition hover:bg-school-green hover:text-white sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2 sm:text-xs">
                ${icon("refresh-cw", "h-3 w-3 sm:h-4 sm:w-4")} Actualizar
              </button>
            </div>
          </div>
        </div>
        <div class="mt-2 grid grid-cols-3 gap-1.5 sm:mt-7 sm:gap-4">
          <div class="rounded-lg border border-red-100 bg-gradient-to-br from-red-50 to-white p-2 sm:rounded-2xl sm:p-4">
            <div class="flex items-center gap-1.5 sm:gap-4">
              <span class="hidden h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-100 text-red-700 sm:grid sm:h-12 sm:w-12 sm:rounded-2xl">${icon("book-x", "h-5 w-5 sm:h-6 sm:w-6")}</span>
              <div>
                <p class="text-sm font-black leading-none text-red-700 sm:text-2xl">${pendingByStudent.length} <span class="hidden text-xs text-slate-700 sm:inline sm:text-sm">alumno(s)</span></p>
                <p class="mt-0.5 text-[9px] font-bold leading-tight text-slate-600 sm:text-xs">${pendingTotal} pend.</p>
              </div>
            </div>
            <div class="mt-1.5 h-0.5 rounded-full bg-red-100 sm:mt-4 sm:h-1.5"><div class="h-0.5 rounded-full bg-red-600 sm:h-1.5" style="width:${Math.min(100, (pendingByStudent.length / Math.max(studentsByName.length, 1)) * 100)}%"></div></div>
          </div>
          <div class="rounded-lg border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-2 sm:rounded-2xl sm:p-4">
            <div class="flex items-center gap-1.5 sm:gap-4">
              <span class="hidden h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 sm:grid sm:h-12 sm:w-12 sm:rounded-2xl">${icon("user-round", "h-5 w-5 sm:h-6 sm:w-6")}</span>
              <div>
                <p class="text-sm font-black leading-none text-amber-700 sm:text-2xl">${lowByStudent.length} <span class="hidden text-xs text-slate-700 sm:inline sm:text-sm">alumno(s)</span></p>
                <p class="mt-0.5 text-[9px] font-bold leading-tight text-slate-600 sm:text-xs">&lt; ${lowLimit}: ${lowTotal}</p>
              </div>
            </div>
            <div class="mt-1.5 h-0.5 rounded-full bg-amber-100 sm:mt-4 sm:h-1.5"><div class="h-0.5 rounded-full bg-amber-500 sm:h-1.5" style="width:${Math.min(100, (lowByStudent.length / Math.max(studentsByName.length, 1)) * 100)}%"></div></div>
          </div>
          <div class="rounded-lg border border-green-100 bg-gradient-to-br from-green-50 to-white p-2 sm:rounded-2xl sm:p-4">
            <div class="flex items-center gap-1.5 sm:gap-4">
              <span class="hidden h-9 w-9 shrink-0 place-items-center rounded-xl bg-green-100 text-school-green sm:grid sm:h-12 sm:w-12 sm:rounded-2xl">${icon("bell", "h-5 w-5 sm:h-6 sm:w-6")}</span>
              <div>
                <p class="text-sm font-black leading-none text-school-green sm:text-2xl">${Math.max(0, studentsByName.length - alertedStudents.size)} <span class="hidden text-xs text-slate-700 sm:inline sm:text-sm">alumno(s)</span></p>
                <p class="mt-0.5 text-[9px] font-bold leading-tight text-slate-600 sm:text-xs">Sin alerta</p>
              </div>
            </div>
            <div class="mt-1.5 h-0.5 rounded-full bg-green-100 sm:mt-4 sm:h-1.5"><div class="h-0.5 rounded-full bg-school-green sm:h-1.5" style="width:${Math.min(100, (Math.max(0, studentsByName.length - alertedStudents.size) / Math.max(studentsByName.length, 1)) * 100)}%"></div></div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-soft sm:rounded-3xl sm:p-5">
        <div class="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between sm:gap-3">
          <div>
            <div class="flex items-center gap-1.5 sm:gap-3">
              <h3 class="text-sm font-black text-slate-900 sm:text-lg">Actividades pendientes</h3>
              <span class="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-600 sm:px-3 sm:py-1 sm:text-xs">${pendingTotal}</span>
            </div>
            <p class="mt-0.5 text-[10px] font-semibold leading-tight text-slate-500 sm:mt-1 sm:text-xs">Ausentes, no presentados y sin calificar.</p>
          </div>
          <div class="grid gap-1.5 sm:grid-cols-[minmax(190px,1fr)_auto] sm:gap-2">
            <label class="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm">
              ${icon("search", "h-3.5 w-3.5 sm:h-4 sm:w-4")}
              <input type="search" value="${escapeHtml(teacherState.regularizationSearch)}" data-regularization-search placeholder="Buscar alumno..." class="w-full bg-transparent text-xs font-semibold outline-none">
            </label>
            <select data-regularization-filter class="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs">
              <option value="todos" ${filterReason === "todos" ? "selected" : ""}>Filtrar: Todo</option>
              <option value="No presento" ${filterReason === "No presento" ? "selected" : ""}>No presento</option>
              <option value="Ausente" ${filterReason === "Ausente" ? "selected" : ""}>Ausente</option>
              <option value="Sin calificar" ${filterReason === "Sin calificar" ? "selected" : ""}>Sin calificar</option>
            </select>
          </div>
        </div>
        <div class="mt-2 grid gap-1.5 md:grid-cols-2 xl:mt-4 xl:grid-cols-3 xl:gap-3">
          ${filteredPending.length ? pendingColumns.map((column) => regularizationPendingTable(column, regularizationOrderMap)).join("") : emptyState("Sin resultados", "No hay alumnos pendientes con el filtro seleccionado.")}
        </div>
      </div>

      <div class="rounded-2xl border border-amber-100 bg-white p-3 shadow-soft sm:p-4">
        <div class="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div>
            <p class="text-[10px] font-black uppercase tracking-[.16em] text-amber-600">Opcional</p>
            <h3 class="text-sm font-black text-slate-900 sm:text-base">Notas bajas</h3>
          </div>
          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <label class="flex items-center gap-1 rounded-lg border border-amber-100 bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-800">
              Menor a
              <input type="number" min="35" max="100" value="${lowLimit}" data-regularization-low-limit class="w-14 rounded-md border border-amber-200 bg-white px-1.5 py-0.5 text-center text-[11px] font-black outline-none focus:border-school-green">
            </label>
            <button type="button" data-toggle-low-regularization class="rounded-lg px-3 py-1.5 text-[11px] font-black transition ${teacherState.regularizationShowLow ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}">
              ${teacherState.regularizationShowLow ? "Ocultar" : "Ver"} bajas (${lowTotal})
            </button>
          </div>
        </div>
        ${teacherState.regularizationShowLow ? `
          <div class="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
            ${lowByStudent.length ? lowByStudent.map(({ student, items }) => regularizationStudentCard(student, items, "amber", regularizationOrderMap.get(student.id) || "-")).join("") : emptyState("Sin bajas notas", "No hay calificaciones bajas registradas en las actividades revisadas.")}
          </div>
        ` : ""}
      </div>
      ${regularizationGradeModal({
        activity: selectedRegularizationActivity,
        student: selectedRegularizationStudent,
        currentGrade: selectedRegularizationGrade,
        displayNumber: selectedRegularizationStudent ? regularizationOrderMap.get(selectedRegularizationStudent.id) || "" : ""
      })}
    </section>
  `;

  container.querySelectorAll("[data-regularization-course]").forEach((button) => {
    button.addEventListener("click", async () => {
      teacherState.selectedCourseId = button.dataset.regularizationCourse;
      sessionStorage.setItem("docenteCursoId", teacherState.selectedCourseId);
      await renderRegularization(context);
    });
  });
  container.querySelector("[data-refresh-regularization-cache]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Actualizando...";
    await refreshTeacherNotesSnapshot(context, course, teacherState.trimesterId);
    await renderRegularization(context);
  });
  container.querySelector("[data-toggle-low-regularization]")?.addEventListener("click", async () => {
    teacherState.regularizationShowLow = !teacherState.regularizationShowLow;
    sessionStorage.setItem("docenteRegularizacionBajas", teacherState.regularizationShowLow ? "1" : "0");
    await renderRegularization(context);
  });
  container.querySelector("[data-regularization-low-limit]")?.addEventListener("change", async (event) => {
    teacherState.regularizationLowLimit = Math.max(35, Math.min(100, Number(event.currentTarget.value || 50)));
    sessionStorage.setItem("docenteRegularizacionLimite", String(teacherState.regularizationLowLimit));
    await renderRegularization(context);
  });
  container.querySelector("[data-regularization-search]")?.addEventListener("input", (event) => {
    teacherState.regularizationSearch = event.currentTarget.value || "";
    clearTimeout(regularizationSearchTimer);
    regularizationSearchTimer = setTimeout(() => {
      renderRegularization(context);
    }, 250);
  });
  container.querySelector("[data-regularization-filter]")?.addEventListener("change", async (event) => {
    teacherState.regularizationFilter = event.currentTarget.value || "todos";
    sessionStorage.setItem("docenteRegularizacionFiltro", teacherState.regularizationFilter);
    await renderRegularization(context);
  });
  container.querySelectorAll("[data-regularization-grade-activity]").forEach((button) => {
    button.addEventListener("click", async () => {
      teacherState.regularizationGradeActivityId = button.dataset.regularizationGradeActivity || "";
      teacherState.regularizationGradeStudentId = button.dataset.regularizationGradeStudent || "";
      await renderRegularization(context);
    });
  });
  container.querySelector("[data-close-regularization-grade]")?.addEventListener("click", async () => {
    teacherState.regularizationGradeActivityId = "";
    teacherState.regularizationGradeStudentId = "";
    await renderRegularization(context);
  });
  const saveRegularizationGrade = async (value) => {
    if (!selectedRegularizationActivity || !selectedRegularizationStudent) return;
    const status = container.querySelector("[data-regularization-grade-status]");
    container.querySelectorAll("[data-regularization-grade-value], [data-save-regularization-grade-input]").forEach((item) => { item.disabled = true; });
    if (status) {
      status.classList.remove("hidden");
      status.textContent = "Guardando nota...";
    }
    try {
      const savedGrade = await saveGrade({ activity: selectedRegularizationActivity, student: selectedRegularizationStudent, value });
      upsertTeacherNotesSnapshotGrade(context, selectedRegularizationActivity, savedGrade);
      if (status) status.textContent = "Nota guardada";
      teacherState.regularizationGradeActivityId = "";
      teacherState.regularizationGradeStudentId = "";
      await renderRegularization(context);
    } catch (error) {
      if (status) {
        status.className = "rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700";
        status.textContent = error.message || "No se pudo guardar.";
      }
      container.querySelectorAll("[data-regularization-grade-value], [data-save-regularization-grade-input]").forEach((item) => { item.disabled = false; });
    }
  };
  container.querySelectorAll("[data-regularization-grade-value]").forEach((button) => {
    button.addEventListener("click", async () => {
      await saveRegularizationGrade(Number(button.dataset.regularizationGradeValue || 0));
    });
  });
  container.querySelector("[data-save-regularization-grade-input]")?.addEventListener("click", async () => {
    const input = container.querySelector("[data-regularization-grade-input]");
    await saveRegularizationGrade(Number(input?.value || 0));
  });
  refreshIcons();
}

async function renderNotes(context) {
  const container = document.querySelector("[data-teacher-notes]");
  const course = selectedCourse(context);
  if (!container) return;
  if (!course) {
    container.innerHTML = emptyState("Sin cursos asignados", "Admin debe asignarte un curso antes de calificar.");
    return;
  }

  const activeTrimesterId = teacherState.trimesterId || selectedTrimester().id || "t1";
  const notesCacheMeta = getTeacherDataCacheMeta(context, "notas", course.id, activeTrimesterId);
  const notesSnapshot = await getTeacherNotesSnapshot(context, course, activeTrimesterId);
  if (!notesSnapshot) {
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
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
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
      <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:rounded-3xl sm:p-5">
        <p class="text-xs font-black uppercase tracking-[.18em] text-school-green">${escapeHtml(course.nombre)} · ${escapeHtml(selectedTrimester().label)}</p>
        <h2 class="mt-1 text-2xl font-black text-slate-900">Notas por materia</h2>
        <p class="mt-2 max-w-2xl font-semibold text-slate-500">Para ahorrar lecturas, las notas se cargan manualmente y luego quedan guardadas en este dispositivo.</p>
        <button type="button" data-refresh-notes-cache class="mt-4 inline-flex items-center gap-2 rounded-2xl bg-school-navy px-4 py-3 text-sm font-black text-white shadow-soft transition hover:bg-school-green">
          ${icon("cloud-download", "h-4 w-4")} Cargar notas
        </button>
      </div>
    `;
    container.querySelector("[data-refresh-notes-cache]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Cargando notas...";
      await refreshTeacherNotesSnapshot(context, course, activeTrimesterId);
      await renderNotes(context);
    });
    refreshIcons();
    return;
  }
  const { students = [], activities = [], gradesList = [], attendanceRows = [] } = notesSnapshot;
  const studentsByName = sortStudentsByName(students);
  const visibleActivities = activities.filter((item) => course.materias.includes(item.materiaId));
  const availableSubjects = course.materias.filter(Boolean);
  if (!availableSubjects.includes(teacherState.selectedSubjectId)) {
    teacherState.selectedSubjectId = availableSubjects[0] || "";
    sessionStorage.setItem("docenteMateriaId", teacherState.selectedSubjectId);
  }
  const selectedSubject = findSubject(teacherState.selectedSubjectId);
  const subjectActivitiesAll = visibleActivities.filter((item) => item.materiaId === teacherState.selectedSubjectId);
  const serCriteria = subjectActivitiesAll
    .filter((item) => item.tipo === "ser")
    .sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || "")));
  const autoActivity = subjectActivitiesAll.find((item) => item.tipo === "auto") || null;
  const gradesMap = gradeByActivityAndStudent(gradesList);
  const subjectActivities = subjectActivitiesAll
    .filter((item) => !item.interno && !["ser", "auto"].includes(item.tipo))
    .filter((item) => activityHasGrades(item, gradesMap));
  const tasks = subjectActivities.filter((item) => item.tipo !== "examen");
  const exams = subjectActivities.filter((item) => item.tipo === "examen");
  const serColspan = 5 + serCriteria.length;
  const selectedCriterion = serCriteria.find((item) => item.id === teacherState.notesCriterionId) || null;
  const autoGradeActivity = autoActivity || {
    id: "",
    cursoId: course.id,
    materiaId: teacherState.selectedSubjectId,
    trimestreId: activeTrimesterId,
    titulo: "Autoevaluacion",
    tipo: "auto",
    maximo: 5,
    interno: true
  };
  const selectedGradeActivity = teacherState.notesGradeKind === "auto"
    ? autoGradeActivity
    : serCriteria.find((item) => item.id === teacherState.notesGradeActivityId);
  const selectedGradeStudent = studentsByName.find((item) => item.id === teacherState.notesGradeStudentId) || null;
  const selectedGradeIndex = selectedGradeStudent ? studentsByName.findIndex((item) => item.id === selectedGradeStudent.id) : 0;
  const currentNotesGrade = selectedGradeActivity?.id && selectedGradeStudent ? gradesMap[selectedGradeActivity.id]?.[selectedGradeStudent.id] : null;

  async function ensureNotesGradeActivity() {
    if (teacherState.notesGradeKind !== "auto") return selectedGradeActivity || null;
    if (autoActivity?.id) return autoActivity;
    const createdActivity = await saveInternalActivity({
      course,
      materiaId: teacherState.selectedSubjectId,
      titulo: "Autoevaluacion",
      tipo: "auto",
      maximo: 5,
      trimestreId: activeTrimesterId
    });
    upsertTeacherNotesSnapshotActivity(context, createdActivity);
    return createdActivity;
  }

  const sectionBorder = "border-l-2 border-l-slate-300";
  const sectionHeaderBorder = "border-l-2 border-l-white/60";
  const serHeaderCell = `${sectionBorder} bg-emerald-50/80`;
  const saberHeaderCell = `${sectionBorder} bg-amber-50/80`;
  const hacerHeaderCell = `${sectionBorder} bg-green-50/70`;
  const autoHeaderCell = `${sectionBorder} bg-slate-100/80`;
  const finalHeaderCell = `${sectionBorder} bg-emerald-100/80`;

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
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
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
    <section class="space-y-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:p-4">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[.16em] text-school-green">${escapeHtml(course.nombre)} · ${escapeHtml(selectedTrimester().label)}</p>
            <h2 class="mt-1 text-xl font-semibold text-slate-900">Notas por materia</h2>
          </div>
          <div class="flex flex-col gap-2 sm:items-end">
            <div class="flex flex-wrap justify-end gap-2">
              <button type="button" data-print-notes class="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-school-green ring-1 ring-school-green/25 shadow-soft transition hover:bg-school-green hover:text-white">
                ${icon("printer", "h-4 w-4")} Imprimir
              </button>
              <button type="button" data-export-notes-excel class="inline-flex items-center justify-center gap-2 rounded-xl bg-school-green px-3 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-school-navy">
                ${icon("file-spreadsheet", "h-4 w-4")} Excel
              </button>
              <button type="button" data-refresh-notes-cache class="inline-flex items-center justify-center gap-2 rounded-xl bg-school-navy px-3 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-school-green">
                ${icon("refresh-cw", "h-4 w-4")} Actualizar notas
              </button>
            </div>
            <div class="rounded-xl bg-school-sky px-3 py-1.5 text-[11px] font-semibold text-school-navy">
              ${notesCacheMeta ? `Copia local: ${escapeHtml(notesCacheMeta.label)}` : "Sin copia local"}
            </div>
          </div>
        </div>
        <div class="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          ${availableSubjects.map((subjectId) => {
            const subject = findSubject(subjectId);
            const active = subjectId === teacherState.selectedSubjectId;
            return `<button type="button" data-note-subject="${subjectId}" class="shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-school-navy bg-school-green text-white shadow-soft" : "border-slate-200 bg-white text-slate-600 hover:border-school-navy/40"}">${escapeHtml(subject?.nombre || subjectId)}</button>`;
          }).join("")}
        </div>
      </div>

      <div class="w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table class="w-full min-w-[980px] table-fixed text-center text-[10px] leading-tight">
          <thead>
            <tr class="bg-school-navy text-white">
              <th class="w-9 px-1 py-2 font-semibold">No.</th>
              <th class="w-44 px-2 py-2 text-left font-semibold">Alumno</th>
              <th colspan="${serColspan}" class="${sectionHeaderBorder} px-1 py-2 font-semibold">
                <span class="inline-flex items-center justify-center gap-1.5">
                  SER 10
                  <button type="button" data-add-ser-criterion class="grid h-6 w-6 place-items-center rounded-md bg-white text-school-navy shadow-sm transition hover:bg-school-gold" title="Agregar nota SER">${icon("plus", "h-4 w-4")}</button>
                </span>
              </th>
              <th colspan="${(exams.length || 1) + 2}" class="${sectionHeaderBorder} px-1 py-2 font-semibold">SABER 45</th>
              <th colspan="${(tasks.length || 1) + 2}" class="${sectionHeaderBorder} px-1 py-2 font-semibold">HACER 40</th>
              <th colspan="2" class="${sectionHeaderBorder} px-1 py-2 font-semibold">Auto 5</th>
              <th colspan="2" class="${sectionHeaderBorder} px-1 py-2 font-semibold">Final</th>
            </tr>
            <tr class="border-b border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-700">
              <th class="px-1 py-1"></th>
              <th class="px-2 py-1 text-left"></th>
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] ${serHeaderCell}">Asistencia</th>
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-emerald-50/80">Puntualidad</th>
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-emerald-50/80">Responsabilidad</th>
              ${serCriteria.map((item) => `<th class="h-24 px-1 py-1 bg-emerald-50/80">
                <button type="button" data-edit-ser-criterion="${item.id}" class="h-full w-full rounded-lg px-1 py-1 text-[10px] font-medium transition [writing-mode:vertical-rl] hover:bg-school-gold/30">${escapeHtml(item.titulo)}</button>
              </th>`).join("")}
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-emerald-50/80">Promedio</th>
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-emerald-50/80">Puntaje</th>
              ${exams.length ? exams.map((item, itemIndex) => `<th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-amber-50/80 ${itemIndex === 0 ? sectionBorder : ""}">${escapeHtml(item.titulo)}</th>`).join("") : `<th class="h-24 px-1 py-1 [writing-mode:vertical-rl] ${saberHeaderCell}">Sin examenes</th>`}
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-amber-50/80">Promedio</th>
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-amber-50/80">Puntaje</th>
              ${tasks.length ? tasks.map((item, itemIndex) => `<th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-green-50/70 ${itemIndex === 0 ? sectionBorder : ""}">${escapeHtml(item.titulo)}</th>`).join("") : `<th class="h-24 px-1 py-1 [writing-mode:vertical-rl] ${hacerHeaderCell}">Sin tareas</th>`}
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-green-50/70">Promedio</th>
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-green-50/70">Puntaje</th>
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] ${autoHeaderCell}">Nota</th>
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-slate-100/80">Puntaje</th>
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] ${finalHeaderCell}">Nota final</th>
              <th class="h-24 px-1 py-1 [writing-mode:vertical-rl] bg-emerald-100/80">Situacion</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${studentsByName.map((student, index) => {
              const serExtraValues = serCriteria.map((item) => studentActivityGrade(item, student.id, gradesMap));
              const autoGradeRecord = autoActivity ? gradesMap[autoActivity.id]?.[student.id] : null;
              const autoGrade = autoGradeRecord?.nota ?? null;
              const calc = calculateStudentTerm(student, subjectActivities, gradesMap, attendanceRows, serExtraValues, autoGrade);
              return `
                <tr class="hover:bg-slate-50">
                  <td class="px-1 py-1.5 font-medium text-school-navy">${index + 1}</td>
                  <td class="px-2 py-1.5 text-left font-normal text-slate-800">${escapeHtml(student.nombre)}</td>
                  <td class="${sectionBorder} px-1 py-1.5 ${gradeTone(calc.asistencia100)}">${calc.asistencia100}</td>
                  <td class="px-1 py-1.5 ${gradeTone(calc.puntualidad100)}">${calc.puntualidad100}</td>
                  <td class="px-1 py-1.5 ${gradeTone(calc.responsabilidad100)}">${calc.responsabilidad100}</td>
                  ${serCriteria.map((item) => {
                    const grade = gradesMap[item.id]?.[student.id];
                    const value = grade?.nota;
                    return `<td class="px-1 py-1.5">
                      <button type="button" data-ser-grade="${item.id}" data-student-id="${student.id}" class="mx-auto min-w-8 rounded-lg px-2 py-1 text-[10px] font-medium transition hover:ring-2 hover:ring-school-green ${value ? gradeTone(value) : "bg-slate-100 text-slate-500"}">${value || "+"}</button>
                    </td>`;
                  }).join("")}
                  <td class="px-1 py-1.5 ${gradeTone(calc.ser100)}">${calc.ser100}</td>
                  <td class="px-1 py-1.5 bg-blue-50 font-medium text-school-navy">${calc.ser10}</td>
                  ${exams.length ? exams.map((item) => {
                    const value = studentActivityGrade(item, student.id, gradesMap);
                    const firstExam = item.id === exams[0]?.id;
                    return `<td class="${firstExam ? sectionBorder : ""} px-1 py-1.5 ${gradeTone(value)}">${value}</td>`;
                  }).join("") : `<td class="${sectionBorder} px-1 py-1.5 text-slate-400">35</td>`}
                  <td class="px-1 py-1.5 ${gradeTone(calc.saber100)}">${calc.saber100}</td>
                  <td class="px-1 py-1.5 bg-blue-50 font-medium text-school-navy">${calc.saber45}</td>
                  ${tasks.length ? tasks.map((item) => {
                    const value = studentActivityGrade(item, student.id, gradesMap);
                    const firstTask = item.id === tasks[0]?.id;
                    return `<td class="${firstTask ? sectionBorder : ""} px-1 py-1.5 ${gradeTone(value)}">${value}</td>`;
                  }).join("") : `<td class="${sectionBorder} px-1 py-1.5 text-slate-400">35</td>`}
                  <td class="px-1 py-1.5 ${gradeTone(calc.hacer100)}">${calc.hacer100}</td>
                  <td class="px-1 py-1.5 bg-blue-50 font-medium text-school-navy">${calc.hacer40}</td>
                  <td class="${sectionBorder} px-1 py-1.5">
                    <button type="button" data-auto-grade="${student.id}" class="mx-auto min-w-8 rounded-lg px-2 py-1 text-[10px] font-medium transition hover:ring-2 hover:ring-school-green ${autoGradeRecord ? gradeTone(calc.auto100) : "bg-slate-100 text-slate-500"}">${autoGradeRecord ? calc.auto100 : "+"}</button>
                  </td>
                  <td class="px-1 py-1.5 bg-blue-50 font-medium text-school-navy">${calc.auto5}</td>
                  <td class="${sectionBorder} px-1 py-1.5 text-xs font-semibold ${calc.final <= 50 ? "bg-red-600 text-white" : "bg-green-700 text-white"}">${calc.final}</td>
                  <td class="px-1 py-1.5 font-medium ${calc.final <= 50 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}">${calc.final <= 50 ? "Reprobado" : "Aprobado"}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>

      ${notesCriterionModal(selectedCriterion)}
      ${notesGradeModal({ activity: selectedGradeActivity, student: selectedGradeStudent, currentGrade: currentNotesGrade, totalStudents: studentsByName.length, currentIndex: selectedGradeIndex })}
    </section>
  `;

  container.querySelectorAll("[data-note-subject]").forEach((button) => {
    button.addEventListener("click", async () => {
      teacherState.selectedSubjectId = button.dataset.noteSubject;
      teacherState.gradeModalActivityId = "";
      teacherState.gradeIndex = 0;
      closeNotesModals();
      sessionStorage.setItem("docenteMateriaId", teacherState.selectedSubjectId);
      button.disabled = true;
      await renderNotes(context);
    });
  });
  container.querySelector("[data-refresh-notes-cache]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Actualizando...";
    await refreshTeacherNotesSnapshot(context, course, activeTrimesterId);
    await renderNotes(context);
  });
  container.querySelector("[data-print-notes]")?.addEventListener("click", () => {
    openTeacherNotesPrintModal({
      course,
      selectedSubject,
      selectedTrimesterLabel: selectedTrimester().label,
      availableSubjects,
      students: studentsByName,
      activities: visibleActivities,
      gradesList,
      attendanceRows,
      calculateStudentTerm,
      teacherName: context?.teacher?.nombre || context?.profile?.nombre || context?.user?.displayName || ""
    });
  });
  container.querySelector("[data-export-notes-excel]")?.addEventListener("click", () => {
    exportNotesToExcel({
      course,
      selectedSubject,
      selectedTrimesterLabel: selectedTrimester().label,
      students: studentsByName,
      subjectActivities,
      serCriteria,
      autoActivity,
      gradesMap,
      attendanceRows,
      studentActivityGrade,
      calculateStudentTerm
    });
  });
  container.querySelector("[data-add-ser-criterion]")?.addEventListener("click", () => {
    teacherState.notesCriterionId = "";
    teacherState.notesCriterionOpen = true;
    teacherState.notesGradeActivityId = "";
    teacherState.notesGradeStudentId = "";
    teacherState.notesGradeKind = "";
    renderNotes(context);
  });
  container.querySelectorAll("[data-edit-ser-criterion]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.notesCriterionId = button.dataset.editSerCriterion || "";
      teacherState.notesCriterionOpen = true;
      teacherState.notesGradeActivityId = "";
      teacherState.notesGradeStudentId = "";
      teacherState.notesGradeKind = "";
      renderNotes(context);
    });
  });
  container.querySelectorAll("[data-ser-grade]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.notesGradeActivityId = button.dataset.serGrade || "";
      teacherState.notesGradeStudentId = button.dataset.studentId || "";
      teacherState.notesGradeKind = "ser";
      teacherState.notesCriterionOpen = false;
      renderNotes(context);
    });
  });
  container.querySelectorAll("[data-auto-grade]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.notesGradeActivityId = autoActivity?.id || "";
      teacherState.notesGradeStudentId = button.dataset.autoGrade || "";
      teacherState.notesGradeKind = "auto";
      teacherState.notesCriterionOpen = false;
      renderNotes(context);
    });
  });
  container.querySelectorAll("[data-close-notes-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      closeNotesModals();
      renderNotes(context);
    });
  });
  container.querySelector("[data-ser-criterion-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const titulo = String(data.get("titulo") || "").trim();
    const maximo = Number(data.get("maximo") || 0);
    if (!titulo) return alert("Escribe un titulo.");
    if (!maximo || maximo <= 0) return alert("La nota maxima debe ser mayor a 0.");
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      let savedActivity = null;
      if (selectedCriterion) {
        savedActivity = await updateActivity({
          activity: selectedCriterion,
          course,
          materiaId: teacherState.selectedSubjectId,
          fecha: "",
          titulo,
          tipo: "ser",
          maximo,
          trimestreId: activeTrimesterId
        });
      } else {
        savedActivity = await saveInternalActivity({
          course,
          materiaId: teacherState.selectedSubjectId,
          titulo,
          tipo: "ser",
          maximo,
          trimestreId: activeTrimesterId
        });
      }
      upsertTeacherNotesSnapshotActivity(context, savedActivity);
      closeNotesModals();
      await renderNotes(context);
    } catch (error) {
      alert(error?.code === "permission-denied" ? "Sin permiso para guardar nota SER." : error.message);
      if (submit) submit.disabled = false;
    }
  });
  container.querySelector("[data-delete-ser-criterion]")?.addEventListener("click", async () => {
    if (!selectedCriterion) return;
    if (!confirm(`Esta seguro que desea eliminar "${selectedCriterion.titulo}"?`)) return;
    try {
      await deleteActivity(selectedCriterion);
      removeTeacherNotesSnapshotActivity(context, selectedCriterion);
      closeNotesModals();
      await renderNotes(context);
    } catch (error) {
      alert(error?.code === "permission-denied" ? "Sin permiso para eliminar nota SER." : error.message);
    }
  });
  container.querySelector("[data-toggle-notes-guided]")?.addEventListener("click", () => {
    teacherState.notesGradeGuided = !teacherState.notesGradeGuided;
    renderNotes(context);
  });
  container.querySelectorAll("[data-note-grade-value]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.noteGradeValue;
      const student = selectedGradeStudent;
      if (!student) return;
      const status = container.querySelector("[data-notes-grade-status]");
      container.querySelectorAll("[data-note-grade-value]").forEach((item) => { item.disabled = true; });
      if (status) {
        status.textContent = "Guardando nota...";
        status.classList.remove("hidden");
      }
      try {
        const activity = await ensureNotesGradeActivity();
        if (!activity) throw new Error("No se encontro la columna de nota.");
        const savedGrade = await saveGrade({ activity, student, value });
        upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
        const nextIndex = studentsByName.findIndex((item) => item.id === student.id) + 1;
        const nextStudent = studentsByName[nextIndex] || null;
        if (teacherState.notesGradeGuided && nextStudent) {
          teacherState.notesGradeActivityId = activity.id;
          teacherState.notesGradeStudentId = nextStudent.id;
          await renderNotes(context);
          return;
        }
        closeNotesModals();
        await renderNotes(context);
      } catch (error) {
        alert(error?.code === "permission-denied" ? "Sin permiso para guardar nota." : error.message);
        await renderNotes(context);
      }
    });
  });
  refreshIcons();
}

async function renderSummary(context) {
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
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
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
      <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:rounded-3xl sm:p-5">
        <p class="text-xs font-black uppercase tracking-[.18em] text-school-green">Resumen Asistencia</p>
        <h2 class="mt-1 text-2xl font-black text-slate-900">${escapeHtml(course.nombre)}</h2>
        <p class="mt-2 max-w-2xl font-semibold text-slate-500">${escapeHtml(selectedTrimester().label)} · Para ahorrar lecturas, el resumen se carga manualmente y luego queda guardado en este dispositivo.</p>
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
    byStudent[item.alumnoId][item.fecha] = item.estado;
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
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
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
    <div class="rounded-3xl border border-slate-200 bg-white shadow-soft">
      <div class="border-b border-slate-100 p-4 sm:p-5">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div class="min-w-0">
            <p class="text-xs font-black uppercase tracking-[.18em] text-school-green">Resumen Asistencia</p>
            <h2 class="mt-1 text-2xl font-black text-slate-900">${escapeHtml(course.nombre)}</h2>
            <p class="font-semibold text-slate-500">${escapeHtml(selectedTrimester().label)} · ${dates.length} fecha(s) registradas</p>
          </div>
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
              return `<tr class="hover:bg-school-sky/40"><td class="sticky left-0 z-10 bg-white px-3 py-2 text-center font-black">${index + 1}</td><td class="sticky left-11 z-10 min-w-56 bg-white px-3 py-2 font-semibold text-slate-800">${escapeHtml(student.nombre)}</td>${dates.length ? cells : `<td class="px-4 py-3 text-center font-bold text-slate-400">-</td>`}<td class="w-7 px-1 py-1 text-center font-semibold">${totals.presente}</td><td class="w-7 px-1 py-1 text-center font-semibold">${totals.atraso}</td><td class="w-7 px-1 py-1 text-center font-semibold">${totals.permiso}</td><td class="w-7 px-1 py-1 text-center font-semibold">${totals.falta}</td></tr>`;
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

async function renderTeacherSchedule(context) {
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
          <span class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${escapeHtml(subject?.nombre || item.materiaId)} · ${isSaberActivity(item) ? "Saber" : "Hacer"} · ${item.maximo || 100} pts</span>
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
    <div class="rounded-3xl border border-slate-200 bg-white shadow-soft">
      <div class="border-b border-slate-100 p-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0">
            <p class="text-xs font-black uppercase tracking-[.18em] text-school-green">${context.courses.length === 1 ? escapeHtml(context.courses[0].nombre) : `${context.courses.length} cursos asignados`}</p>
            <h2 class="text-2xl font-black text-school-bark">Horario semanal</h2>
            <p class="mt-1 text-sm font-semibold text-slate-500">${scheduleCache ? `Copia local: ${escapeHtml(scheduleCache.label)}` : "Carga el horario para guardar una copia local."}</p>
          </div>
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

































