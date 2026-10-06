import { attendanceStateForDate, deliveryStateForGrade, gradeByActivityAndStudent, isMaterialActivity, isSaberActivity, isScoredMaterialActivity } from "./AcademicoDocente.js";
import { DELIVERY_STATES, getTeacherDataCacheMeta, getTeacherNotesSnapshot, refreshTeacherNotesSnapshot, saveGrade, todayIso, upsertTeacherNotesSnapshotGrade } from "../../services/teacherData.js";
import { icon } from "../../ui/dom.js";
import { courseAccent, emptyState, escapeHtml, refreshIcons, teacherModuleHeading } from "./UtilidadesDocente.js";
import { findSubject } from "../../data/catalog.js";
import { selectedTrimester, teacherState } from "./EstadoDocente.js";
import { resolvedActivityReviewState, sortStudentsByName } from "./ComunDocente.js";
import { revisionDisponibleParaRegularizar } from "../../services/revisionActividad.js";

let regularizationSearchTimer = null;

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

export async function renderRegularization(context) {
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
      const closedAndAvailable = revisionDisponibleParaRegularizar({ ...item, estadoRevision: reviewState }, currentDate);
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
      if (pendingReason && activity.regularizacionCerradaDisponible) {
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
              <button type="button" data-regularization-report-student="${student.id}" data-teacher-alert-student="${student.id}" class="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-stretch gap-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-school-green/50 hover:shadow-soft sm:p-3">
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
