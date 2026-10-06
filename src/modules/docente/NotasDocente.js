import { selectedTrimester, teacherState } from "./EstadoDocente.js";
import { icon } from "../../ui/dom.js";
import { emptyState, escapeHtml, refreshIcons, teacherModuleHeading } from "./UtilidadesDocente.js";
import { selectedCourse, sortStudentsByName } from "./ComunDocente.js";
import { DELIVERY_STATES, deleteActivity, getTeacherDataCacheMeta, getTeacherNotesSnapshot, refreshTeacherNotesSnapshot, removeTeacherNotesSnapshotActivity, saveGrade, saveInternalActivity, updateActivity, upsertTeacherNotesSnapshotActivity, upsertTeacherNotesSnapshotGrade } from "../../services/teacherData.js";
import { findSubject } from "../../data/catalog.js";
import { activityHasGrades, attendanceStateForDate, calculateStudentTerm, deliveryStateForGrade, gradeByActivityAndStudent, gradeTone, isMaterialActivity, isSaberActivity, studentActivityGrade } from "./AcademicoDocente.js";
import { openTeacherNotesPrintModal } from "./imprimirNotasDocente.js";

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

export async function renderNotes(context) {
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
              const serExtraValues = serCriteria.filter((item) => gradesMap[item.id]?.[student.id]).map((item) => studentActivityGrade(item, student.id, gradesMap));
              const autoGradeRecord = autoGradeActivity.id ? gradesMap[autoGradeActivity.id]?.[student.id] : null;
              const autoGrade = autoGradeRecord?.nota ?? null;
              const calc = calculateStudentTerm(student, subjectActivities, gradesMap, attendanceRows, serExtraValues, autoGrade);
              const rowSurface = index % 2 ? "bg-white" : "bg-slate-50/55";
              return `
                 <tr data-teacher-alert-student="${student.id}" class="${rowSurface}">
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
