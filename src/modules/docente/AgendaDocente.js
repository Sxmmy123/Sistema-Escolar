import { courseAccent, dayIdFromIso, emptyState, escapeHtml, longDateLabel, monthLabel, refreshIcons, shiftMonth, teacherModuleHeading, workingDaysCalendar } from "./UtilidadesDocente.js";
import { icon } from "../../ui/dom.js";
import { DAYS, findSubject } from "../../data/catalog.js";
import { activityEvaluationLabel, activityPointsLabel, deliveryEditorData, materialItemsForActivity, selectedCourse } from "./ComunDocente.js";
import { selectedTrimester, teacherState } from "./EstadoDocente.js";
import { deleteActivity, getTeacherScheduleRows, getTeacherStudents, listActivities, listAttendanceForCourse, listGradesForCourse, normalizeGrade, saveActivity, saveGrade, todayIso, updateActivity, upsertTeacherNotesSnapshotGrade } from "../../services/teacherData.js";
import { attendanceLabel, gradeByActivityAndStudent, isMaterialActivity, isSaberActivity, isScoredMaterialActivity } from "./AcademicoDocente.js";

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

function subjectOptions(course) {
  return course.materias.map((subjectId) => {
    const subject = findSubject(subjectId);
    return `<option value="${subjectId}">${escapeHtml(subject?.nombre || subjectId)}</option>`;
  }).join("");
}

export async function renderTasks(context) {
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
              ${editActivity.tieneCalificaciones === true ? `<p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Actividad con calificaciones registradas. Datos academicos protegidos.</p>` : ""}
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
    if (selected.tieneCalificaciones === true) {
      alert("Esta actividad ya tiene calificaciones y no se puede cambiar de fecha.");
      return;
    }
    const targetDayId = dayIdFromIso(targetDate);
    const canMove = scheduleRows.some((row) => row.cursoId === selected.cursoId && row.materiaId === selected.materiaId && row.diaId === targetDayId);
    if (!canMove) {
      alert("No se puede mover a esa fecha porque esa materia no esta en tu horario de ese dia.");
      return;
    }
    const targetCourse = coursesById[selected.cursoId] || context.courses.find((item) => item.id === selected.cursoId);
    if (!targetCourse) return;
    if (!confirm(`Mover "${selected.titulo || "actividad"}" a ${longDateLabel(targetDate)}?`)) return;
    try {
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
    } catch (error) {
      alert(error.message || "No se pudo cambiar la fecha de la actividad.");
    }
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

  if (editActivity?.tieneCalificaciones === true && editActivityForm) {
    for (const name of ["cursoId", "materiaId", "tipo", "maximo", "calificable"]) {
      const field = editActivityForm.querySelector(`[name="${name}"]:not([type="hidden"])`);
      if (!field || field.disabled) continue;
      if (field.type !== "checkbox" || field.checked) {
        const value = document.createElement("input");
        value.type = "hidden";
        value.name = name;
        value.value = field.value;
        editActivityForm.append(value);
      }
      field.disabled = true;
    }
    const deleteButton = editActivityForm.querySelector("[data-delete-edit-activity]");
    if (deleteButton) {
      deleteButton.disabled = true;
      deleteButton.title = "Esta actividad tiene calificaciones y no se puede eliminar.";
      deleteButton.classList.add("opacity-50", "cursor-not-allowed");
    }
  }

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
