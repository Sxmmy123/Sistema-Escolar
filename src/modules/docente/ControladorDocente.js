import { DAYS, findSubject, periodsForCourse } from "../../data/catalog.js";
import { icon } from "../../ui/dom.js";
import { renderBulletin } from "./BoletinDocente.js";
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
  teacherModuleHeading,
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
  deliveryStateForActivity,
  deliveryStateForGrade,
  gradeByActivityAndStudent,
  gradeNumber,
  gradeTone,
  isMaterialActivity,
  isScoredMaterialActivity,
  isSaberActivity,
  optionalStudentActivityGrade,
  studentActivityGrade
} from "./AcademicoDocente.js";
import {
  DELIVERY_STATES,
  TRIMESTERS,
  deleteActivity,
  finalizeActivityReview,
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

function resolvedActivityReviewState(activity = null, gradesMap = {}) {
  const stored = String(activity?.estadoRevision || "").toLowerCase();
  if (["sin_iniciar", "en_proceso", "cerrada"].includes(stored)) return stored;
  return Object.keys(gradesMap || {}).length ? "cerrada" : "sin_iniciar";
}

function deliveryEditorData(activity = {}, grade = null, attendanceState = "", gradesForActivity = {}) {
  const storedState = deliveryStateForGrade(grade);
  const wasNotSubmitted = storedState === DELIVERY_STATES.NOT_SUBMITTED;
  const fechaEntrega = String(
    grade?.fechaEntrega || todayIso()
  ).slice(0, 10);
  const estadoEntrega = wasNotSubmitted
    ? DELIVERY_STATES.NOT_SUBMITTED
    : deliveryStateForActivity(
      activity,
      { ...grade, valor: grade?.valor ?? 1, fechaEntrega },
      gradesForActivity
    );
  return { estadoEntrega, fechaEntrega };
}

function deliveryReferenceDate(activity = {}, gradesForActivity = {}) {
  const dates = Object.values(gradesForActivity || {})
    .filter((item) => Number(item?.valor || 0) > 0)
    .map((item) => String(item?.fechaEntrega || "").slice(0, 10))
    .filter(Boolean);
  if (!dates.length) return todayIso();
  const counts = dates.reduce((map, date) => {
    map[date] = (map[date] || 0) + 1;
    return map;
  }, {});
  return Object.entries(counts)
    .sort(([dateA, countA], [dateB, countB]) => Number(countB) - Number(countA) || dateA.localeCompare(dateB))[0]?.[0]
    || todayIso();
}

function gradeDeliveryEditor(activity = {}, grade = null, attendanceState = "", gradesForActivity = {}) {
  const data = deliveryEditorData(activity, grade, attendanceState, gradesForActivity);
  const outsideRange = data.estadoEntrega === DELIVERY_STATES.LATE;
  const referenceDate = deliveryReferenceDate(activity, gradesForActivity);
  return `
    <div class="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-left" data-grade-delivery-editor data-activity-date="${escapeHtml(activity.fecha || "")}" data-reference-date="${escapeHtml(referenceDate)}">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label class="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fecha de recepcion
          <input type="date" value="${escapeHtml(data.fechaEntrega)}" data-grade-delivery-date class="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-school-green">
        </label>
        <span data-grade-delivery-status class="inline-flex min-h-7 items-center justify-center rounded-md px-2 py-1 text-[10px] font-semibold ${outsideRange ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}">${outsideRange ? "Fuera del rango" : "Dentro del rango"}</span>
      </div>
      <input type="hidden" value="${escapeHtml(data.estadoEntrega)}" data-grade-delivery-state>
      <p class="mt-1 text-[9px] leading-tight text-slate-500">El estado se calcula automáticamente con las fechas registradas para esta actividad.</p>
    </div>
  `;
}

function bindGradeDeliveryEditor(container) {
  const editor = container?.querySelector("[data-grade-delivery-editor]");
  if (!editor) return;
  const stateInput = editor.querySelector("[data-grade-delivery-state]");
  const dateInput = editor.querySelector("[data-grade-delivery-date]");
  const status = editor.querySelector("[data-grade-delivery-status]");
  const paint = () => {
    const late = stateInput?.value === DELIVERY_STATES.LATE;
    if (status) {
      status.textContent = late ? "Fuera del rango" : "Dentro del rango";
      status.className = `inline-flex min-h-7 items-center justify-center rounded-md px-2 py-1 text-[10px] font-semibold ${late ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`;
    }
  };
  dateInput?.addEventListener("change", () => {
    const referenceDate = editor.dataset.referenceDate || editor.dataset.activityDate || dateInput.value;
    if (stateInput) stateInput.value = dateInput.value === referenceDate ? DELIVERY_STATES.ON_TIME : DELIVERY_STATES.LATE;
    paint();
  });
}

function readGradeDelivery(container, activity = {}, student = null, attendanceMap = {}) {
  const editor = container?.querySelector("[data-grade-delivery-editor]");
  const attendanceState = String(attendanceMap?.[student?.id]?.estado || "");
  if (!editor) {
    return {
      estadoEntrega: DELIVERY_STATES.ON_TIME,
      fechaEntrega: todayIso(),
      asistenciaActividad: attendanceState
    };
  }
  return {
    estadoEntrega: editor.querySelector("[data-grade-delivery-state]")?.value || DELIVERY_STATES.ON_TIME,
    fechaEntrega: editor.querySelector("[data-grade-delivery-date]")?.value || todayIso(),
    asistenciaActividad: attendanceState
  };
}

function sortStudentsByName(students = []) {
  return [...students].sort((a, b) => {
    const nameOrder = String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" });
    return nameOrder || Number(a.numeroLista || 9999) - Number(b.numeroLista || 9999);
  });
}

function selectedCourse(context = teacherState.context) {
  return context?.courses?.find((course) => course.id === teacherState.selectedCourseId) || context?.courses?.[0] || null;
}

function activityEvaluationLabel(activity = {}) {
  if (isMaterialActivity(activity)) return "Responsabilidad";
  return isSaberActivity(activity) ? "Saber" : "Hacer";
}

function activityPointsLabel(activity = {}) {
  if (isMaterialActivity(activity) && !isScoredMaterialActivity(activity)) return "Sin puntaje";
  return `${Number(activity.maximo || 100)} pts`;
}

function materialItemsForActivity(activity = {}) {
  const storedItems = Array.isArray(activity.materiales) ? activity.materiales : [];
  const items = storedItems
    .map((item) => ({
      cantidad: Math.max(1, Math.min(999, Math.round(Number(item?.cantidad) || 1))),
      material: String(item?.material || "").trim()
    }))
    .filter((item) => item.material);
  if (items.length) return items;
  const legacyTitle = String(activity.titulo || "").trim();
  if (!legacyTitle) return [];
  return legacyTitle
    .split(/\r?\n|,\s*/)
    .map((material) => material.replace(/^\s*[-*\u2022]\s*/, "").trim())
    .filter(Boolean)
    .map((material) => ({ cantidad: 1, material }));
}

function materialEditorRow(item = {}) {
  return `
    <div class="grid grid-cols-[72px_minmax(0,1fr)_38px] items-center gap-2" data-material-item-row>
      <input type="number" name="materialCantidad" min="1" max="999" value="${escapeHtml(item.cantidad || 1)}" aria-label="Cantidad" class="h-10 w-full rounded-xl border border-slate-200 px-2 text-center text-sm font-semibold outline-none focus:border-school-green">
      <input type="text" name="materialNombre" maxlength="120" value="${escapeHtml(item.material || "")}" placeholder="Ej: Cartulina" aria-label="Material" class="h-10 min-w-0 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none focus:border-school-green">
      <button type="button" data-remove-material-row title="Quitar material" aria-label="Quitar material" class="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600">${icon("trash-2", "h-4 w-4")}</button>
    </div>
  `;
}

function materialEditorRows(items = []) {
  const rows = items.length ? items : [{ cantidad: 1, material: "" }];
  return rows.map(materialEditorRow).join("");
}

function readMaterialEditor(form) {
  if (!form) return [];
  const data = new FormData(form);
  const quantities = data.getAll("materialCantidad");
  return data.getAll("materialNombre")
    .map((material, index) => ({
      cantidad: Math.max(1, Math.min(999, Math.round(Number(quantities[index]) || 1))),
      material: String(material || "").trim()
    }))
    .filter((item) => item.material);
}

function bindMaterialListEditor(form) {
  if (!form) return;
  const list = form.querySelector("[data-material-list]");
  if (!list) return;
  form.querySelector("[data-add-material-row]")?.addEventListener("click", () => {
    list.insertAdjacentHTML("beforeend", materialEditorRow({ cantidad: 1, material: "" }));
    list.querySelector("[data-material-item-row]:last-child input[name='materialNombre']")?.focus();
    refreshIcons();
  });
  list.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-material-row]");
    if (!removeButton) return;
    const rows = list.querySelectorAll("[data-material-item-row]");
    const row = removeButton.closest("[data-material-item-row]");
    if (rows.length > 1) {
      row?.remove();
      return;
    }
    row?.querySelector("input[name='materialNombre']")?.setAttribute("value", "");
    const materialInput = row?.querySelector("input[name='materialNombre']");
    const quantityInput = row?.querySelector("input[name='materialCantidad']");
    if (materialInput) materialInput.value = "";
    if (quantityInput) quantityInput.value = "1";
    materialInput?.focus();
  });
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
  const draftIsMaterial = isMaterialActivity({ tipo: teacherState.taskDraftTipo });
  const editIsMaterial = isMaterialActivity(editActivity);
  const editMaterialScored = isScoredMaterialActivity(editActivity);
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
  if (activity && !activity.estadoRevision && !Object.keys(gradesMap[activity.id] || {}).length) {
    activity.estadoRevision = "sin_iniciar";
  }
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
    <section class="space-y-3 sm:space-y-5">
      <style>
        @keyframes agendaNoticeIn {
          0% { opacity: 0; transform: translateY(-10px) scale(.96); }
          18% { opacity: 1; transform: translateY(0) scale(1); }
          82% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-8px) scale(.98); }
        }
      </style>
      <div class="teacher-module-surface rounded-3xl border border-slate-200 bg-white shadow-soft">
        <div class="teacher-module-header flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          ${teacherModuleHeading({
            title: "Agenda de actividades",
            course: singleCourse ? singleCourse.nombre : `${context.courses.length} cursos asignados`,
            trimester: selectedTrimester().label,
            detail: `${monthLabel(teacherState.taskMonth)} · ${monthActivities.length} actividad(es)`
          })}
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
                            const materialNotice = isMaterialActivity(activity);
                            const title = materialNotice
                              ? `${subject?.nombre || activity.materiaId} - Materiales: ${activity.titulo || "Sin detalle"}`
                              : `${subject?.nombre || activity.materiaId} - ${activity.titulo || "Sin titulo"}`;
                            return showCourseInAgenda ? `
                            <button type="button" draggable="true" class="flex w-full cursor-grab touch-none items-stretch overflow-hidden rounded-lg border-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft active:cursor-grabbing ${materialNotice ? "bg-amber-50" : "bg-white"}" style="border-color:${materialNotice ? "#F7B51B" : accent}" data-edit-activity="${activity.id}" title="${escapeHtml(activity.titulo)}">
                              <span class="flex min-w-0 flex-1 items-center gap-1 truncate px-1.5 py-0.5 text-[11px] font-black leading-4 text-slate-900">
                                ${materialNotice ? icon("package-open", "h-3 w-3 shrink-0 text-amber-700") : ""}<span class="truncate">${escapeHtml(title)}</span>
                              </span>
                              <span class="grid min-w-6 place-items-center px-1 text-xs font-black text-white" style="background:${accent}">${escapeHtml(courseNumber)}</span>
                            </button>
                          ` : `
                            <button type="button" draggable="true" class="flex w-full cursor-grab touch-none items-stretch overflow-hidden rounded-lg border-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft active:cursor-grabbing" style="border-color:${materialNotice ? "#F7B51B" : (subject?.color || "#e2e8f0")}; background:${materialNotice ? "#fffbeb" : (subject?.color || "#fff")}" data-edit-activity="${activity.id}" title="${escapeHtml(activity.titulo)}">
                              <span class="flex min-w-0 flex-1 items-center gap-1 truncate px-1.5 py-0.5 text-[11px] font-black leading-4 text-slate-900">
                                ${materialNotice ? icon("package-open", "h-3 w-3 shrink-0 text-amber-700") : ""}<span class="truncate">${escapeHtml(title)}</span>
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
              <div class="mt-3 grid gap-3 sm:grid-cols-3">
                <button type="button" data-task-type="tarea" class="rounded-3xl border-2 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-soft ${teacherState.taskDraftTipo === "tarea" ? "border-green-500 bg-green-50 text-green-800 ring-4 ring-green-100" : "border-slate-200 bg-white text-slate-700"}">
                  <h4 class="text-xl font-black">HACER</h4>
                  <p class="mt-1 text-sm font-semibold text-slate-500">Tareas, ejercicios</p>
                </button>
                <button type="button" data-task-type="examen" class="rounded-3xl border-2 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-soft ${teacherState.taskDraftTipo === "examen" ? "border-blue-500 bg-blue-50 text-blue-800 ring-4 ring-blue-100" : "border-slate-200 bg-white text-slate-700"}">
                  <h4 class="text-xl font-black">SABER</h4>
                  <p class="mt-1 text-sm font-semibold text-slate-500">Examenes, cuestionarios</p>
                </button>
                <button type="button" data-task-type="material" class="rounded-3xl border-2 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-soft ${draftIsMaterial ? "border-amber-400 bg-amber-50 text-amber-900 ring-4 ring-amber-100" : "border-slate-200 bg-white text-slate-700"}">
                  <div class="flex items-center gap-2">${icon("package-open", "h-5 w-5")}<h4 class="text-xl font-black">MATERIALES</h4></div>
                  <p class="mt-1 text-sm font-semibold text-slate-500">Lo que deben traer</p>
                </button>
              </div>
            </div>

            <div class="${teacherState.taskDraftTipo ? "" : "hidden"} rounded-3xl border border-slate-200 bg-white p-4">
              ${draftIsMaterial ? `
                <div class="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
                  <div class="grid grid-cols-[72px_minmax(0,1fr)_38px] gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <span class="text-center">Cantidad</span><span>Material</span><span></span>
                  </div>
                  <div class="grid gap-2 p-3" data-material-list>${materialEditorRows()}</div>
                  <div class="border-t border-slate-200 bg-white px-3 py-2">
                    <button type="button" data-add-material-row class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-school-green transition hover:bg-green-50">${icon("plus", "h-4 w-4")} Agregar material</button>
                  </div>
                </div>
              ` : `
                <label class="block text-sm font-black text-slate-700">Titulo
                  <input class="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold" name="titulo" placeholder="Ej: Investigacion Unidad 1" required>
                </label>
              `}
              <label data-activity-max-field class="${draftIsMaterial ? "hidden" : "mt-3 block"} text-sm font-black text-slate-700">Puntaje maximo
                <input data-activity-max-input class="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold" type="number" name="maximo" min="1" max="100" placeholder="Ej: 10" ${draftIsMaterial ? "disabled" : "required"}>
              </label>
              ${draftIsMaterial ? `
                <label class="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
                  <input type="checkbox" name="calificable" value="1" data-material-score-toggle class="mt-0.5 h-5 w-5 shrink-0 accent-green-700">
                  <span><strong class="block text-sm">Habilitar puntaje</strong><span class="mt-0.5 block text-xs font-semibold text-amber-800">El resultado se calculara dentro de Responsabilidad.</span></span>
                </label>
              ` : ""}
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
                <select class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold" name="tipo" data-edit-activity-type required>
                  <option value="tarea" ${editActivity.tipo === "tarea" ? "selected" : ""}>HACER - tareas, ejercicios</option>
                  <option value="examen" ${isSaberActivity(editActivity) ? "selected" : ""}>SABER - examenes, cuestionarios</option>
                  <option value="material" ${editIsMaterial ? "selected" : ""}>MATERIALES - lo que deben traer</option>
                </select>
              </label>
              <label data-edit-activity-title-field class="${editIsMaterial ? "hidden" : "block"} text-sm font-black text-slate-700">Titulo
                <input data-edit-activity-title-input class="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold" name="titulo" value="${escapeHtml(editActivity.titulo || "")}" ${editIsMaterial ? "disabled" : "required"}>
              </label>
              <div data-edit-material-list-section class="${editIsMaterial ? "block" : "hidden"} overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
                <div class="grid grid-cols-[72px_minmax(0,1fr)_38px] gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <span class="text-center">Cantidad</span><span>Material</span><span></span>
                </div>
                <div class="grid gap-2 p-3" data-material-list>${materialEditorRows(materialItemsForActivity(editActivity))}</div>
                <div class="border-t border-slate-200 bg-white px-3 py-2">
                  <button type="button" data-add-material-row class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-school-green transition hover:bg-green-50">${icon("plus", "h-4 w-4")} Agregar material</button>
                </div>
              </div>
              <label data-edit-activity-max-field class="${editIsMaterial && !editMaterialScored ? "hidden" : "block"} text-sm font-black text-slate-700">Puntaje maximo
                <input data-edit-activity-max-input class="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold" type="number" name="maximo" min="1" max="100" value="${escapeHtml(editActivity.maximo || 10)}" ${editIsMaterial && !editMaterialScored ? "disabled" : "required"}>
              </label>
              <label data-edit-material-score-option class="${editIsMaterial ? "flex" : "hidden"} cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
                <input type="checkbox" name="calificable" value="1" data-edit-material-score-toggle class="mt-0.5 h-5 w-5 shrink-0 accent-green-700" ${editMaterialScored ? "checked" : ""}>
                <span><strong class="block text-sm">Habilitar puntaje</strong><span class="mt-0.5 block text-xs font-semibold text-amber-800">El resultado se calcula dentro de Responsabilidad.</span></span>
              </label>
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
  const activityForm = container.querySelector("[data-activity-form]");
  bindMaterialListEditor(activityForm);
  const materialScoreToggle = container.querySelector("[data-material-score-toggle]");
  const materialMaxField = container.querySelector("[data-activity-max-field]");
  const materialMaxInput = container.querySelector("[data-activity-max-input]");
  materialScoreToggle?.addEventListener("change", () => {
    const enabled = materialScoreToggle.checked;
    materialMaxField?.classList.toggle("hidden", !enabled);
    if (materialMaxInput) {
      materialMaxInput.disabled = !enabled;
      materialMaxInput.required = enabled;
      if (!enabled) materialMaxInput.value = "";
    }
  });
  container.querySelectorAll("[data-task-date]").forEach((button) => {
    button.addEventListener("click", () => {
      teacherState.taskModalDate = button.dataset.taskDate || todayIso();
      renderTasks(context);
    });
  });

  activityForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector("[data-activity-status]");
    const data = new FormData(form);
    const button = form.querySelector("button[type='submit']");
    const targetCourse = context.courses.find((item) => item.id === data.get("cursoId")) || draftCourse;
    const materiaPermitida = scheduledSubjectIds.includes(data.get("materiaId"));
    const tipo = String(data.get("tipo") || "");
    const material = isMaterialActivity({ tipo });
    const materiales = material ? readMaterialEditor(form) : [];
    const titulo = material
      ? materiales.map((item) => item.material).join(", ")
      : String(data.get("titulo") || "").trim();
    const calificable = material && data.get("calificable") === "1";
    const maximo = material && !calificable ? 0 : data.get("maximo");
    if (!targetCourse || !data.get("cursoId") || !data.get("materiaId") || !tipo || !data.get("fecha") || !titulo || (material && !materiales.length) || ((!material || calificable) && !maximo) || !materiaPermitida) {
      if (status) {
        status.className = "mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800";
        status.textContent = "Complete curso, materia valida segun horario, tipo y detalle. Si habilita puntaje, indique el maximo.";
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
      await saveActivity({ course: targetCourse, materiaId: data.get("materiaId"), fecha: data.get("fecha"), titulo, tipo, maximo, calificable, materiales, trimestreId: teacherState.trimesterId });
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
      calificable: isScoredMaterialActivity(selected),
      materiales: materialItemsForActivity(selected),
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

  const editTypeInput = container.querySelector("[data-edit-activity-type]");
  const editMaterialOption = container.querySelector("[data-edit-material-score-option]");
  const editMaterialToggle = container.querySelector("[data-edit-material-score-toggle]");
  const editMaxField = container.querySelector("[data-edit-activity-max-field]");
  const editMaxInput = container.querySelector("[data-edit-activity-max-input]");
  const editTitleField = container.querySelector("[data-edit-activity-title-field]");
  const editTitleInput = container.querySelector("[data-edit-activity-title-input]");
  const editMaterialListSection = container.querySelector("[data-edit-material-list-section]");
  const editActivityForm = container.querySelector("[data-edit-activity-form]");
  bindMaterialListEditor(editActivityForm);
  const syncEditMaterialFields = () => {
    const material = isMaterialActivity({ tipo: editTypeInput?.value });
    const scoreEnabled = material && Boolean(editMaterialToggle?.checked);
    editTitleField?.classList.toggle("hidden", material);
    editTitleField?.classList.toggle("block", !material);
    editMaterialListSection?.classList.toggle("hidden", !material);
    editMaterialListSection?.classList.toggle("block", material);
    if (editTitleInput) {
      editTitleInput.disabled = material;
      editTitleInput.required = !material;
    }
    editMaterialOption?.classList.toggle("hidden", !material);
    editMaterialOption?.classList.toggle("flex", material);
    editMaxField?.classList.toggle("hidden", material && !scoreEnabled);
    editMaxField?.classList.toggle("block", !material || scoreEnabled);
    if (editMaxInput) {
      editMaxInput.disabled = material && !scoreEnabled;
      editMaxInput.required = !material || scoreEnabled;
      if ((!material || scoreEnabled) && !editMaxInput.value) editMaxInput.value = "10";
    }
  };
  editTypeInput?.addEventListener("change", syncEditMaterialFields);
  editMaterialToggle?.addEventListener("change", syncEditMaterialFields);
  syncEditMaterialFields();

  editActivityForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editActivity) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const status = form.querySelector("[data-edit-activity-status]");
    const button = form.querySelector("button[type='submit']");
    const targetCourse = context.courses.find((item) => item.id === data.get("cursoId")) || editCourse;
    const tipo = String(data.get("tipo") || "");
    const material = isMaterialActivity({ tipo });
    const materiales = material ? readMaterialEditor(form) : [];
    const titulo = material
      ? materiales.map((item) => item.material).join(", ")
      : String(data.get("titulo") || "").trim();
    const calificable = material && data.get("calificable") === "1";
    const maximo = material && !calificable ? 0 : data.get("maximo");
    if (!targetCourse || !data.get("materiaId") || !data.get("fecha") || !titulo || (material && !materiales.length) || ((!material || calificable) && !maximo)) {
      if (status) {
        status.className = "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800";
        status.textContent = "Complete fecha, curso, materia y detalle. Si habilita puntaje, indique el maximo.";
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
        titulo,
        tipo,
        maximo,
        calificable,
        materiales,
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
      const attendanceState = activityAttendance[student.id]?.estado || "";
      const delivery = deliveryEditorData(activity, currentGrade, attendanceState, gradesMap);
      const savedGrade = await saveGrade({
        activity,
        student,
        value: input.value,
        ...delivery,
        asistenciaActividad: attendanceState
      });
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
  const nextSchoolDays = Array.from({ length: 7 }, (_, index) => todayIso(index));
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
      const inAssignedCourse = coursesById[item.cursoId]?.materias?.includes(item.materiaId);
      const itemDate = item.fecha || "";
      const inRange = gradeScope === "pendientes"
        ? itemDate && itemDate < gradeDate && (
          item.estadoRevision
            ? item.estadoRevision !== "cerrada"
            : !gradedActivityIds.has(item.id)
        )
        : gradeScope === "semana"
          ? nextSchoolDays.includes(itemDate)
          : itemDate === gradeDate;
      const canBeGraded = !isMaterialActivity(item) || isScoredMaterialActivity(item);
      return inAssignedCourse && inRange && canBeGraded && !item.interno && !["ser", "auto"].includes(item.tipo);
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
  const noSubmissionLabel = isMaterialActivity(activity) ? "No trajo material" : "No hizo su tarea";
  const noSubmissionShortLabel = isMaterialActivity(activity) ? "No trajo" : "No hizo";
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
  const nextPendingStudent = (student) => {
    const currentIndex = studentsToGrade.findIndex((item) => item.id === student?.id);
    const following = currentIndex >= 0
      ? [...studentsToGrade.slice(currentIndex + 1), ...studentsToGrade.slice(0, currentIndex)]
      : studentsToGrade;
    return following.find((item) => item.id !== student?.id && !gradesMap[item.id]) || null;
  };
  const reviewState = resolvedActivityReviewState(activity, gradesMap);
  if (activity && !activity.estadoRevision && reviewState === "sin_iniciar") {
    activity.estadoRevision = "sin_iniciar";
  }
  const allGradedCount = students.filter((student) => gradesMap[student.id]).length;
  const pendingLicenseCount = students.filter((student) => {
    const state = String(attendanceMap[student.id]?.estado || "").toLowerCase();
    return !gradesMap[student.id] && ["permiso", "licencia"].includes(state);
  }).length;
  const pendingDefinitiveCount = Math.max(0, students.length - allGradedCount - pendingLicenseCount);
  const gradeModalOpen = Boolean(activity && !teacherState.gradeModalClosed);
  const listPickerStudent = teacherState.gradeMode === "lista" && gradeModalOpen && teacherState.gradeStudentId
    ? (studentsToGrade.find((student) => student.id === teacherState.gradeStudentId) || null)
    : null;
  const listPickerGrade = listPickerStudent ? gradesMap[listPickerStudent.id] : null;
  const showCourse = context.courses.length >= 2;
  const tomorrowIso = todayIso(1);
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
        .grade-modal-shell {
          letter-spacing: 0;
        }
        .grade-modal-shell .font-black {
          font-weight: 600;
        }
        .grade-modal-shell .text-2xl,
        .grade-modal-shell .text-xl {
          font-size: 1rem;
          line-height: 1.35rem;
        }
        .grade-modal-shell .text-lg,
        .grade-modal-shell .text-base {
          font-size: .875rem;
          line-height: 1.25rem;
        }
        .grade-modal-shell .text-4xl,
        .grade-modal-shell .text-3xl {
          font-size: 1.5rem;
          line-height: 1.75rem;
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
      <div class="teacher-module-surface rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:rounded-3xl sm:p-5">
        <div class="teacher-module-header flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          ${teacherModuleHeading({
            title: "Calificar actividades",
            course: context.courses.length === 1 ? context.courses[0].nombre : `${context.courses.length} cursos asignados`,
            trimester: selectedTrimester().label,
            detail: `${scopeTitle} · ${activities.length} actividad(es)`
          })}
          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div class="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button type="button" data-grade-scope="pendientes" class="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition sm:gap-2 sm:px-4 sm:py-2 ${gradeScope === "pendientes" ? "bg-school-green text-white shadow-soft" : "text-slate-600 hover:bg-white"}">${icon("clipboard-list", "h-3.5 w-3.5 sm:h-4 sm:w-4")}Pendientes</button>
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
                                        <span class="block truncate text-[9px] font-medium uppercase tracking-[.04em] text-slate-500">${activityEvaluationLabel(item)} · ${activityPointsLabel(item)}</span>
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
        <section class="grade-modal-shell flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:rounded-2xl">
          ${activity ? (() => {
            const subject = findSubject(activity.materiaId);
            const accent = showCourse ? courseAccent(activity.cursoId) : (subject?.color || "#e2e8f0");
            const courseNumber = String(activityCourse?.corto || activityCourse?.nombre || "").replace(/\D/g, "") || "I";
            return `
              <div class="flex items-stretch border-b border-slate-100" style="border-color:${accent}">
                <div class="min-w-0 flex-1 px-3 py-2 sm:px-4" style="background:${subject?.color || "#fff"}">
                  <p class="truncate text-[9px] font-semibold uppercase text-slate-500">${showCourse ? `${escapeHtml(activityCourse?.nombre || "")} · ` : ""}${activityEvaluationLabel(activity)}</p>
                  <div class="mt-0.5 flex min-w-0 items-center gap-2">
                    <h3 class="truncate text-sm font-semibold text-slate-900">${escapeHtml(subject?.nombre || activity.materiaId)} · ${escapeHtml(activity.titulo || "Sin titulo")}</h3>
                    <span class="shrink-0 rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-school-navy">${activity.maximo || 100} pts</span>
                  </div>
                </div>
                ${showCourse ? `<span class="grid w-10 place-items-center text-sm font-semibold text-white sm:w-12" style="background:${accent}">${escapeHtml(courseNumber)}</span>` : ""}
              </div>
            `;
          })() : ""}
          <div class="flex items-center justify-between gap-2 bg-school-navy px-3 py-2 text-white sm:px-4">
            <div class="min-w-0">
              <p class="text-[9px] font-medium uppercase text-white/70">${studentsToGrade.length} habilitados · ${gradedStudents.length} calificados</p>
              <h3 class="truncate text-sm font-semibold">${teacherState.gradeMode === "lista" ? "Lista de alumnos" : (currentStudent ? escapeHtml(currentStudent.nombre) : "Calificación guiada")}</h3>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <div class="flex rounded-xl bg-white/10 p-1">
                <button type="button" data-grade-mode="guiado" class="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${teacherState.gradeMode === "guiado" ? "bg-white text-school-navy" : "text-white/80 hover:bg-white/10"}">Guiado</button>
                <button type="button" data-grade-mode="lista" class="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${teacherState.gradeMode === "lista" ? "bg-white text-school-navy" : "text-white/80 hover:bg-white/10"}">Lista</button>
              </div>
              <button type="button" class="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white" data-close-student-grade>${icon("x", "h-4 w-4")}</button>
            </div>
          </div>
          ${studentsNotEnabled.length ? `
            <details class="mx-3 mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-medium text-amber-800 sm:mx-4">
              <summary class="cursor-pointer font-semibold">${studentsNotEnabled.length} alumno(s) ausentes. Clic para ver.</summary>
              <div class="mt-2 grid gap-1.5 sm:grid-cols-2">
                ${studentsNotEnabled.map((student) => `<div class="rounded-lg bg-white/70 px-2.5 py-1.5">${escapeHtml(studentOrderMap.get(student.id) || "-")}. ${escapeHtml(student.nombre)} · ${attendanceLabel(attendanceMap[student.id]?.estado || "falta")}</div>`).join("")}
              </div>
            </details>
          ` : ""}
          ${activity ? `
            <div class="mx-3 mt-2 flex flex-col gap-2 rounded-lg border px-3 py-2 sm:mx-4 sm:flex-row sm:items-center sm:justify-between ${reviewState === "cerrada" ? "border-green-200 bg-green-50" : reviewState === "en_proceso" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}">
              <div class="min-w-0">
                <p class="text-[10px] font-semibold uppercase tracking-wide ${reviewState === "cerrada" ? "text-green-700" : reviewState === "en_proceso" ? "text-amber-800" : "text-slate-500"}">${reviewState === "cerrada" ? "Revision finalizada" : reviewState === "en_proceso" ? "Revision en proceso" : "Revision sin iniciar"}</p>
                <p class="mt-0.5 text-[10px] leading-tight text-slate-600">${allGradedCount} de ${students.length} revisados${pendingLicenseCount ? ` · ${pendingLicenseCount} licencia(s) quedaran pendientes` : ""}</p>
                ${reviewState === "en_proceso" ? `<p class="mt-1 text-[9px] leading-tight text-amber-800">La actividad seguira en Calificar hasta terminar la revision. Los pendientes apareceran en Regularizacion desde mañana.</p>` : ""}
              </div>
              ${reviewState === "en_proceso" ? `
                <button type="button" data-finalize-activity-review class="shrink-0 rounded-lg bg-school-green px-3 py-1.5 text-[10px] font-semibold text-white shadow-sm transition hover:bg-school-navy">
                  ${icon("check-check", "mr-1 inline h-3.5 w-3.5")} Terminar revision
                </button>
              ` : reviewState === "sin_iniciar" ? `<span class="text-[10px] font-medium text-slate-500">Guarda la primera nota para comenzar.</span>` : ""}
            </div>
          ` : ""}
          ${activity ? `
            <div class="grid min-h-0 flex-1 gap-2 overflow-hidden p-2 ${teacherState.gradeMode === "lista" ? "" : "lg:grid-cols-[132px_1fr]"}">
              ${teacherState.gradeMode === "lista" ? "" : `
                <aside class="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p class="text-[9px] font-semibold uppercase text-slate-500">Calificados</p>
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
                      return `<button type="button" data-open-student-grade="${student.id}" class="inline-flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-[11px] font-semibold lg:w-full ${tone}">
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
                                ${didNotSubmit ? `${icon("ban", "h-4 w-4")}<span class="${listPickerStudent ? "hidden xl:inline" : ""}">${isMaterialActivity(activity) ? "No trajo" : "No presento"}</span>` : `${result?.nota ?? "-"}`}
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
                        <section class="grade-list-panel min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft">
                          <div class="flex items-stretch border-b border-slate-100" style="border-color:${accent}">
                            <div class="min-w-0 flex-1 px-3 py-2" style="background:${subject?.color || "#fff"}">
                              <p class="truncate text-[9px] font-semibold uppercase text-slate-500">${showCourse ? `${escapeHtml(activityCourse?.nombre || "")} · ` : ""}${escapeHtml(subject?.nombre || activity.materiaId)}</p>
                              <h4 class="mt-0.5 truncate text-sm font-semibold text-slate-900">${escapeHtml(activity.titulo || "Sin titulo")}</h4>
                            </div>
                            ${showCourse ? `<span class="grid w-10 place-items-center text-sm font-semibold text-white" style="background:${accent}">${escapeHtml(courseNumber)}</span>` : ""}
                          </div>
                          <div class="min-h-0 overflow-y-auto p-3">
                             <div class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                              <div class="min-w-0">
                                <p class="text-[9px] font-semibold uppercase text-slate-500">Alumno</p>
                                <h5 class="truncate text-sm font-semibold text-slate-900">${escapeHtml(listPickerStudent.nombre)}</h5>
                              </div>
                               <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-school-sky text-sm font-semibold text-school-navy">${escapeHtml(studentOrderMap.get(listPickerStudent.id) || "-")}</span>
                             </div>
                             ${gradeDeliveryEditor(activity, listPickerGrade, attendanceMap[listPickerStudent.id]?.estado || "", gradesMap)}
                             <p class="mt-2 text-center text-[11px] font-medium text-slate-500">Puntaje sobre ${activity.maximo || 100}</p>
                            <div class="mt-2 grid max-h-[38vh] grid-cols-5 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-8 lg:grid-cols-6 xl:grid-cols-8">
                              ${Array.from({ length: Math.min(Number(activity.maximo || 100), 100) }, (_, index) => index + 1).map((value) => {
                                const selected = Number(listPickerGrade?.valor) === value;
                                const result = normalizeGrade(value, activity.maximo);
                                const low = Number(result?.porcentaje || 0) < 50;
                                return `<button type="button" data-list-grade-auto="${value}" class="grid h-8 place-items-center rounded-md border text-xs font-semibold transition sm:h-9 sm:text-sm ${selected ? "border-green-600 bg-green-600 text-white" : low ? "border-red-200 bg-red-50 text-red-700 hover:border-red-400" : "border-slate-200 bg-slate-100 text-slate-700 hover:border-school-navy hover:bg-school-sky"}">${value}</button>`;
                              }).join("")}
                            </div>
                            <div class="mt-2 grid grid-cols-[1fr_auto] gap-2">
                              <button type="button" data-list-grade-no-work="${listPickerStudent.id}" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">${icon("ban", "mr-1 inline h-4 w-4")}${escapeHtml(noSubmissionLabel)}</button>
                              <button type="button" data-close-list-grade class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">Cerrar</button>
                            </div>
                            <p class="mt-2 hidden rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700" data-list-grade-status></p>
                          </div>
                        </section>
                      `;
                    })() : ""}
                  </div>
                ` : currentStudent ? `
                  <div class="text-center">
                     <div class="flex items-center justify-center gap-2.5">
                      <div class="grid h-9 w-9 place-items-center rounded-lg bg-school-sky text-sm font-semibold text-school-navy">${escapeHtml(studentOrderMap.get(currentStudent.id) || teacherState.gradeIndex + 1)}</div>
                      <div class="min-w-0 text-left">
                        <p class="text-[9px] font-semibold uppercase text-slate-500">Alumno ${teacherState.gradeIndex + 1} de ${studentsToGrade.length}</p>
                        <h4 class="truncate text-sm font-semibold text-slate-900 sm:text-base">${escapeHtml(currentStudent.nombre)}</h4>
                       </div>
                     </div>
                      ${gradeDeliveryEditor(activity, currentGrade, attendanceMap[currentStudent.id]?.estado || "", gradesMap)}
                     <p class="mt-2 text-[11px] font-medium text-slate-500">Puntaje sobre ${activity.maximo || 100}</p>
                    <div class="mt-2 grid max-h-[38vh] grid-cols-5 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-8 lg:grid-cols-10">
                      ${Array.from({ length: Math.min(Number(activity.maximo || 100), 100) + 1 }, (_, value) => {
                        const selected = Number(currentGrade?.valor) === value;
                        return `<button type="button" data-date-grade-auto="${value}" class="grid h-8 min-w-0 place-items-center rounded-md border text-xs font-semibold transition sm:h-9 sm:text-sm ${selected ? "border-green-600 bg-green-600 text-white" : "border-slate-200 bg-slate-100 text-slate-700 hover:border-school-navy hover:bg-school-sky"}">${value}</button>`;
                      }).join("")}
                    </div>
                    <div class="mt-2 grid grid-cols-3 gap-1.5">
                      <button type="button" data-date-grade-prev class="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-semibold text-school-navy">${icon("chevron-left", "mr-1 inline h-4 w-4")}Anterior</button>
                      <button type="button" data-grade-no-work="${currentStudent.id}" class="rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-[11px] font-semibold text-red-700">${icon("x-circle", "mr-1 inline h-4 w-4")}${escapeHtml(noSubmissionShortLabel)}</button>
                      <button type="button" data-date-grade-next class="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-semibold text-school-navy">Siguiente${icon("chevron-right", "ml-1 inline h-4 w-4")}</button>
                    </div>
                    <p class="mt-2 hidden rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700" data-auto-grade-status></p>
                  </div>
                ` : `<div>${emptyState("Todo calificado", "No quedan alumnos pendientes para esta actividad.")}</div>`}
              </div>
            </div>
          ` : ""}
        </section>
      </div>
    </section>
  `;

  bindGradeDeliveryEditor(container);
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
  container.querySelector("[data-finalize-activity-review]")?.addEventListener("click", async (event) => {
    if (!activity) return;
    const detail = pendingDefinitiveCount
      ? `${pendingDefinitiveCount} alumno(s) sin nota se marcaran como no presentaron.`
      : "No quedan alumnos sin revisar.";
    const licenseDetail = pendingLicenseCount
      ? `\n${pendingLicenseCount} alumno(s) con licencia seguiran pendientes y no perderan Responsabilidad.`
      : "";
    if (!confirm(`Terminar la revision de esta actividad?\n\n${detail}${licenseDetail}\n\nLos pendientes apareceran en Regularizacion desde mañana.`)) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Finalizando...";
    try {
      const result = await finalizeActivityReview({ activity, students, attendanceMap, gradesMap });
      upsertTeacherNotesSnapshotActivity(context, result.activity);
      result.grades.forEach((grade) => upsertTeacherNotesSnapshotGrade(context, result.activity, grade));
      teacherState.gradeStudentId = "";
      await renderDateGrading(context);
    } catch (error) {
      alert(error?.code === "permission-denied" ? "Sin permiso para finalizar la revision." : (error.message || "No se pudo finalizar la revision."));
      button.disabled = false;
      button.textContent = "Terminar revision";
    }
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
        const savedGrade = await saveGrade({ activity, student, value, ...readGradeDelivery(container, activity, student, attendanceMap) });
        upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
        if (status) status.textContent = "Nota guardada";
        const nextStudent = nextPendingStudent(student);
        teacherState.gradeStudentId = nextStudent?.id || "";
        teacherState.gradeIndex = nextStudent ? studentsToGrade.findIndex((item) => item.id === nextStudent.id) : Math.max(studentsToGrade.length - 1, 0);
        teacherState.gradeModalClosed = !nextStudent && resolvedActivityReviewState(activity, gradesMap) === "cerrada";
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
      const savedGrade = await saveGrade({
        activity,
        student,
        value: 0,
        estadoEntrega: DELIVERY_STATES.NOT_SUBMITTED,
        asistenciaActividad: attendanceMap[student.id]?.estado || ""
      });
      upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
      const nextStudent = nextPendingStudent(student);
      teacherState.gradeStudentId = nextStudent?.id || "";
      teacherState.gradeIndex = nextStudent ? studentsToGrade.findIndex((item) => item.id === nextStudent.id) : Math.max(studentsToGrade.length - 1, 0);
      teacherState.gradeModalClosed = !nextStudent && resolvedActivityReviewState(activity, gradesMap) === "cerrada";
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
        const savedGrade = await saveGrade({ activity, student, value, ...readGradeDelivery(container, activity, student, attendanceMap) });
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
      status.textContent = isMaterialActivity(activity) ? "Guardando como no trajo..." : "Guardando como no presentado...";
    }
    try {
      const savedGrade = await saveGrade({
        activity,
        student,
        value: 0,
        estadoEntrega: DELIVERY_STATES.NOT_SUBMITTED,
        asistenciaActividad: attendanceMap[student.id]?.estado || ""
      });
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

function notesEditConfirmationModal(mode = "", changeCount = 0) {
  if (!mode) return "";
  const isSave = mode === "save";
  return `
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-3" data-notes-edit-confirmation-backdrop>
      <section class="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl">
        <header class="border-b border-slate-100 px-4 py-4 sm:px-5">
          <div class="flex items-start gap-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isSave ? "bg-amber-50 text-amber-700" : "bg-green-50 text-school-green"}">
              ${icon(isSave ? "shield-alert" : "pencil-line", "h-5 w-5")}
            </span>
            <div class="min-w-0">
              <p class="text-[10px] font-semibold uppercase tracking-[.14em] ${isSave ? "text-amber-700" : "text-school-green"}">${isSave ? "Segunda confirmacion" : "Primera confirmacion"}</p>
              <h3 class="mt-1 text-lg font-semibold text-slate-900">${isSave ? "Guardar cambios de notas" : "Habilitar edicion"}</h3>
            </div>
          </div>
        </header>
        <div class="space-y-3 px-4 py-4 text-sm text-slate-600 sm:px-5">
          ${isSave
            ? `<p>Se modificaran <strong class="font-semibold text-slate-900">${changeCount} calificacion(es)</strong> en Firebase. Los promedios se recalcularan inmediatamente.</p>
               <p class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Verifica los puntajes antes de confirmar. Esta accion quedara registrada.</p>`
            : `<p>Podras editar solamente calificaciones que ya fueron registradas. Las actividades pendientes continuaran en Calificar o Regularizacion.</p>
               <p class="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">Los valores se muestran en su puntaje original, respetando el maximo de cada actividad.</p>`}
        </div>
        <footer class="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button type="button" data-close-notes-edit-confirmation class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">Cancelar</button>
          <button type="button" ${isSave ? "data-confirm-notes-save" : "data-confirm-notes-edit"} class="inline-flex items-center justify-center gap-2 rounded-xl ${isSave ? "bg-amber-600 hover:bg-amber-700" : "bg-school-green hover:bg-school-navy"} px-4 py-2.5 text-xs font-semibold text-white transition">
            ${icon(isSave ? "save" : "pencil", "h-4 w-4")} ${isSave ? `Guardar ${changeCount} cambio(s)` : "Habilitar edicion"}
          </button>
        </footer>
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

function regularizationSearchKey(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function regularizationPendingReason(grade, attendanceState = "") {
  const deliveryState = deliveryStateForGrade(grade);
  if (grade && Number(grade.valor || 0) > 0) return "";
  if ([DELIVERY_STATES.NOT_SUBMITTED, DELIVERY_STATES.LICENSE_PENDING, DELIVERY_STATES.UNREVIEWED].includes(deliveryState)) return "No presento";
  if (!grade || Number(grade.valor || 0) <= 0) return "No presento";
  return "";
}

function regularizationAttendanceInfo(attendanceState = "") {
  const attendance = String(attendanceState || "").trim().toLowerCase();
  if (["permiso", "licencia"].includes(attendance)) {
    return {
      id: "licencia",
      label: "Licencia",
      detail: "Ausencia justificada",
      icon: "shield-check",
      priority: 0,
      badgeTone: "bg-purple-50 text-purple-700 ring-purple-200",
      railTone: "border-purple-200 bg-purple-100 text-purple-800",
      segmentTone: "bg-purple-500"
    };
  }
  if (attendance === "falta") {
    return {
      id: "falta",
      label: "Falta",
      detail: "Faltó a clases",
      icon: "user-x",
      priority: 1,
      badgeTone: "bg-red-50 text-red-700 ring-red-200",
      railTone: "border-red-200 bg-red-100 text-red-800",
      segmentTone: "bg-red-500"
    };
  }
  if (["presente", "atraso"].includes(attendance)) {
    return {
      id: "presente",
      label: "Presente",
      detail: attendance === "atraso" ? "Asistió con atraso" : "Asistió pero no presentó",
      icon: "user-check",
      priority: 2,
      badgeTone: "bg-amber-50 text-amber-800 ring-amber-200",
      railTone: "border-amber-200 bg-amber-100 text-amber-900",
      segmentTone: "bg-amber-400"
    };
  }
  return {
    id: "sin_registro",
    label: "Sin registro",
    detail: "No existe asistencia para ese día",
    icon: "circle-help",
    priority: 3,
    badgeTone: "bg-slate-100 text-slate-700 ring-slate-200",
    railTone: "border-slate-200 bg-slate-100 text-slate-700",
    segmentTone: "bg-slate-400"
  };
}

function regularizationPendingPriority(items = []) {
  return items.length
    ? Math.min(...items.map((item) => regularizationAttendanceInfo(item.pendienteAsistencia).priority))
    : 9;
}

function regularizationPendingTone(reason = "") {
  if (reason === "No presento") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function regularizationPendingIcon(reason = "") {
  if (reason === "No presento") return "circle-x";
  return "circle-help";
}

function regularizationSegmentTone(attendanceState = "") {
  return regularizationAttendanceInfo(attendanceState).segmentTone;
}

function regularizationPendingBar(items = [], type = "hacer") {
  const filtered = items.filter((item) => (isSaberActivity(item) ? "saber" : "hacer") === type);
  const slots = 10;
  return `
    <div class="min-w-0">
      <div class="mb-1 flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
        <span>${type === "saber" ? "Saber" : "Hacer"}</span>
        <span>${filtered.length}</span>
      </div>
      <div class="grid h-4 grid-cols-10 gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5" role="img" aria-label="${filtered.length} actividad(es) pendientes de ${type}">
        ${Array.from({ length: slots }, (_, index) => {
          const item = filtered[index];
          const attendanceInfo = item ? regularizationAttendanceInfo(item.pendienteAsistencia) : null;
          return `<span class="min-w-0 rounded-[2px] ${attendanceInfo ? attendanceInfo.segmentTone : "bg-slate-200"}"${item ? ` title="${escapeHtml(item.titulo || "Actividad")} · No presentó · ${escapeHtml(attendanceInfo.label)}"` : ""}></span>`;
        }).join("")}
      </div>
    </div>
  `;
}

function regularizationStudentReportModal({
  student,
  activities = [],
  gradesMap = {},
  attendanceRows = [],
  displayNumber = "",
  course = null
}) {
  if (!student) return "";

  const reportItems = activities
    .map((activity) => {
      const grade = gradesMap[activity.id]?.[student.id] || null;
      const attendanceState = attendanceStateForDate(student.id, activity.fecha, attendanceRows);
      const pendingReason = regularizationPendingReason(grade, attendanceState);
      return {
        activity,
        attendanceState,
        pendingReason
      };
    })
    .filter((item) => item.pendingReason)
    .sort((a, b) => {
      const typeOrder = Number(isSaberActivity(b.activity)) - Number(isSaberActivity(a.activity));
      return typeOrder
        || regularizationAttendanceInfo(a.attendanceState).priority - regularizationAttendanceInfo(b.attendanceState).priority
        || String(a.activity.fecha || "").localeCompare(String(b.activity.fecha || ""));
    });
  const reportGroups = [
    {
      id: "saber",
      label: "Saber",
      headerClass: "border-amber-200 bg-amber-50 text-amber-900",
      badgeClass: "bg-amber-100 text-amber-800",
      items: reportItems.filter((item) => isSaberActivity(item.activity))
    },
    {
      id: "hacer",
      label: "Hacer",
      headerClass: "border-green-200 bg-green-50 text-school-green",
      badgeClass: "bg-green-100 text-school-green",
      items: reportItems.filter((item) => !isSaberActivity(item.activity))
    }
  ].filter((group) => group.items.length);
  const saberCount = reportItems.filter((item) => isSaberActivity(item.activity)).length;
  const hacerCount = reportItems.length - saberCount;

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-5">
      <section class="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-3xl">
        <header class="shrink-0 border-b border-slate-200 bg-white px-3 py-3 sm:px-5 sm:py-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[9px] font-semibold uppercase tracking-[.14em] text-school-green sm:text-[10px]">Pendientes del estudiante</p>
              <h3 class="mt-0.5 truncate text-base font-semibold text-slate-900 sm:text-xl">${escapeHtml(displayNumber)}. ${escapeHtml(student.nombre)}</h3>
              <p class="mt-1 text-[10px] text-slate-500 sm:text-xs">${course ? `${escapeHtml(course.nombre)} · ` : ""}Solo se muestran actividades que todavia debe regularizar.</p>
            </div>
            <button type="button" data-close-regularization-report class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200 sm:h-9 sm:w-9 sm:rounded-xl" aria-label="Cerrar">
              ${icon("x", "h-4 w-4 sm:h-5 sm:w-5")}
            </button>
          </div>
          <div class="mt-3 grid grid-cols-3 gap-1.5 sm:max-w-lg sm:gap-2">
            <div class="rounded-lg bg-green-50 px-3 py-2">
              <p class="text-[9px] font-medium uppercase text-slate-500">Hacer</p>
              <p class="mt-0.5 text-lg font-semibold text-school-green">${hacerCount}</p>
            </div>
            <div class="rounded-lg bg-amber-50 px-3 py-2">
              <p class="text-[9px] font-medium uppercase text-slate-500">Saber</p>
              <p class="mt-0.5 text-lg font-semibold text-amber-800">${saberCount}</p>
            </div>
            <div class="rounded-lg bg-red-50 px-3 py-2">
              <p class="text-[9px] font-medium uppercase text-slate-500">Total</p>
              <p class="mt-0.5 text-lg font-semibold text-red-600">${reportItems.length}</p>
            </div>
          </div>
        </header>
        <div class="min-h-0 flex-1 space-y-3 overflow-auto bg-slate-50/70 p-2.5 sm:p-4">
          ${reportItems.length ? `
            ${reportGroups.map((group) => `
              <section class="overflow-hidden rounded-xl border ${group.headerClass}">
                <div class="flex items-center justify-between gap-2 border-b border-current/10 px-3 py-2">
                  <span class="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${group.badgeClass}">${group.label}</span>
                  <span class="text-[10px] font-semibold">${group.items.length} pendiente(s)</span>
                </div>
                <div class="divide-y divide-slate-100 bg-white">
                  ${group.items.map(({ activity, attendanceState, pendingReason }) => {
                    const subject = findSubject(activity.materiaId);
                    const attendanceInfo = regularizationAttendanceInfo(attendanceState);
                    return `
                      <article class="grid grid-cols-[auto_minmax(0,1fr)] overflow-hidden bg-white">
                        <span class="regularization-attendance-rail flex min-h-24 items-center justify-center border-r px-1.5 py-2 text-[9px] font-semibold uppercase ${attendanceInfo.railTone}" title="${escapeHtml(attendanceInfo.detail)}">${escapeHtml(attendanceInfo.label)}</span>
                        <div class="grid min-w-0 gap-2 px-3 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-1.5">
                              <span class="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">${escapeHtml(subject?.nombre || activity.materiaId || "Materia")}</span>
                              <span class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset ${regularizationPendingTone(pendingReason)}">${icon(regularizationPendingIcon(pendingReason), "h-3 w-3")} No presentó</span>
                            </div>
                            <p class="mt-1 truncate text-xs font-semibold text-slate-900 sm:text-sm" title="${escapeHtml(activity.titulo || "Actividad")}">${escapeHtml(activity.titulo || "Actividad")}</p>
                            <p class="mt-0.5 text-[9px] text-slate-500 sm:text-[10px]">${escapeHtml(activity.fecha ? activity.fecha.split("-").reverse().join("/") : "Sin fecha")} · ${escapeHtml(attendanceInfo.detail)}</p>
                          </div>
                          <button type="button" data-regularization-grade-activity="${activity.id}" data-regularization-grade-student="${student.id}" class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-school-green px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-school-navy">
                            ${icon("pencil", "h-3.5 w-3.5")} Calificar
                          </button>
                        </div>
                      </article>
                    `;
                  }).join("")}
                </div>
              </section>
            `).join("")}
          ` : `<div class="rounded-xl border border-green-200 bg-green-50 px-4 py-8 text-center text-xs font-semibold text-school-green">Este alumno ya no tiene actividades pendientes.</div>`}
        </div>
      </section>
    </div>
  `;
}

function regularizationGradeModal({ activity, student, currentGrade, attendanceState = "", pendingReason = "", displayNumber = "", hasNext = false }) {
  if (!activity || !student) return "";
  const subject = findSubject(activity.materiaId);
  const max = Math.max(1, Math.min(100, Number(activity.maximo || 100)));
  const quickValues = max <= 20 ? Array.from({ length: max }, (_, index) => index + 1) : [];
  const currentValue = Number(currentGrade?.valor || "");
  const currentDeliveryState = deliveryStateForGrade(currentGrade);
  const attendanceInfo = regularizationAttendanceInfo(attendanceState);
  const responsibilityValue = attendanceInfo.id === "licencia" || currentDeliveryState === DELIVERY_STATES.ON_TIME ? 100 : 50;
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-3 py-5">
      <section class="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="bg-school-green px-4 py-3 text-white">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[10px] font-black uppercase tracking-[.16em] text-white/75">Regularizacion</p>
              <h3 class="mt-0.5 truncate text-lg font-black">${escapeHtml(displayNumber)}. ${escapeHtml(student.nombre)}</h3>
              <p class="mt-1 truncate text-xs font-bold text-white/80">${activity.cursoNombre ? `${escapeHtml(activity.cursoNombre)} · ` : ""}${escapeHtml(subject?.nombre || activity.materiaId)} · ${escapeHtml(activity.titulo || "Actividad")}</p>
            </div>
            <button type="button" data-close-regularization-grade class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20">${icon("x", "h-5 w-5")}</button>
          </div>
        </div>
        <div class="space-y-3 p-4">
          <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-stretch overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <span class="regularization-attendance-rail flex min-h-20 items-center justify-center border-r px-1.5 py-2 text-[9px] font-semibold uppercase ${attendanceInfo.railTone}">${escapeHtml(attendanceInfo.label)}</span>
            <div class="self-center px-3 py-2">
              <p class="text-[10px] font-semibold uppercase text-slate-500">Estado de la actividad</p>
              <span class="mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${regularizationPendingTone(pendingReason)}">
                ${icon(regularizationPendingIcon(pendingReason), "h-3.5 w-3.5")} No presentó
              </span>
              <p class="mt-1 text-[10px] text-slate-500">${escapeHtml(attendanceInfo.detail)}</p>
            </div>
            <div class="self-center px-3 py-2 text-right">
              <p class="text-[10px] font-semibold uppercase text-slate-500">Sobre</p>
              <p class="text-xl font-semibold text-slate-900">${max}</p>
            </div>
          </div>
          <div class="rounded-xl border px-3 py-2 text-xs font-semibold ${responsibilityValue === 100 ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}">
            ${responsibilityValue === 100 ? "Licencia justificada: puede regularizar sin perder puntos de Responsabilidad." : "Entrega posterior: conservará su calificación y aportará 50 a Responsabilidad."}
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
            <div class="grid gap-2 ${hasNext ? "sm:grid-cols-2" : ""}">
              <button type="button" data-save-regularization-grade-input class="w-full rounded-xl border border-school-green px-3 py-2.5 text-xs font-semibold text-school-green transition hover:bg-green-50">Guardar</button>
              ${hasNext ? `<button type="button" data-save-next-regularization-grade-input class="w-full rounded-xl bg-school-green px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-school-navy">Guardar y siguiente</button>` : ""}
            </div>
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
  const courses = context?.courses || [];
  const primaryCourse = courses[0] || null;
  const coursesById = Object.fromEntries(courses.map((item) => [item.id, item]));
  const showCourse = courses.length > 1;
  if (!container) return;
  if (!primaryCourse) {
    container.innerHTML = emptyState("Sin cursos asignados", "Admin debe asignarte un curso antes de revisar regularizacion.");
    return;
  }

  const courseSnapshots = await Promise.all(courses.map(async (course) => ({
    course,
    cacheMeta: getTeacherDataCacheMeta(context, "notas", course.id, teacherState.trimesterId),
    snapshot: await getTeacherNotesSnapshot(context, course, teacherState.trimesterId)
  })));
  const availableSnapshots = courseSnapshots.filter((entry) => entry.snapshot);
  const latestCacheMeta = availableSnapshots
    .map((entry) => entry.cacheMeta)
    .filter(Boolean)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null;
  const refreshAllRegularization = async () => {
    await Promise.all(courses.map((course) => refreshTeacherNotesSnapshot(context, course, teacherState.trimesterId)));
  };

  if (!availableSnapshots.length) {
    container.innerHTML = `
      <section class="teacher-module-surface rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        ${teacherModuleHeading({
          title: "Regularizacion",
          course: showCourse ? `${courses.length} cursos asignados` : primaryCourse.nombre,
          trimester: selectedTrimester().label,
          detail: "Entregas pendientes"
        })}
        <p class="mt-3 max-w-2xl text-sm font-normal text-slate-500">Carga los datos para revisar solamente actividades cerradas que siguen sin presentarse.</p>
        <button type="button" data-refresh-regularization-cache class="mt-4 inline-flex items-center gap-2 rounded-2xl bg-school-green px-4 py-3 text-sm font-black text-white shadow-soft transition hover:bg-school-navy">
          ${icon("cloud-download", "h-4 w-4")} Cargar regularizacion
        </button>
      </section>
    `;
    container.querySelector("[data-refresh-regularization-cache]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Cargando...";
      await refreshAllRegularization();
      await renderRegularization(context);
    });
    refreshIcons();
    return;
  }

  const students = availableSnapshots.flatMap(({ course, snapshot }) => (snapshot.students || []).map((student) => ({
    ...student,
    cursoId: student.cursoId || course.id,
    cursoNombre: course.nombre
  })));
  const activities = availableSnapshots.flatMap(({ course, snapshot }) => (snapshot.activities || []).map((activity) => ({
    ...activity,
    cursoId: activity.cursoId || course.id,
    cursoNombre: course.nombre
  })));
  const gradesList = availableSnapshots.flatMap(({ snapshot }) => snapshot.gradesList || []);
  const attendanceRows = availableSnapshots.flatMap(({ snapshot }) => snapshot.attendanceRows || []);
  const studentsByName = sortStudentsByName(students);
  const regularizationOrderMap = new Map(studentsByName.map((student, index) => [student.id, index + 1]));
  const gradesMap = gradeByActivityAndStudent(gradesList);
  const currentDate = todayIso();
  const activitiesToReview = activities
    .filter((item) => coursesById[item.cursoId]?.materias?.includes(item.materiaId))
    .filter((item) => !item.interno && !["ser", "auto"].includes(String(item.tipo || "").toLowerCase()))
    .filter((item) => !isMaterialActivity(item) || isScoredMaterialActivity(item))
    .filter((item) => !item.fecha || item.fecha <= currentDate)
    .map((item) => {
      const activityGrades = gradesMap[item.id] || {};
      const reviewState = resolvedActivityReviewState(item, activityGrades);
      const reviewStarted = ["en_proceso", "cerrada"].includes(reviewState);
      const availableFrom = String(item.regularizacionDesde || "").slice(0, 10);
      const closedDate = String(item.revisionFinalizadaFecha || "").slice(0, 10);
      const closedAndAvailable = reviewState === "cerrada" && (
        availableFrom ? availableFrom <= currentDate : (!closedDate || closedDate < currentDate)
      );
      return {
        ...item,
        regularizacionRevisionIniciada: reviewStarted,
        regularizacionCerradaDisponible: closedAndAvailable
      };
    })
    .filter((item) => item.regularizacionRevisionIniciada)
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  const activitiesStillInGrading = activitiesToReview.filter((item) => !item.regularizacionCerradaDisponible).length;

  const pendingByStudent = [];
  studentsByName.forEach((student) => {
    const pending = [];
    activitiesToReview.forEach((activity) => {
      if (String(activity.cursoId || "") !== String(student.cursoId || "")) return;
      const grade = gradesMap[activity.id]?.[student.id];
      const attendanceState = attendanceStateForDate(student.id, activity.fecha, attendanceRows);
      const pendingReason = regularizationPendingReason(grade, attendanceState);
      const deliveryState = deliveryStateForGrade(grade);
      const explicitNoSubmission = deliveryState === DELIVERY_STATES.NOT_SUBMITTED;
      const absentOnActivityDate = ["falta", "permiso", "licencia"].includes(String(attendanceState || "").toLowerCase());
      const visibleImmediately = explicitNoSubmission || (!grade && absentOnActivityDate);
      if (pendingReason && (activity.regularizacionCerradaDisponible || visibleImmediately)) {
        pending.push({
          ...activity,
          pendienteMotivo: pendingReason,
          pendienteAsistencia: attendanceState,
          pendienteTipo: isSaberActivity(activity) ? "saber" : "hacer"
        });
      }
    });
    if (pending.length) pendingByStudent.push({ student, items: pending });
  });

  const pendingTotal = pendingByStudent.reduce((total, item) => total + item.items.length, 0);
  const attendancePendingTotals = pendingByStudent
    .flatMap((item) => item.items)
    .reduce((totals, activity) => {
      const attendanceInfo = regularizationAttendanceInfo(activity.pendienteAsistencia);
      totals[attendanceInfo.id] = (totals[attendanceInfo.id] || 0) + 1;
      return totals;
    }, {});
  const licenseTotal = attendancePendingTotals.licencia || 0;
  const absenceTotal = attendancePendingTotals.falta || 0;
  const presentTotal = attendancePendingTotals.presente || 0;
  const clearSearch = regularizationSearchKey(teacherState.regularizationSearch);
  const pendingRows = pendingByStudent
    .filter(({ student }) => !clearSearch || regularizationSearchKey(student.nombre).includes(clearSearch))
    .sort((a, b) => {
      return regularizationPendingPriority(a.items) - regularizationPendingPriority(b.items)
        || b.items.length - a.items.length
        || String(a.student.nombre || "").localeCompare(String(b.student.nombre || ""), "es", { sensitivity: "base" });
    });
  const regularizationQueue = pendingRows.flatMap(({ student, items }) => [...items]
    .sort((a, b) => regularizationPendingPriority([a]) - regularizationPendingPriority([b])
      || String(a.fecha || "").localeCompare(String(b.fecha || "")))
    .map((activity) => ({ activity, student })));
  const selectedRegularizationTarget = regularizationQueue.find(({ activity, student }) => (
    activity.id === teacherState.regularizationGradeActivityId
    && student.id === teacherState.regularizationGradeStudentId
  )) || null;
  const selectedRegularizationActivity = selectedRegularizationTarget?.activity || null;
  const selectedRegularizationStudent = selectedRegularizationTarget?.student || null;
  const selectedRegularizationReportEntry = pendingByStudent.find(({ student }) => student.id === teacherState.regularizationReportStudentId) || null;
  const selectedRegularizationReportStudent = selectedRegularizationReportEntry?.student || null;
  const selectedRegularizationGrade = selectedRegularizationActivity && selectedRegularizationStudent
    ? gradesMap[selectedRegularizationActivity.id]?.[selectedRegularizationStudent.id]
    : null;
  const selectedRegularizationAttendanceState = selectedRegularizationActivity && selectedRegularizationStudent
    ? attendanceStateForDate(selectedRegularizationStudent.id, selectedRegularizationActivity.fecha, attendanceRows)
    : "";
  const selectedRegularizationPendingReason = regularizationPendingReason(selectedRegularizationGrade, selectedRegularizationAttendanceState);
  const currentQueueIndex = regularizationQueue.findIndex(({ activity, student }) => activity.id === selectedRegularizationActivity?.id && student.id === selectedRegularizationStudent?.id);
  const nextRegularizationTarget = currentQueueIndex >= 0 ? regularizationQueue[currentQueueIndex + 1] || null : null;

  container.innerHTML = `
    <section class="space-y-3 sm:space-y-4">
      <div class="teacher-module-surface rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:rounded-3xl sm:p-4">
        <div class="teacher-module-header flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          ${teacherModuleHeading({
            title: "Regularizacion",
            course: showCourse ? `${courses.length} cursos asignados` : primaryCourse.nombre,
            trimester: selectedTrimester().label,
            detail: "Entregas pendientes y ausencias"
          })}
          <div class="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
              <span class="inline-flex items-center gap-1 rounded-md border border-green-100 bg-green-50 px-2 py-1 text-[9px] font-medium text-school-green sm:gap-2 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-[10px]">${icon("calendar-check", "h-3 w-3 sm:h-3.5 sm:w-3.5")} ${latestCacheMeta ? `Copia: ${escapeHtml(latestCacheMeta.label)}` : "Sin copia local"}</span>
              ${showCourse ? `<span class="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-medium text-slate-600 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-[10px]">${availableSnapshots.length}/${courses.length} cursos cargados</span>` : ""}
              <button type="button" data-refresh-regularization-cache class="inline-flex items-center gap-1 rounded-md border border-school-green bg-white px-2 py-1 text-[9px] font-semibold text-school-green transition hover:bg-school-green hover:text-white sm:gap-2 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-[10px]">
                ${icon("refresh-cw", "h-3 w-3 sm:h-4 sm:w-4")} Actualizar
              </button>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
          <div class="rounded-lg bg-slate-50 px-2.5 py-2">
            <p class="text-[8px] font-semibold uppercase text-slate-500 sm:text-[9px]">Alumnos</p>
            <p class="mt-0.5 text-lg font-semibold text-slate-900">${pendingByStudent.length}</p>
          </div>
          <div class="rounded-lg bg-amber-50 px-2.5 py-2">
            <p class="text-[8px] font-semibold uppercase text-amber-800 sm:text-[9px]">Presentes</p>
            <p class="mt-0.5 text-lg font-semibold text-amber-800">${presentTotal}</p>
          </div>
          <div class="rounded-lg bg-red-50 px-2.5 py-2">
            <p class="text-[8px] font-semibold uppercase text-red-700 sm:text-[9px]">Faltas</p>
            <p class="mt-0.5 text-lg font-semibold text-red-700">${absenceTotal}</p>
          </div>
          <div class="rounded-lg bg-purple-50 px-2.5 py-2">
            <p class="text-[8px] font-semibold uppercase text-purple-700 sm:text-[9px]">Licencias</p>
            <p class="mt-0.5 text-lg font-semibold text-purple-700">${licenseTotal}</p>
          </div>
        </div>
        ${activitiesStillInGrading ? `
          <div class="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-snug text-amber-900 sm:text-xs">
            ${icon("clock-3", "mt-0.5 h-3.5 w-3.5 shrink-0")}
            <span><strong class="font-semibold">${activitiesStillInGrading} actividad(es)</strong> siguen abiertas en Calificar. Los demás pendientes aparecerán al terminar su revisión.</span>
          </div>
        ` : ""}
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-soft sm:rounded-3xl sm:p-4">
        <div class="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold text-slate-900 sm:text-base">Alumnos por regularizar</h3>
              <span class="rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-semibold text-red-600 sm:text-[10px]">${pendingTotal} pendiente(s)</span>
            </div>
            <p class="mt-0.5 text-[9px] leading-tight text-slate-500 sm:text-[10px]">${pendingByStudent.length ? "Todos figuran como No presentó; el color lateral indica su asistencia ese día." : "Aquí aparecerán solamente los alumnos que ya pueden regularizar una entrega."}</p>
          </div>
          ${pendingByStudent.length ? `<label class="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-slate-500 focus-within:border-school-green focus-within:bg-white lg:max-w-sm">
              ${icon("search", "h-3.5 w-3.5 sm:h-4 sm:w-4")}
              <input type="search" value="${escapeHtml(teacherState.regularizationSearch)}" data-regularization-search placeholder="Buscar alumno con pendientes..." class="min-w-0 flex-1 bg-transparent text-[11px] text-slate-800 outline-none sm:text-xs">
              ${teacherState.regularizationSearch ? `<button type="button" data-clear-regularization-search class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Limpiar busqueda">${icon("x", "h-3.5 w-3.5")}</button>` : ""}
          </label>` : ""}
        </div>
        ${pendingByStudent.length ? `<div class="mt-2 flex flex-wrap gap-1.5 text-[8px] sm:mt-3 sm:text-[9px]">
          <span class="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-1 text-red-700 ring-1 ring-inset ring-red-200">${icon("circle-x", "h-3 w-3")} Estado: No presentó</span>
          <span class="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-1 text-amber-800 ring-1 ring-inset ring-amber-200">${icon("user-check", "h-3 w-3")} Presente</span>
          <span class="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-1 text-red-700 ring-1 ring-inset ring-red-200">${icon("user-x", "h-3 w-3")} Falta</span>
          <span class="inline-flex items-center gap-1 rounded-md bg-purple-50 px-1.5 py-1 text-purple-700 ring-1 ring-inset ring-purple-200">${icon("shield-check", "h-3 w-3")} Licencia prioritaria</span>
        </div>` : ""}
        <div class="mt-3 grid gap-2 lg:grid-cols-2">
          ${pendingRows.length ? pendingRows.map(({ student, items }) => {
            const attendanceCounts = items.reduce((counts, item) => {
              const attendanceInfo = regularizationAttendanceInfo(item.pendienteAsistencia);
              const current = counts[attendanceInfo.id] || { info: attendanceInfo, count: 0 };
              counts[attendanceInfo.id] = { ...current, count: current.count + 1 };
              return counts;
            }, {});
            const attendanceSummaries = Object.values(attendanceCounts).sort((a, b) => a.info.priority - b.info.priority);
            const studentCourse = coursesById[student.cursoId] || coursesById[items[0]?.cursoId] || primaryCourse;
            const courseNumber = String(studentCourse?.corto || studentCourse?.nombre || "")
              .replace(/\D/g, "") || "I";
            const courseColor = courseAccent(studentCourse?.id || student.cursoId);
            return `
              <button type="button" data-regularization-report-student="${student.id}" class="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-stretch gap-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-school-green/50 hover:shadow-soft sm:p-3">
                <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-school-sky text-sm font-semibold text-school-green">${regularizationOrderMap.get(student.id) || "-"}</span>
                <span class="min-w-0">
                  <span class="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span class="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900 sm:text-sm" title="${escapeHtml(student.nombre)}">${escapeHtml(student.nombre)}</span>
                    <span class="rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-semibold text-red-600">${items.length} sin presentar</span>
                    ${showCourse ? `<span class="rounded-md px-1.5 py-0.5 text-[8px] font-semibold text-white" style="background:${courseColor}">${escapeHtml(studentCourse?.nombre || "Curso")}</span>` : ""}
                  </span>
                  <span class="mt-2 grid grid-cols-2 gap-2">
                    ${regularizationPendingBar(items, "hacer")}
                    ${regularizationPendingBar(items, "saber")}
                  </span>
                </span>
                <span class="flex min-h-14 shrink-0 items-stretch gap-1">
                  ${attendanceSummaries.map(({ info, count }) => `<span class="regularization-attendance-rail flex min-h-14 w-5 items-center justify-center rounded-md border px-1 py-1 text-[8px] font-semibold uppercase ${info.railTone}" title="${escapeHtml(`${info.label}: ${count} pendiente(s)`)}">${escapeHtml(info.label)} ${count}</span>`).join("")}
                  ${showCourse ? `<span class="flex w-9 shrink-0 flex-col items-center justify-center rounded-lg text-white shadow-sm" style="background:${courseColor}" title="${escapeHtml(studentCourse?.nombre || "Curso")}"><span class="text-sm font-semibold leading-none">${escapeHtml(courseNumber)}</span><span class="mt-0.5 text-[7px] font-medium uppercase leading-none text-white/80">Curso</span></span>` : ""}
                </span>
              </button>
            `;
          }).join("") : `
            <div class="lg:col-span-2 rounded-xl border ${pendingByStudent.length ? "border-slate-200 bg-slate-50 text-slate-600" : activitiesStillInGrading ? "border-amber-200 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-school-green"} px-4 py-7 text-center sm:py-8">
              ${icon(pendingByStudent.length ? "search-x" : activitiesStillInGrading ? "clock-3" : "circle-check-big", "mx-auto h-7 w-7")}
              <p class="mt-2 text-sm font-semibold">${pendingByStudent.length ? "No se encontro un alumno con esa busqueda." : activitiesStillInGrading ? "Todavia hay revisiones abiertas en Calificar." : "No hay alumnos pendientes de regularizacion."}</p>
              ${!pendingByStudent.length && activitiesStillInGrading ? `
                <p class="mx-auto mt-1 max-w-lg text-[10px] leading-relaxed text-amber-800 sm:text-xs">Finaliza la revisión de esas actividades para enviar aquí a quienes no presentaron.</p>
                <a href="#/docente/calificar" class="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-school-green px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-school-navy sm:text-xs">${icon("clipboard-check", "h-3.5 w-3.5")} Ir a Calificar</a>
              ` : ""}
            </div>
          `}
        </div>
      </div>
      ${regularizationStudentReportModal({
        student: selectedRegularizationReportStudent,
        activities: selectedRegularizationReportEntry?.items || [],
        gradesMap,
        attendanceRows,
        displayNumber: selectedRegularizationReportStudent ? regularizationOrderMap.get(selectedRegularizationReportStudent.id) || "" : "",
        course: selectedRegularizationReportStudent ? coursesById[selectedRegularizationReportStudent.cursoId] : null
      })}
      ${regularizationGradeModal({
        activity: selectedRegularizationActivity,
        student: selectedRegularizationStudent,
        currentGrade: selectedRegularizationGrade,
        attendanceState: selectedRegularizationAttendanceState,
        pendingReason: selectedRegularizationPendingReason,
        displayNumber: selectedRegularizationStudent ? regularizationOrderMap.get(selectedRegularizationStudent.id) || "" : "",
        hasNext: Boolean(nextRegularizationTarget)
      })}
    </section>
  `;

  container.querySelector("[data-refresh-regularization-cache]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Actualizando...";
    await refreshAllRegularization();
    await renderRegularization(context);
  });
  container.querySelector("[data-regularization-search]")?.addEventListener("input", (event) => {
    teacherState.regularizationSearch = event.currentTarget.value || "";
    clearTimeout(regularizationSearchTimer);
    regularizationSearchTimer = setTimeout(async () => {
      await renderRegularization(context);
      const searchInput = container.querySelector("[data-regularization-search]");
      searchInput?.focus();
      searchInput?.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }, 120);
  });
  container.querySelector("[data-clear-regularization-search]")?.addEventListener("click", async () => {
    teacherState.regularizationSearch = "";
    await renderRegularization(context);
    container.querySelector("[data-regularization-search]")?.focus();
  });
  container.querySelectorAll("[data-regularization-grade-activity]").forEach((button) => {
    button.addEventListener("click", async () => {
      teacherState.regularizationGradeActivityId = button.dataset.regularizationGradeActivity || "";
      teacherState.regularizationGradeStudentId = button.dataset.regularizationGradeStudent || "";
      await renderRegularization(context);
    });
  });
  container.querySelectorAll("[data-regularization-report-student]").forEach((button) => {
    button.addEventListener("click", async () => {
      teacherState.regularizationReportStudentId = button.dataset.regularizationReportStudent || "";
      await renderRegularization(context);
    });
  });
  container.querySelector("[data-close-regularization-report]")?.addEventListener("click", async () => {
    teacherState.regularizationReportStudentId = "";
    await renderRegularization(context);
  });
  container.querySelector("[data-close-regularization-grade]")?.addEventListener("click", async () => {
    teacherState.regularizationGradeActivityId = "";
    teacherState.regularizationGradeStudentId = "";
    await renderRegularization(context);
  });
  const saveRegularizationGrade = async (value, advance = false) => {
    if (!selectedRegularizationActivity || !selectedRegularizationStudent) return;
    const status = container.querySelector("[data-regularization-grade-status]");
    const max = Math.max(1, Math.min(100, Number(selectedRegularizationActivity.maximo || 100)));
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > max) {
      if (status) {
        status.className = "rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700";
        status.textContent = `Ingrese un puntaje entre 0 y ${max}.`;
      }
      return;
    }
    container.querySelectorAll("[data-regularization-grade-value], [data-save-regularization-grade-input], [data-save-next-regularization-grade-input]").forEach((item) => { item.disabled = true; });
    if (status) {
      status.classList.remove("hidden");
      status.textContent = "Guardando nota...";
    }
    try {
      const previousState = deliveryStateForGrade(selectedRegularizationGrade);
      const attendanceInfo = regularizationAttendanceInfo(selectedRegularizationAttendanceState);
      const estadoEntrega = numericValue <= 0
        ? DELIVERY_STATES.NOT_SUBMITTED
        : [DELIVERY_STATES.ON_TIME, DELIVERY_STATES.LATE].includes(previousState)
          ? previousState
          : attendanceInfo.id === "licencia"
            ? DELIVERY_STATES.ON_TIME
            : DELIVERY_STATES.LATE;
      const savedGrade = await saveGrade({
        activity: selectedRegularizationActivity,
        student: selectedRegularizationStudent,
        value: numericValue,
        estadoEntrega,
        fechaEntrega: selectedRegularizationGrade?.fechaEntrega || todayIso()
      });
      upsertTeacherNotesSnapshotGrade(context, selectedRegularizationActivity, savedGrade);
      if (status) status.textContent = advance && nextRegularizationTarget ? "Nota guardada. Abriendo siguiente..." : "Nota guardada";
      teacherState.regularizationGradeActivityId = advance && nextRegularizationTarget ? nextRegularizationTarget.activity.id : "";
      teacherState.regularizationGradeStudentId = advance && nextRegularizationTarget ? nextRegularizationTarget.student.id : "";
      await renderRegularization(context);
    } catch (error) {
      if (status) {
        status.className = "rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700";
        status.textContent = error.message || "No se pudo guardar.";
      }
      container.querySelectorAll("[data-regularization-grade-value], [data-save-regularization-grade-input], [data-save-next-regularization-grade-input]").forEach((item) => { item.disabled = false; });
    }
  };
  container.querySelectorAll("[data-regularization-grade-value]").forEach((button) => {
    button.addEventListener("click", async () => {
      await saveRegularizationGrade(Number(button.dataset.regularizationGradeValue || 0));
    });
  });
  container.querySelector("[data-save-regularization-grade-input]")?.addEventListener("click", async () => {
    const input = container.querySelector("[data-regularization-grade-input]");
    await saveRegularizationGrade(input?.value?.trim() === "" ? Number.NaN : Number(input.value));
  });
  container.querySelector("[data-save-next-regularization-grade-input]")?.addEventListener("click", async () => {
    const input = container.querySelector("[data-regularization-grade-input]");
    await saveRegularizationGrade(input?.value?.trim() === "" ? Number.NaN : Number(input.value), true);
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
    container.innerHTML = `
      <div class="teacher-module-surface rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:rounded-3xl sm:p-5">
        ${teacherModuleHeading({
          title: "Notas por materia",
          course: course.nombre,
          trimester: selectedTrimester().label,
          detail: "Sin copia local"
        })}
        <p class="mt-3 max-w-2xl text-sm font-normal text-slate-500">Para ahorrar lecturas, las notas se cargan manualmente y luego quedan guardadas en este dispositivo.</p>
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
  const rawSubjectActivities = visibleActivities.filter((item) => item.materiaId === teacherState.selectedSubjectId);
  const activityTimestampMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    const seconds = Number(value.seconds ?? value._seconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
      return (seconds * 1000) + Math.floor(nanoseconds / 1e6);
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const subjectActivitiesAll = rawSubjectActivities
    .map((item, index) => {
      const explicitOrder = Number(item.ordenCreacion || item.creadoEnMs || item.createdAtMs || 0);
      const createdAt = activityTimestampMillis(item.createdAt);
      const scheduledAt = item.fecha ? Date.parse(`${item.fecha}T00:00:00`) : 0;
      const updatedAt = activityTimestampMillis(item.updatedAt);
      return {
        item,
        index,
        order: explicitOrder > 0
          ? explicitOrder
          : createdAt || (Number.isFinite(scheduledAt) ? scheduledAt : 0) || updatedAt || index,
        tieBreaker: updatedAt || index
      };
    })
    .sort((a, b) => a.order - b.order || a.tieBreaker - b.tieBreaker || a.index - b.index)
    .map(({ item }) => item);
  const serCriteria = subjectActivitiesAll.filter((item) => item.tipo === "ser");
  const autoActivity = subjectActivitiesAll.find((item) => item.tipo === "auto") || null;
  const gradesMap = gradeByActivityAndStudent(gradesList);
  const subjectActivities = subjectActivitiesAll
    .filter((item) => !item.interno && !["ser", "auto"].includes(item.tipo))
    .filter((item) => activityHasGrades(item, gradesMap));
  const tasks = subjectActivities.filter((item) => !isSaberActivity(item) && !isMaterialActivity(item));
  const exams = subjectActivities.filter(isSaberActivity);
  const serColspan = 5 + serCriteria.length;
  const selectedCriterion = serCriteria.find((item) => item.id === teacherState.notesCriterionId) || null;
  const autoGradeActivity = {
    ...(autoActivity || {}),
    id: autoActivity?.id || "",
    cursoId: autoActivity?.cursoId || course.id,
    materiaId: autoActivity?.materiaId || teacherState.selectedSubjectId,
    trimestreId: autoActivity?.trimestreId || activeTrimesterId,
    titulo: autoActivity?.titulo || "Autoevaluacion",
    tipo: autoActivity?.tipo || "auto",
    maximo: Number(autoActivity?.maximo || 5),
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
    if (autoActivity?.id) {
      return {
        ...autoActivity,
        cursoId: autoActivity.cursoId || course.id,
        materiaId: autoActivity.materiaId || teacherState.selectedSubjectId,
        trimestreId: autoActivity.trimestreId || activeTrimesterId,
        titulo: autoActivity.titulo || "Autoevaluacion",
        tipo: autoActivity.tipo || "auto",
        maximo: Number(autoActivity.maximo || 5),
        interno: true
      };
    }
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

  const sectionBorder = "border-l-[3px] border-l-slate-400";
  const sectionHeaderBorder = "border-l-[3px] border-l-white/70";
  const serHeaderCell = `${sectionBorder} bg-emerald-50/80`;
  const saberHeaderCell = `${sectionBorder} bg-amber-50/80`;
  const hacerHeaderCell = `${sectionBorder} bg-green-50/70`;
  const autoHeaderCell = `${sectionBorder} bg-slate-100/80`;
  const finalHeaderCell = `${sectionBorder} bg-emerald-100/80`;

  const notesEditDrafts = teacherState.notesEditDrafts || {};
  const notesEditCount = Object.keys(notesEditDrafts).length;
  const notesColumnCount = 2 + serColspan + (exams.length || 1) + 2 + (tasks.length || 1) + 2 + 2 + 2;
  const notesHeaderTitles = [
    "Asistencia",
    "Puntualidad",
    "Responsabilidad",
    ...serCriteria.map((item) => item.titulo || "Nota SER"),
    "Promedio",
    "Puntaje",
    ...(exams.length ? exams.map((item) => item.titulo || "Actividad SABER") : ["Sin examenes"]),
    "Promedio",
    "Puntaje",
    ...(tasks.length ? tasks.map((item) => item.titulo || "Actividad HACER") : ["Sin tareas"]),
    "Promedio",
    "Puntaje",
    "Nota",
    "Puntaje",
    "Nota final",
    "Situacion"
  ];
  const longestNotesHeader = notesHeaderTitles.reduce((longest, title) => Math.max(longest, String(title || "").length), 0);
  const notesHeaderHeight = Math.max(144, Math.min(360, (longestNotesHeader * 6) + 28));
  const notesHeaderCell = "w-12 px-1 py-1 align-middle font-semibold";
  const verticalHeaderLabel = (label) => `
    <span class="inline-flex h-full w-full items-center justify-center whitespace-nowrap text-[10px] font-semibold leading-none [writing-mode:vertical-rl] rotate-180" title="${escapeHtml(label)}">
      ${escapeHtml(label)}
    </span>
  `;
  const notesTableMinWidth = Math.max(1080, 232 + ((notesColumnCount - 2) * 48));
  const notesEditKey = (activityId, studentId) => `${activityId}::${studentId}`;

  function editableGradeControl(activity, student, fallbackValue, readOnlyHtml = "") {
    if (!teacherState.notesEditMode) return readOnlyHtml || escapeHtml(fallbackValue);
    const grade = activity?.id ? gradesMap[activity.id]?.[student.id] : null;
    const internalGrade = activity?.interno === true || ["ser", "auto"].includes(String(activity?.tipo || "").toLowerCase());
    const deliveryState = deliveryStateForGrade(grade);
    const editableDelivery = internalGrade || [DELIVERY_STATES.ON_TIME, DELIVERY_STATES.LATE].includes(deliveryState);
    if (!grade || !editableDelivery) {
      return `<span class="inline-flex min-h-7 items-center justify-center text-[10px] text-slate-400" title="${grade ? "Entrega pendiente; debe resolverse en Regularizacion" : "Sin calificacion registrada; debe resolverse en Calificar o Regularizacion"}">${escapeHtml(fallbackValue)}</span>`;
    }
    const key = notesEditKey(activity.id, student.id);
    const maximum = Math.max(1, Math.min(100, Number(activity.maximo || grade.maximo || 100)));
    const draft = notesEditDrafts[key];
    const rawValue = draft ? draft.value : Number(grade.valor ?? 0);
    const inputTone = draft?.invalid
      ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-100"
      : draft
        ? "border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-100"
        : "border-slate-300 bg-white focus:border-school-green focus:ring-green-100";
    return `
      <label class="mx-auto flex w-12 flex-col items-center gap-0.5" title="Puntaje original sobre ${maximum}">
        <input type="number" min="0" max="${maximum}" step="1" value="${escapeHtml(rawValue)}"
          data-notes-edit-grade data-activity-id="${escapeHtml(activity.id)}" data-student-id="${escapeHtml(student.id)}"
          data-original-value="${escapeHtml(Number(grade.valor ?? 0))}" data-maximum="${maximum}"
          class="h-7 w-12 rounded-md border ${inputTone} px-1 text-center text-[10px] font-semibold text-slate-900 outline-none transition focus:ring-2">
        <span class="text-[8px] font-medium text-slate-400">/${maximum}</span>
      </label>
    `;
  }

  container.innerHTML = `
    <section class="space-y-3">
      <div class="teacher-module-surface overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div class="p-3 sm:p-4">
          <div class="teacher-module-header flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            ${teacherModuleHeading({
              title: "Notas por materia",
              course: course.nombre,
              trimester: selectedTrimester().label,
              detail: `${selectedSubject?.nombre || "Materia"} · ${studentsByName.length} alumno(s) · ${subjectActivities.length} actividad(es)`
            })}
            <div class="flex flex-col gap-2 xl:items-end">
              <div class="flex flex-wrap gap-1.5 xl:justify-end">
                <button type="button" data-print-notes ${teacherState.notesEditMode ? "disabled" : ""} class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-school-green transition hover:border-school-green hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40">
                  ${icon("printer", "h-3.5 w-3.5")} Imprimir
                </button>
                ${teacherState.notesEditMode ? `
                  <button type="button" data-cancel-notes-edit class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                    ${icon("x", "h-3.5 w-3.5")} Cancelar
                  </button>
                  <button type="button" data-request-notes-save ${notesEditCount ? "" : "disabled"} class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40">
                    ${icon("save", "h-3.5 w-3.5")} Guardar <span data-notes-edit-count>${notesEditCount}</span>
                  </button>
                ` : `
                  <button type="button" data-request-notes-edit class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-school-green px-3 py-2 text-xs font-semibold text-white transition hover:bg-school-navy">
                    ${icon("pencil", "h-3.5 w-3.5")} Editar notas
                  </button>
                `}
                <button type="button" data-refresh-notes-cache ${teacherState.notesEditMode ? "disabled" : ""} class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-school-navy px-3 py-2 text-xs font-semibold text-white transition hover:bg-school-green disabled:cursor-not-allowed disabled:opacity-40">
                  ${icon("refresh-cw", "h-3.5 w-3.5")} Actualizar
                </button>
              </div>
              <span class="inline-flex items-center gap-1.5 rounded-lg bg-school-sky px-2.5 py-1.5 text-[10px] font-medium text-school-navy">
                ${icon("hard-drive", "h-3 w-3")} ${notesCacheMeta ? `Copia: ${escapeHtml(notesCacheMeta.label)}` : "Sin copia local"}
              </span>
            </div>
          </div>
        </div>
        <div class="border-t border-slate-100 bg-slate-50/70 px-3 py-2.5 sm:px-4">
          <div class="flex gap-1.5 overflow-x-auto pb-0.5">
            ${availableSubjects.map((subjectId) => {
              const subject = findSubject(subjectId);
              const active = subjectId === teacherState.selectedSubjectId;
              return `<button type="button" data-note-subject="${subjectId}" ${teacherState.notesEditMode ? "disabled" : ""} class="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${active ? "border-school-green bg-school-green text-white" : "border-slate-200 bg-white text-slate-600 hover:border-school-green/40"}">${escapeHtml(subject?.nombre || subjectId)}</button>`;
            }).join("")}
          </div>
        </div>
        ${teacherState.notesEditMode ? `
          <div class="flex flex-col gap-1 border-t border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <span class="inline-flex items-center gap-1.5 font-semibold">${icon("pencil-line", "h-3.5 w-3.5")} Edicion activa · cambia solo notas ya registradas</span>
            <span data-notes-edit-help>Los promedios se actualizaran al guardar.</span>
          </div>
        ` : teacherState.notesEditMessage ? `
          <div class="border-t border-green-200 bg-green-50 px-3 py-2 text-[11px] font-semibold text-green-800 sm:px-4">${icon("circle-check", "mr-1 inline h-3.5 w-3.5")} ${escapeHtml(teacherState.notesEditMessage)}</div>
        ` : ""}
      </div>

      <div class="w-full overflow-auto rounded-2xl border border-slate-300 bg-white shadow-soft">
        <table class="w-full table-fixed text-center text-[11px] leading-tight" style="min-width:${notesTableMinWidth}px">
          <thead class="sticky top-0 z-20 shadow-sm">
            <tr class="bg-school-navy text-white">
              <th class="sticky left-0 z-30 w-10 bg-school-navy px-1 py-2 font-semibold">No.</th>
              <th class="sticky left-10 z-30 w-48 bg-school-navy px-3 py-2 text-left font-semibold">Alumno</th>
              <th colspan="${serColspan}" class="${sectionHeaderBorder} px-1 py-2 font-semibold">
                <span class="inline-flex items-center justify-center gap-1.5">
                  SER 10
                  <button type="button" data-add-ser-criterion ${teacherState.notesEditMode ? "disabled" : ""} class="grid h-6 w-6 place-items-center rounded-md bg-white text-school-navy shadow-sm transition hover:bg-school-gold disabled:cursor-not-allowed disabled:opacity-40" title="Agregar nota SER">${icon("plus", "h-4 w-4")}</button>
                </span>
              </th>
              <th colspan="${(exams.length || 1) + 2}" class="${sectionHeaderBorder} px-1 py-2 font-semibold">SABER 45</th>
              <th colspan="${(tasks.length || 1) + 2}" class="${sectionHeaderBorder} px-1 py-2 font-semibold">HACER 40</th>
              <th colspan="2" class="${sectionHeaderBorder} px-1 py-2 font-semibold">Auto 5</th>
              <th colspan="2" class="${sectionHeaderBorder} px-1 py-2 font-semibold">Final</th>
            </tr>
            <tr class="border-b-2 border-slate-300 bg-slate-50 text-slate-700">
              <th class="sticky left-0 z-30 bg-slate-50 px-1 py-1"></th>
              <th class="sticky left-10 z-30 bg-slate-50 px-2 py-1 text-left"></th>
              <th class="${notesHeaderCell} ${serHeaderCell}" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Asistencia")}</th>
              <th class="${notesHeaderCell} bg-emerald-50/80" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Puntualidad")}</th>
              <th class="${notesHeaderCell} bg-emerald-50/80" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Responsabilidad")}</th>
              ${serCriteria.map((item) => `<th class="${notesHeaderCell} bg-emerald-50/80" style="height:${notesHeaderHeight}px">
                <button type="button" data-edit-ser-criterion="${item.id}" ${teacherState.notesEditMode ? "disabled" : ""} class="flex h-full w-full items-center justify-center rounded-md p-0 transition disabled:cursor-not-allowed hover:bg-school-gold/30" title="${escapeHtml(item.titulo)}">${verticalHeaderLabel(item.titulo)}</button>
              </th>`).join("")}
              <th class="${notesHeaderCell} bg-emerald-50/80" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Promedio")}</th>
              <th class="${notesHeaderCell} bg-emerald-50/80" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Puntaje")}</th>
              ${exams.length ? exams.map((item, itemIndex) => `<th class="${notesHeaderCell} bg-amber-50/80 ${itemIndex === 0 ? sectionBorder : ""}" style="height:${notesHeaderHeight}px">${verticalHeaderLabel(item.titulo)}</th>`).join("") : `<th class="${notesHeaderCell} ${saberHeaderCell}" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Sin examenes")}</th>`}
              <th class="${notesHeaderCell} bg-amber-50/80" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Promedio")}</th>
              <th class="${notesHeaderCell} bg-amber-50/80" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Puntaje")}</th>
              ${tasks.length ? tasks.map((item, itemIndex) => `<th class="${notesHeaderCell} bg-green-50/70 ${itemIndex === 0 ? sectionBorder : ""}" style="height:${notesHeaderHeight}px">${verticalHeaderLabel(item.titulo)}</th>`).join("") : `<th class="${notesHeaderCell} ${hacerHeaderCell}" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Sin tareas")}</th>`}
              <th class="${notesHeaderCell} bg-green-50/70" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Promedio")}</th>
              <th class="${notesHeaderCell} bg-green-50/70" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Puntaje")}</th>
              <th class="${notesHeaderCell} ${autoHeaderCell}" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Nota")}</th>
              <th class="${notesHeaderCell} bg-slate-100/80" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Puntaje")}</th>
              <th class="${notesHeaderCell} ${finalHeaderCell}" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Nota final")}</th>
              <th class="${notesHeaderCell} w-14 bg-emerald-100/80" style="height:${notesHeaderHeight}px">${verticalHeaderLabel("Situacion")}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${studentsByName.map((student, index) => {
              const serExtraValues = serCriteria.map((item) => studentActivityGrade(item, student.id, gradesMap));
              const autoGradeRecord = autoGradeActivity.id ? gradesMap[autoGradeActivity.id]?.[student.id] : null;
              const autoGrade = autoGradeRecord?.nota ?? null;
              const calc = calculateStudentTerm(student, subjectActivities, gradesMap, attendanceRows, serExtraValues, autoGrade);
              const rowSurface = index % 2 ? "bg-white" : "bg-slate-50/55";
              return `
                <tr class="${rowSurface}">
                  <td class="sticky left-0 z-10 ${rowSurface} px-1 py-2 font-semibold text-school-navy">${index + 1}</td>
                  <td class="sticky left-10 z-10 ${rowSurface} truncate border-r border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-800" title="${escapeHtml(student.nombre)}">${escapeHtml(student.nombre)}</td>
                  <td class="${sectionBorder} px-1 py-1.5 ${gradeTone(calc.asistencia100)}">${calc.asistencia100}</td>
                  <td class="px-1 py-1.5 ${gradeTone(calc.puntualidad100)}">${calc.puntualidad100}</td>
                  <td class="px-1 py-1.5 ${gradeTone(calc.responsabilidad100)}">${calc.responsabilidad100}</td>
                  ${serCriteria.map((item) => {
                    const grade = gradesMap[item.id]?.[student.id];
                    const value = grade?.nota;
                    const readOnly = `<button type="button" data-ser-grade="${item.id}" data-student-id="${student.id}" class="mx-auto min-w-8 rounded-md px-2 py-1 text-[10px] font-medium transition hover:ring-2 hover:ring-school-green ${value ? gradeTone(value) : "bg-slate-100 text-slate-500"}">${value || "+"}</button>`;
                    return `<td class="px-1 py-1.5">
                      ${editableGradeControl(item, student, value || "+", readOnly)}
                    </td>`;
                  }).join("")}
                  <td class="px-1 py-1.5 ${gradeTone(calc.ser100)}">${calc.ser100}</td>
                  <td class="px-1 py-1.5 bg-blue-50 font-medium text-school-navy">${calc.ser10}</td>
                  ${exams.length ? exams.map((item) => {
                    const value = studentActivityGrade(item, student.id, gradesMap);
                    const firstExam = item.id === exams[0]?.id;
                    return `<td class="${firstExam ? sectionBorder : ""} px-1 py-1.5 ${teacherState.notesEditMode ? "bg-white" : gradeTone(value)}">${editableGradeControl(item, student, value)}</td>`;
                  }).join("") : `<td class="${sectionBorder} px-1 py-1.5 text-slate-400">35</td>`}
                  <td class="px-1 py-1.5 ${gradeTone(calc.saber100)}">${calc.saber100}</td>
                  <td class="px-1 py-1.5 bg-blue-50 font-medium text-school-navy">${calc.saber45}</td>
                  ${tasks.length ? tasks.map((item) => {
                    const value = studentActivityGrade(item, student.id, gradesMap);
                    const firstTask = item.id === tasks[0]?.id;
                    return `<td class="${firstTask ? sectionBorder : ""} px-1 py-1.5 ${teacherState.notesEditMode ? "bg-white" : gradeTone(value)}">${editableGradeControl(item, student, value)}</td>`;
                  }).join("") : `<td class="${sectionBorder} px-1 py-1.5 text-slate-400">35</td>`}
                  <td class="px-1 py-1.5 ${gradeTone(calc.hacer100)}">${calc.hacer100}</td>
                  <td class="px-1 py-1.5 bg-blue-50 font-medium text-school-navy">${calc.hacer40}</td>
                  <td class="${sectionBorder} px-1 py-1.5">
                    ${editableGradeControl(autoGradeActivity, student, autoGradeRecord ? calc.auto100 : "+", `<button type="button" data-auto-grade="${student.id}" class="mx-auto min-w-8 rounded-md px-2 py-1 text-[10px] font-medium transition hover:ring-2 hover:ring-school-green ${autoGradeRecord ? gradeTone(calc.auto100) : "bg-slate-100 text-slate-500"}">${autoGradeRecord ? calc.auto100 : "+"}</button>`)}
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
      ${notesEditConfirmationModal(teacherState.notesEditConfirmation, notesEditCount)}
    </section>
  `;

  const closeNotesEditConfirmation = async () => {
    teacherState.notesEditConfirmation = "";
    await renderNotes(context);
  };
  const updateNotesEditControls = () => {
    const drafts = Object.values(teacherState.notesEditDrafts || {});
    const invalidCount = drafts.filter((item) => item.invalid).length;
    const countElement = container.querySelector("[data-notes-edit-count]");
    const saveButton = container.querySelector("[data-request-notes-save]");
    const help = container.querySelector("[data-notes-edit-help]");
    if (countElement) countElement.textContent = String(drafts.length);
    if (saveButton) saveButton.disabled = !drafts.length || invalidCount > 0;
    if (help) {
      help.textContent = invalidCount
        ? `Corrige ${invalidCount} puntaje(s) marcado(s) en rojo.`
        : drafts.length
          ? `${drafts.length} cambio(s) sin guardar.`
          : "Los promedios se actualizaran al guardar.";
    }
  };

  container.querySelector("[data-request-notes-edit]")?.addEventListener("click", async () => {
    closeNotesModals();
    teacherState.notesEditConfirmation = "enable";
    teacherState.notesEditMessage = "";
    await renderNotes(context);
  });
  container.querySelector("[data-confirm-notes-edit]")?.addEventListener("click", async () => {
    teacherState.notesEditMode = true;
    teacherState.notesEditDrafts = {};
    teacherState.notesEditConfirmation = "";
    teacherState.notesEditMessage = "";
    closeNotesModals();
    await renderNotes(context);
  });
  container.querySelectorAll("[data-close-notes-edit-confirmation]").forEach((button) => {
    button.addEventListener("click", closeNotesEditConfirmation);
  });
  container.querySelector("[data-notes-edit-confirmation-backdrop]")?.addEventListener("click", async (event) => {
    if (event.target.matches("[data-notes-edit-confirmation-backdrop]")) await closeNotesEditConfirmation();
  });
  container.querySelector("[data-cancel-notes-edit]")?.addEventListener("click", async () => {
    const changed = Object.keys(teacherState.notesEditDrafts || {}).length;
    if (changed && !confirm(`Descartar ${changed} cambio(s) sin guardar?`)) return;
    teacherState.notesEditMode = false;
    teacherState.notesEditDrafts = {};
    teacherState.notesEditConfirmation = "";
    teacherState.notesEditMessage = "Edicion cancelada; no se modifico ninguna nota.";
    await renderNotes(context);
  });
  container.querySelectorAll("[data-notes-edit-grade]").forEach((input) => {
    input.addEventListener("input", () => {
      const activityId = input.dataset.activityId || "";
      const studentId = input.dataset.studentId || "";
      const key = notesEditKey(activityId, studentId);
      const rawValue = input.value.trim();
      const numericValue = Number(rawValue);
      const originalValue = Number(input.dataset.originalValue || 0);
      const maximum = Number(input.dataset.maximum || 100);
      const invalid = rawValue === "" || !Number.isFinite(numericValue) || numericValue < 0 || numericValue > maximum;
      if (!invalid && numericValue === originalValue) {
        delete teacherState.notesEditDrafts[key];
      } else {
        teacherState.notesEditDrafts[key] = { key, activityId, studentId, value: rawValue, maximum, invalid };
      }
      input.classList.remove("border-slate-300", "bg-white", "border-amber-400", "bg-amber-50", "border-red-400", "bg-red-50", "focus:border-school-green", "focus:ring-green-100", "focus:border-amber-500", "focus:ring-amber-100", "focus:border-red-500", "focus:ring-red-100");
      if (invalid) input.classList.add("border-red-400", "bg-red-50", "focus:border-red-500", "focus:ring-red-100");
      else if (teacherState.notesEditDrafts[key]) input.classList.add("border-amber-400", "bg-amber-50", "focus:border-amber-500", "focus:ring-amber-100");
      else input.classList.add("border-slate-300", "bg-white", "focus:border-school-green", "focus:ring-green-100");
      updateNotesEditControls();
    });
  });
  container.querySelector("[data-request-notes-save]")?.addEventListener("click", async () => {
    const drafts = Object.values(teacherState.notesEditDrafts || {});
    if (!drafts.length || drafts.some((item) => item.invalid)) return;
    teacherState.notesEditConfirmation = "save";
    await renderNotes(context);
  });
  container.querySelector("[data-confirm-notes-save]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const drafts = Object.values(teacherState.notesEditDrafts || {});
    if (!drafts.length || drafts.some((item) => item.invalid)) return;
    button.disabled = true;
    button.textContent = "Guardando...";
    let savedCount = 0;
    try {
      for (const draft of drafts) {
        const activity = subjectActivitiesAll.find((item) => item.id === draft.activityId);
        const student = studentsByName.find((item) => item.id === draft.studentId);
        const previousGrade = gradesMap[draft.activityId]?.[draft.studentId];
        const numericValue = Number(draft.value);
        if (!activity || !student || !previousGrade) throw new Error("No se encontro una de las calificaciones a editar.");
        if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > Number(draft.maximum || 100)) {
          throw new Error(`Puntaje invalido para ${student.nombre}.`);
        }
        const savedGrade = await saveGrade({
          activity,
          student,
          value: numericValue,
          estadoEntrega: previousGrade.estadoEntrega || "",
          fechaEntrega: previousGrade.fechaEntrega || "",
          asistenciaActividad: previousGrade.asistenciaActividad || attendanceStateForDate(student.id, activity.fecha, attendanceRows)
        });
        upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
        delete teacherState.notesEditDrafts[draft.key];
        savedCount += 1;
      }
      teacherState.notesEditMode = false;
      teacherState.notesEditConfirmation = "";
      teacherState.notesEditMessage = `${savedCount} calificacion(es) actualizada(s) correctamente.`;
      await renderNotes(context);
    } catch (error) {
      teacherState.notesEditConfirmation = "";
      teacherState.notesEditMessage = savedCount
        ? `${savedCount} cambio(s) se guardaron antes del error. Revisa los pendientes.`
        : "No se guardaron los cambios.";
      await renderNotes(context);
      alert(error?.code === "permission-denied" ? "Sin permiso para editar las notas." : (error.message || "No se pudieron guardar las notas."));
    }
  });

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
      teacherState.notesGradeActivityId = autoGradeActivity.id || "";
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
  const setNotesGradeStatus = (message, type = "ok") => {
    const status = container.querySelector("[data-notes-grade-status]");
    if (!status) return;
    status.textContent = message;
    status.classList.remove("hidden", "border-green-200", "bg-green-50", "text-green-700", "border-red-200", "bg-red-50", "text-red-700");
    if (type === "error") {
      status.classList.add("border-red-200", "bg-red-50", "text-red-700");
    } else {
      status.classList.add("border-green-200", "bg-green-50", "text-green-700");
    }
  };
  const setNotesGradeButtonsDisabled = (disabled) => {
    container.querySelectorAll("[data-note-grade-value]").forEach((item) => {
      item.disabled = disabled;
      item.classList.toggle("opacity-60", disabled);
    });
  };
  container.querySelectorAll("[data-note-grade-value]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.noteGradeValue;
      const student = selectedGradeStudent;
      if (!student) return;
      setNotesGradeButtonsDisabled(true);
      setNotesGradeStatus("Guardando nota...");
      let activity = null;
      let savedGrade = null;
      try {
        activity = await ensureNotesGradeActivity();
        if (!activity) throw new Error("No se encontro la columna de nota.");
        savedGrade = await saveGrade({ activity, student, value });
      } catch (error) {
        console.error("No se pudo guardar nota en el modulo Notas", error);
        setNotesGradeStatus(error?.code === "permission-denied" ? "Sin permiso para guardar nota." : (error.message || "No se pudo guardar la nota."), "error");
        setNotesGradeButtonsDisabled(false);
        return;
      }

      upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
      setNotesGradeStatus("Nota guardada");
      const nextIndex = studentsByName.findIndex((item) => item.id === student.id) + 1;
      const nextStudent = studentsByName[nextIndex] || null;
      if (teacherState.notesGradeGuided && nextStudent) {
        teacherState.notesGradeActivityId = activity.id;
        teacherState.notesGradeStudentId = nextStudent.id;
      } else {
        closeNotesModals();
      }

      try {
        await renderNotes(context);
      } catch (error) {
        console.error("La nota se guardo, pero no se pudo refrescar la vista de Notas", error);
        setNotesGradeStatus("Nota guardada. Actualiza notas si no se refleja.");
        setNotesGradeButtonsDisabled(false);
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

































