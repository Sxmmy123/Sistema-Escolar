import { compactSubjectName, courseAccent, emptyState, escapeHtml, longDateLabel, refreshIcons, teacherModuleHeading } from "./UtilidadesDocente.js";
import { DELIVERY_STATES, finalizeActivityReview, getTeacherStudents, listActivities, listAttendanceForCourseDate, listGradesForActivity, listGradesForCourse, normalizeGrade, saveGrade, todayIso, upsertTeacherNotesSnapshotActivity, upsertTeacherNotesSnapshotGrade } from "../../services/teacherData.js";
import { selectedTrimester, teacherState } from "./EstadoDocente.js";
import { gradeTone, isMaterialActivity, isScoredMaterialActivity } from "./AcademicoDocente.js";
import { activityEvaluationLabel, activityPointsLabel, readGradeDelivery, resolvedActivityReviewState } from "./ComunDocente.js";
import { findSubject } from "../../data/catalog.js";
import { icon } from "../../ui/dom.js";

export async function renderDateGrading(context) {
  const container = document.querySelector("[data-teacher-grading]");
  if (!container) return;
  const previousActivityId = container.querySelector("[data-student-grade-modal]")?.dataset.activityId;
  const previousListScrollTop = container.querySelector(".grade-list-rows")?.scrollTop || 0;
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
  const absentStudents = activity
    ? students.filter((student) => ["falta", "permiso", "licencia"].includes(String(attendanceMap[student.id]?.estado || "").toLowerCase()))
    : [];
  const withoutAttendance = activity && !ignoreAttendanceForGrading
    ? students.filter((student) => !attendanceMap[student.id]?.estado)
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
  const gradeProgress = students.length ? Math.round((allGradedCount / students.length) * 100) : 0;
  const pendingLicenseCount = students.filter((student) => {
    const state = String(attendanceMap[student.id]?.estado || "").toLowerCase();
    return !gradesMap[student.id] && ["permiso", "licencia"].includes(state);
  }).length;
  const pendingDefinitiveCount = Math.max(0, students.length - allGradedCount - pendingLicenseCount);
  const gradeModalOpen = Boolean(activity && !teacherState.gradeModalClosed);
  const listPickerStudent = teacherState.gradeMode === "lista" && gradeModalOpen
    ? (studentsToGrade.find((student) => student.id === teacherState.gradeStudentId) || studentsToGrade[0] || null)
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
        .grade-list-shell {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          min-height: 0;
        }
        .grade-list-rows {
          min-width: 0;
          overflow-y: auto;
        }
        .grade-list-panel {
          min-width: 0;
          overflow-y: auto;
        }
        .grade-modal-shell {
          letter-spacing: 0;
        }
        .grade-modal-shell button,
        .grade-modal-shell summary {
          letter-spacing: 0;
        }
        @media (max-width: 1023px) {
          .grade-list-shell { grid-template-rows: minmax(0, 1fr) minmax(0, 32%); }
          .grade-list-panel { order: -1; }
          .grade-list-shell.short-score-grid { grid-template-rows: max-content minmax(0, 1fr); }
          .short-score-grid .grade-list-panel { max-height: min(44vh, 320px); }
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
          .grade-list-shell {
            grid-template-columns: minmax(18rem, 38%) minmax(0, 1fr);
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
      <div class="fixed inset-0 z-50 ${gradeModalOpen ? "flex" : "hidden"} items-center justify-center bg-slate-950/60 p-2 sm:p-4" data-student-grade-modal data-activity-id="${escapeHtml(activity?.id || "")}">
        <section class="grade-modal-shell flex w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl ${teacherState.gradeMode === "lista" ? "h-[94dvh] max-h-[820px]" : "max-h-[94dvh]"}">
          ${activity ? (() => {
            const subject = findSubject(activity.materiaId);
            const courseNumber = String(activityCourse?.corto || activityCourse?.nombre || "").replace(/\D/g, "") || "I";
            return `
              <header class="flex flex-wrap items-start gap-3 border-b border-slate-200 px-4 py-3 sm:items-center sm:px-5">
                ${showCourse ? `<span class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-school-sky text-sm font-semibold text-school-navy" title="${escapeHtml(activityCourse?.nombre || "Curso")}">${escapeHtml(courseNumber)}</span>` : ""}
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                    <span class="rounded px-2 py-0.5 text-slate-900" style="background:${subject?.color || "#e2e8f0"}">${escapeHtml(subject?.nombre || activity.materiaId)}</span>
                    <span>${activityEvaluationLabel(activity)} · ${activity.maximo || 100} pts</span>
                  </div>
                  <h3 class="mt-1 break-words text-base font-semibold leading-tight text-slate-900" title="${escapeHtml(activity.titulo || "Sin titulo")}">${escapeHtml(activity.titulo || "Sin titulo")}</h3>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <div class="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                    <button type="button" data-grade-mode="guiado" class="rounded px-2.5 py-1.5 text-xs transition ${teacherState.gradeMode === "guiado" ? "bg-white font-semibold text-school-navy shadow-sm" : "text-slate-600 hover:text-slate-900"}">Guiado</button>
                    <button type="button" data-grade-mode="lista" class="rounded px-2.5 py-1.5 text-xs transition ${teacherState.gradeMode === "lista" ? "bg-white font-semibold text-school-navy shadow-sm" : "text-slate-600 hover:text-slate-900"}">Lista</button>
                  </div>
                  <button type="button" class="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" data-close-student-grade aria-label="Cerrar calificacion" title="Cerrar">${icon("x", "h-4 w-4")}</button>
                </div>
              </header>
            `;
          })() : ""}
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-700 sm:px-5">
            <span><strong class="text-slate-900">${allGradedCount}/${students.length}</strong> calificados</span>
            <div class="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow="${gradeProgress}" aria-valuemin="0" aria-valuemax="100" aria-label="Avance de calificacion"><div class="h-full rounded-full bg-school-green" style="width:${gradeProgress}%"></div></div>
            <span>${studentsToGrade.length} habilitados</span>
            <span class="ml-auto text-slate-600">${reviewState === "cerrada" ? "Revision finalizada" : reviewState === "en_proceso" ? "Revision en proceso" : "Revision sin iniciar"}</span>
          </div>
          ${absentStudents.length || withoutAttendance.length ? `
            <details class="border-b border-slate-200 px-4 py-2 text-xs text-slate-700 sm:px-5">
              <summary class="cursor-pointer font-medium text-slate-700">${absentStudents.length} ausentes${withoutAttendance.length ? ` · ${withoutAttendance.length} sin asistencia registrada` : ""}</summary>
              <div class="mt-2 grid gap-1.5 sm:grid-cols-2">
                ${[...absentStudents, ...withoutAttendance].map((student) => {
                  const state = String(attendanceMap[student.id]?.estado || "").toLowerCase();
                  const missing = state === "falta";
                  const label = missing ? "Falta" : state === "permiso" ? "Permiso" : state === "licencia" ? "Licencia" : "Sin registro";
                  const tone = missing ? "border-red-200 bg-red-50 text-red-800" : state ? "border-purple-200 bg-purple-50 text-purple-800" : "border-slate-200 bg-white text-slate-600";
                  return `<div class="flex min-w-0 items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${tone}"><span class="min-w-0 truncate">${escapeHtml(studentOrderMap.get(student.id) || "-")}. ${escapeHtml(student.nombre)}</span><span class="shrink-0 font-medium">${label}</span></div>`;
                }).join("")}
              </div>
            </details>
          ` : ""}
          ${activity ? `
            ${reviewState === "en_proceso" ? `<div class="flex justify-end border-b border-slate-200 px-4 py-2 sm:px-5"><button type="button" data-finalize-activity-review class="rounded-md bg-school-green px-3 py-1.5 text-xs font-medium text-white transition hover:bg-school-navy disabled:cursor-not-allowed disabled:bg-slate-300">${icon("check-check", "mr-1 inline h-3.5 w-3.5")} Terminar revision</button></div>` : ""}
          ` : ""}
          ${activity ? `
            <div class="grid min-h-0 flex-1 gap-2 overflow-hidden p-2 ${teacherState.gradeMode === "lista" ? "" : "lg:grid-cols-[180px_1fr]"}">
              ${teacherState.gradeMode === "lista" ? "" : `
                <aside class="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p class="text-xs font-semibold text-slate-800">Calificados <span class="font-medium text-slate-600">${allGradedCount}/${students.length} (${absentStudents.length} ausentes)</span></p>
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
                    }).join("") || `<p class="rounded-md bg-white px-2 py-2 text-xs text-slate-600">Aun no hay calificados.</p>`}
                  </div>
                </aside>
              `}
              <div class="min-h-0 overflow-hidden ${teacherState.gradeMode === "lista" ? "" : "overflow-y-auto"}">
                ${teacherState.gradeMode === "lista" ? `
                  <div class="grade-list-shell h-full min-h-0 gap-2 ${Number(activity.maximo || 100) <= 20 ? "short-score-grid" : ""}">
                    <div class="grade-list-rows min-h-0 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-1.5">
                      <p class="sticky top-0 z-10 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700">Alumnos · ${studentsToGrade.length}</p>
                      ${studentsToGrade.map((student) => {
                        const studentOrder = studentOrderMap.get(student.id) || "-";
                        const grade = gradesMap[student.id];
                        const result = grade ? normalizeGrade(grade.valor, activity.maximo) : null;
                        const didNotSubmit = grade && Number(grade.valor || 0) === 0;
                        const lowGrade = result && Number(result.porcentaje || 0) < 50;
                        const gradeTone = didNotSubmit || lowGrade
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-green-200 bg-green-50 text-green-800";
                        const selected = listPickerStudent?.id === student.id;
                        return `
                          <button type="button" data-list-student-grade="${student.id}" aria-pressed="${selected}" class="grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border bg-white px-2 py-1.5 text-left transition hover:border-school-navy/40 hover:bg-school-sky/40 ${selected ? "grade-selected-row border-school-navy bg-school-sky/40" : "border-slate-200"}">
                            <span class="grid h-7 w-7 place-items-center rounded-md ${grade ? "bg-green-600 text-white" : "bg-school-sky text-school-navy"} text-xs font-semibold">${escapeHtml(studentOrder)}</span>
                            <div class="min-w-0">
                              <p class="truncate text-sm text-slate-900" title="${escapeHtml(student.nombre)}">${escapeHtml(student.nombre)}</p>
                            </div>
                            ${grade ? `
                              <span class="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${gradeTone}">
                                ${didNotSubmit ? `${icon("ban", "h-3.5 w-3.5")}<span class="hidden xl:inline">${isMaterialActivity(activity) ? "No trajo" : "No presento"}</span>` : `${result?.nota ?? "-"}`}
                              </span>
                            ` : `<span class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">Sin nota</span>`}
                          </button>
                        `;
                      }).join("") || `<p class="px-2 py-4 text-sm text-slate-600">No hay alumnos habilitados para calificar.</p>`}
                    </div>
                    ${listPickerStudent ? (() => {
                      return `
                        <section class="grade-list-panel min-h-0 rounded-md border border-slate-200 bg-white">
                          <div class="p-3 sm:p-4">
                            <div class="flex items-start gap-2.5 border-b border-slate-200 pb-3">
                              <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-school-sky text-xs font-semibold text-school-navy">${escapeHtml(studentOrderMap.get(listPickerStudent.id) || "-")}</span>
                              <div class="min-w-0 flex-1">
                                <p class="text-xs text-slate-600">Alumno seleccionado</p>
                                <h4 class="break-words text-sm font-semibold leading-snug text-slate-900">${escapeHtml(listPickerStudent.nombre)}</h4>
                              </div>
                              ${listPickerGrade ? `<span class="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-800">${Number(listPickerGrade.valor) === 0 ? "No presento" : `${listPickerGrade.valor}/${activity.maximo || 100}`}</span>` : ""}
                            </div>
                            <p class="mt-3 text-sm text-slate-700">Puntaje <span class="text-slate-500">(máximo ${activity.maximo || 100})</span></p>
                            <div class="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-8 lg:grid-cols-10">
                              ${Array.from({ length: Math.min(Number(activity.maximo || 100), 100) }, (_, index) => index + 1).map((value) => {
                                const selected = Number(listPickerGrade?.valor) === value;
                                const result = normalizeGrade(value, activity.maximo);
                                const low = Number(result?.porcentaje || 0) < 50;
                                return `<button type="button" data-list-grade-auto="${value}" class="grid h-9 place-items-center rounded-md border text-sm transition ${selected ? "border-green-600 bg-green-600 font-semibold text-white" : low ? "border-red-200 bg-red-50 text-red-700 hover:border-red-400" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-school-navy hover:bg-school-sky"}">${value}</button>`;
                              }).join("")}
                            </div>
                            <div class="mt-3 border-t border-slate-200 pt-3">
                              <button type="button" data-list-grade-no-work="${listPickerStudent.id}" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-40">${icon("ban", "mr-1 inline h-4 w-4")}${escapeHtml(noSubmissionLabel)}</button>
                            </div>
                            <p class="mt-2 hidden rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700" data-list-grade-status></p>
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
                        <p class="text-xs text-slate-500">Alumno ${teacherState.gradeIndex + 1} de ${studentsToGrade.length}</p>
                        <h4 class="truncate text-sm font-semibold text-slate-900 sm:text-base">${escapeHtml(currentStudent.nombre)}</h4>
                       </div>
                     </div>
                     <p class="mt-2 text-xs text-slate-600">Puntaje sobre ${activity.maximo || 100}</p>
                    <div class="mt-2 grid max-h-[38vh] grid-cols-5 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-8 lg:grid-cols-10">
                      ${Array.from({ length: Math.min(Number(activity.maximo || 100), 100) }, (_, index) => {
                        const value = index + 1;
                        const selected = Number(currentGrade?.valor) === value;
                        return `<button type="button" data-date-grade-auto="${value}" class="grid h-8 min-w-0 place-items-center rounded-md border text-xs font-semibold transition sm:h-9 sm:text-sm ${selected ? "border-green-600 bg-green-600 text-white" : "border-slate-200 bg-slate-100 text-slate-700 hover:border-school-navy hover:bg-school-sky"}">${value}</button>`;
                      }).join("")}
                    </div>
                    <div class="mt-2 grid grid-cols-3 gap-1.5">
                      <button type="button" data-date-grade-prev class="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-semibold text-school-navy">${icon("chevron-left", "mr-1 inline h-4 w-4")}Anterior</button>
                      <button type="button" data-grade-no-work="${currentStudent.id}" class="rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-[11px] font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-40">${icon("x-circle", "mr-1 inline h-4 w-4")}${escapeHtml(noSubmissionShortLabel)}</button>
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

  if (activity?.id && previousActivityId === activity.id) {
    container.querySelector(".grade-list-rows")?.scrollTo({ top: previousListScrollTop });
  }
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
    if (!confirm(`Terminar la revision de esta actividad?\n\n${detail}${licenseDetail}\n\nLos alumnos sin nota quedaran disponibles en Regularizacion al finalizar.`)) return;
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
        const savedGrade = await saveGrade({ activity, student, value, ...readGradeDelivery(activity, student, gradesMap, attendanceMap) });
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
        const savedGrade = await saveGrade({ activity, student, value, ...readGradeDelivery(activity, student, gradesMap, attendanceMap) });
        upsertTeacherNotesSnapshotGrade(context, activity, savedGrade);
        if (status) status.textContent = "Nota guardada";
        teacherState.gradeStudentId = nextPendingStudent(student)?.id || student.id;
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
      teacherState.gradeStudentId = nextPendingStudent(student)?.id || student.id;
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
