import { selectedTrimester, teacherState } from "./EstadoDocente.js";
import { courseAccent, dayIdFromIso, emptyState, escapeHtml, refreshIcons, teacherModuleHeading } from "./UtilidadesDocente.js";
import { icon } from "../../ui/dom.js";
import { attendanceLabel, attendanceShort, attendanceStates, attendanceTone } from "./AcademicoDocente.js";
import { getTeacherScheduleCacheMeta, getTeacherScheduleRows, getTeacherStudents, listAttendanceForCourseDate, saveAttendance, todayIso } from "../../services/teacherData.js";
import { findSubject } from "../../data/catalog.js";
import { activityEvaluationLabel, activityPointsLabel, sortStudentsByName } from "./ComunDocente.js";

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

export async function renderAttendance(context) {
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
      <div class="teacher-module-surface rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
        <div class="teacher-module-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          ${teacherModuleHeading({
            title: "Asistencia",
            course: context.courses.length === 1 ? context.courses[0].nombre : `${context.courses.length} cursos asignados`,
            trimester: selectedTrimester().label,
            detail: "Sin clases en esta fecha"
          })}
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
      <div class="teacher-module-header flex flex-col gap-4 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        ${teacherModuleHeading({
          title: "Asistencia",
          course: course.nombre,
          trimester: selectedTrimester().label,
          detail: `${students.length} alumnos`
        })}
        <div class="grid gap-3 ${canSwitchAttendanceCourse ? "sm:grid-cols-3" : "sm:grid-cols-2"} sm:items-end">
          ${canSwitchAttendanceCourse ? `
            <div class="relative">
              <p class="text-xs text-slate-600">Curso</p>
              <button type="button" data-attendance-course-toggle class="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-school-green">
                Cambiar curso
                ${icon(teacherState.attendanceCoursePickerOpen ? "chevron-up" : "chevron-down", "h-4 w-4 shrink-0")}
              </button>
              <div class="${teacherState.attendanceCoursePickerOpen ? "flex" : "hidden"} absolute right-0 top-full z-30 mt-2 max-w-[calc(100vw-2rem)] gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                ${otherCourses.map((item) => `
                  <button type="button" data-attendance-course-pick="${item.id}" class="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-school-green hover:bg-green-50">${escapeHtml(item.corto || item.nombre)}</button>
                `).join("")}
              </div>
            </div>
          ` : ""}
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
