import { icon } from "../../ui/dom.js";
import {
  COURSES,
  SUBJECTS,
  listDirectorAllActivities,
  listDirectorAttendanceByTrimester,
  listDirectorGrades,
  listDirectorStudents,
  subjectName
} from "../../services/directorData.js";
import { calculateCourseTerm, calculateSubjectTerm, gradeByActivityAndStudent } from "../../services/calculoAcademico.js";
import { DirectorShell } from "./DirectorShell.js";
import { escapeDirectorHtml, refreshDirectorIcons } from "./DirectorUtils.js";

const TRIMESTERS = [
  { id: "t1", label: "1er trimestre" },
  { id: "t2", label: "2do trimestre" },
  { id: "t3", label: "3er trimestre" }
];

const notesState = {
  trimesterId: sessionStorage.getItem("directorNotasTrimestre") || "",
  courseId: sessionStorage.getItem("directorNotasCurso") || "",
  view: sessionStorage.getItem("directorNotasVista") || "school",
  threshold: Math.max(35, Math.min(100, Number(sessionStorage.getItem("directorNotasMinima")) || 51)),
  filter: "all",
  subjectId: "",
  studentId: "",
  fromStudents: false,
  reportLoading: false,
  reportError: ""
};

const SUBJECT_ICONS = {
  matematica: "calculator",
  lenguaje: "book-open",
  ciencias_naturales: "flask-conical",
  ciencias_sociales: "globe-2",
  educacion_fisica: "dumbbell",
  religion: "cross",
  musica: "music-2",
  artes_plasticas: "palette",
  tecnica_tecnologica: "cpu"
};

let notesData = null;

function termOf(item) {
  return item?.trimestreId || "t1";
}

function gradeValue(value) {
  const parsed = Number(value);
  return Math.max(35, Math.min(100, Number.isFinite(parsed) ? Math.round(parsed) : 35));
}

function percentage(part, total) {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

function percentageLabel(value) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function performanceTone(value) {
  if (value < 60) return { text: "text-red-600", bar: "bg-red-500", soft: "bg-red-50" };
  if (value < 80) return { text: "text-amber-700", bar: "bg-amber-400", soft: "bg-amber-50" };
  return { text: "text-emerald-700", bar: "bg-emerald-500", soft: "bg-emerald-50" };
}

function studentStatusStrip(rows, valueForRow, { courseId = "", subjectId = "", originView = "school" } = {}) {
  const entries = rows.map((row, index) => ({
    row,
    value: Number(valueForRow(row)) || 0,
    position: index + 1
  }));
  const low = entries.filter((entry) => entry.value > 0 && entry.value < notesState.threshold).length;
  const withoutData = entries.filter((entry) => !entry.value).length;
  const summary = !entries.length
    ? "Sin alumnos"
    : withoutData === entries.length
      ? `${entries.length} alumnos · Sin notas`
      : `${entries.length} alumnos · ${low} requieren atencion${withoutData ? ` · ${withoutData} sin datos` : ""}`;

  if (!entries.length) return `<span class="text-[15px] font-semibold leading-5 text-slate-800">Sin alumnos</span>`;

  const summaryTone = low ? "text-red-700" : "text-slate-700";

  return `
    <div class="block min-w-0" aria-label="${escapeDirectorHtml(summary)}">
      <div class="grid h-8 w-full gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-1.5" style="grid-template-columns:repeat(${entries.length},minmax(3px,1fr))" role="list" aria-label="Alumnos en orden alfabetico">
        ${entries.map(({ row, value, position }) => {
          const name = row.student?.nombre || "Estudiante";
          const state = !value ? "Sin datos" : value < notesState.threshold ? `Debajo de ${notesState.threshold}` : `Alcanza ${notesState.threshold}`;
          const label = `N. ${position} · ${name} · ${value ? `${value} sobre 100` : "Sin nota"} · ${state}`;
          const color = !value ? "bg-slate-300" : value < notesState.threshold ? "bg-red-500" : "bg-emerald-500";
          const edge = position <= 2 ? "left-0" : position >= entries.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2";
          const groupGap = position % 5 === 0 && position < entries.length ? "mr-1" : "";
          return `
            <button type="button" role="listitem" data-director-note-segment-student="${row.student.id}" data-director-note-segment-course="${courseId}" data-director-note-segment-subject="${subjectId}" data-director-note-segment-view="${originView}" class="group/segment relative h-full min-w-0 rounded-sm ${color} ${groupGap} transition hover:brightness-90 focus:z-20 focus:outline-none focus:ring-2 focus:ring-school-green focus:ring-offset-1" aria-label="${escapeDirectorHtml(label)}">
              <span class="pointer-events-none absolute bottom-full ${edge} z-30 mb-2 hidden w-max max-w-56 rounded-md bg-slate-950 px-2.5 py-2 text-left text-xs font-medium leading-4 text-white shadow-xl group-hover/segment:block group-focus/segment:block">
                <strong class="block font-semibold">N. ${position} · ${escapeDirectorHtml(name)}</strong>
                <span class="mt-0.5 block text-slate-200">${value ? `${value}/100` : "Sin nota"} · ${escapeDirectorHtml(state)}</span>
              </span>
            </button>
          `;
        }).join("")}
      </div>
      <div class="mt-1 grid w-full gap-0.5 px-1.5" style="grid-template-columns:repeat(${entries.length},minmax(3px,1fr))" aria-hidden="true">
        ${entries.map(({ position }) => {
          const showMarker = position === 1 || position % 5 === 0 || position === entries.length;
          return `<span class="min-w-0 text-center text-[10px] font-semibold text-slate-600">${showMarker ? position : ""}</span>`;
        }).join("")}
      </div>
      <span class="mt-1.5 block text-[15px] font-semibold leading-5 ${summaryTone}">${escapeDirectorHtml(summary)}</span>
    </div>
  `;
}

function preferredTrimester(activities, grades) {
  if (TRIMESTERS.some((term) => term.id === notesState.trimesterId)) return notesState.trimesterId;
  const activityTerm = new Map(activities.map((activity) => [activity.id, termOf(activity)]));
  const counts = grades.reduce((result, grade) => {
    const termId = grade?.trimestreId || activityTerm.get(grade.actividadId) || "t1";
    result[termId] = (result[termId] || 0) + 1;
    return result;
  }, {});
  return [...TRIMESTERS].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))[0]?.id || "t1";
}

function preferredTrimesterForCourse(courseId) {
  const courseActivities = new Map(notesData.activities
    .filter((activity) => activity.cursoId === courseId)
    .map((activity) => [activity.id, activity]));
  const counts = notesData.grades.reduce((result, grade) => {
    const activity = courseActivities.get(grade.actividadId);
    if (!activity) return result;
    const termId = termOf(activity);
    result[termId] = (result[termId] || 0) + 1;
    return result;
  }, {});
  return [...TRIMESTERS].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))[0]?.id || notesState.trimesterId || "t1";
}

function applyRequestedStudent() {
  const studentId = sessionStorage.getItem("directorNotasEstudiante");
  if (!studentId || !notesData) return;
  const student = notesData.students.find((item) => item.id === studentId);
  const courseId = sessionStorage.getItem("directorNotasCursoSolicitado") || student?.cursoId || "";
  const requestedTrimester = sessionStorage.getItem("directorNotasTrimestreSolicitado");
  notesState.studentId = studentId;
  notesState.courseId = courseId;
  notesState.trimesterId = TRIMESTERS.some((term) => term.id === requestedTrimester)
    ? requestedTrimester
    : preferredTrimesterForCourse(courseId);
  notesState.subjectId = "";
  notesState.view = "course";
  notesState.filter = "all";
  notesState.fromStudents = sessionStorage.getItem("directorNotasOrigen") === "estudiantes";
  sessionStorage.removeItem("directorNotasEstudiante");
  sessionStorage.removeItem("directorNotasCursoSolicitado");
  sessionStorage.removeItem("directorNotasTrimestreSolicitado");
  sessionStorage.removeItem("directorNotasOrigen");
}

function selectedData() {
  const activities = notesData.activities.filter((activity) => termOf(activity) === notesState.trimesterId);
  const activityIds = new Set(activities.map((activity) => activity.id));
  const grades = notesData.grades.filter((grade) => activityIds.has(grade.actividadId));
  const startedIds = new Set(grades.map((grade) => grade.actividadId).filter(Boolean));
  return {
    activities: activities.filter((activity) => startedIds.has(activity.id)),
    grades
  };
}

function rowsForCourse(courseId, activities, grades) {
  const students = notesData.students
    .filter((student) => student.cursoId === courseId && student.activo !== false)
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" }));
  const courseActivities = activities.filter((activity) => activity.cursoId === courseId);
  const gradeByKey = new Map(grades.map((grade) => [`${grade.actividadId}|${grade.alumnoId}`, grade]));
  const courseTerm = calculateCourseTerm({
    students, activities: notesData.allActivities, grades: notesData.grades,
    attendanceRows: notesData.attendanceByTrimester[notesState.trimesterId] || [],
    courseId, trimestreId: notesState.trimesterId
  });
  const resultsByStudent = new Map(courseTerm.studentResults.map((result) => [result.student.id, result]));
  const subjects = SUBJECTS.filter((subject) => courseTerm.studentResults.some((result) => result.subjectResults[subject.id]));

  const rows = students.map((student, index) => {
    const result = resultsByStudent.get(student.id);
    const subjectScores = Object.fromEntries(subjects.map((subject) => [subject.id, result.subjectResults[subject.id]?.hasData ? result.subjectResults[subject.id].final : 0]));
    const subjectPending = Object.fromEntries(subjects.map((subject) => [subject.id, result.subjectResults[subject.id]?.pendingCount || 0]));
    return {
      student,
      number: index + 1,
      subjectScores,
      subjectPending,
      average: result.average,
      pending: result.pending
    };
  });

  return { rows, subjects, activities: courseActivities, gradeByKey };
}

function activeCourses(activities, grades) {
  return COURSES.map((course) => {
    const view = rowsForCourse(course.id, activities, grades);
    return {
      course,
      ...view,
      pending: view.rows.reduce((sum, row) => sum + row.pending, 0)
    };
  });
}

function scoreClass(value) {
  if (!value) return "text-slate-400";
  if (value < notesState.threshold) return "bg-red-50 text-red-700";
  if (value < 80) return "bg-amber-50 text-amber-800";
  return "bg-green-50 text-school-green";
}

function score(value, pending = false) {
  if (!value) return `<span class="text-slate-300">-</span>`;
  return `<span class="inline-flex min-w-10 items-center justify-center rounded-md px-1.5 py-1 text-[11px] font-semibold ${scoreClass(value)}">${value}%${pending ? `<span class="ml-1 h-1.5 w-1.5 rounded-full bg-red-500" title="Incluye pendientes"></span>` : ""}</span>`;
}

function stat(label, value, detail, iconName, tone) {
  return `
    <article class="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div class="grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone}">${icon(iconName, "h-4 w-4")}</div>
      <div class="min-w-0">
        <p class="text-[10px] font-semibold uppercase text-slate-500">${label}</p>
        <p class="text-xl font-semibold leading-tight text-slate-950">${value}</p>
        <p class="truncate text-[10px] text-slate-500">${detail}</p>
      </div>
    </article>
  `;
}

function toolbar() {
  return `
    <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="inline-flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-1" aria-label="Seleccionar trimestre">
          ${TRIMESTERS.map((term) => `
            <button type="button" data-director-note-term="${term.id}" class="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition ${notesState.trimesterId === term.id ? "bg-school-green text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}">${term.label}</button>
          `).join("")}
        </div>
        <button type="button" data-director-note-refresh class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-school-green px-3 py-2 text-xs font-semibold text-school-green transition hover:bg-green-50">
          ${icon("refresh-cw", "h-4 w-4")} Actualizar datos
        </button>
      </div>
    </section>
  `;
}

function thresholdControl() {
  const threshold = notesState.threshold;
  return `
    <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div class="flex items-center justify-between gap-3">
        <label for="director-note-threshold" class="text-[11px] font-semibold text-slate-700">Nota minima acordada</label>
        <output for="director-note-threshold" class="min-w-14 rounded-md bg-school-green px-2 py-1 text-center text-sm font-semibold text-white">${threshold}</output>
      </div>
      <input id="director-note-threshold" data-director-note-threshold class="mt-2 h-2 w-full cursor-pointer accent-school-green" type="range" min="35" max="100" step="1" value="${threshold}" aria-label="Nota minima acordada">
      <div class="mt-1 flex justify-between text-[9px] text-slate-400"><span>35</span><span>51 aprobacion</span><span>100</span></div>
    </div>
  `;
}

function breadcrumbs(courseView = null, subject = null) {
  const courseReady = Boolean(notesState.courseId && courseView?.course?.id === notesState.courseId);
  const navigationItem = ({ view, label, detail, iconName, enabled = true }) => {
    const active = view === "course" ? ["course", "subject"].includes(notesState.view) : notesState.view === view;
    return `
      <button type="button" data-director-note-view="${view}" ${enabled ? "" : "disabled aria-disabled=\"true\""} class="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-left transition ${active ? "bg-school-green text-white shadow-sm" : enabled ? "text-slate-700 hover:bg-green-50 hover:text-school-green" : "cursor-not-allowed text-slate-300"}" ${active ? `aria-current="step"` : ""}>
        ${icon(iconName, "h-4 w-4 shrink-0")}
        <span class="min-w-0">
          <span class="block text-xs font-semibold leading-4">${label}</span>
          <span class="block max-w-36 truncate text-[10px] leading-3.5 ${active ? "text-white/80" : enabled ? "text-slate-500" : "text-slate-300"}">${escapeDirectorHtml(detail)}</span>
        </span>
      </button>
    `;
  };

  return `
    <nav class="mt-3 flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="Navegacion de notas">
      ${navigationItem({ view: "school", label: "Escuela", detail: "Todos los cursos", iconName: "school" })}
      ${icon("chevron-right", "h-4 w-4 shrink-0 text-slate-300")}
      ${navigationItem({
        view: "course",
        label: "Materias",
        detail: courseReady ? subject?.nombre || courseView.course.nombre : "Seleccione un curso",
        iconName: "book-open",
        enabled: courseReady
      })}
    </nav>
  `;
}

function schoolOverview(courses) {
  return `
    <section class="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div class="grid gap-4 border-b border-slate-200 px-3 py-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,520px)] lg:items-center lg:px-4">
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[.12em] text-school-green">Vista general de la escuela</p>
          <h2 class="mt-0.5 text-base font-semibold text-slate-950">Estado de alumnos por curso</h2>
          <p class="mt-1 text-[11px] leading-4 text-slate-500">Cada bloque representa un alumno. En celular, toque uno para ver su nombre y puntaje.</p>
        </div>
        <div class="min-w-0">
          ${thresholdControl()}
          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs font-medium text-slate-600">
            <span class="inline-flex items-center gap-1.5 font-semibold text-slate-700"><span class="flex gap-0.5"><span class="h-2.5 w-1.5 rounded-sm bg-emerald-500"></span><span class="h-2.5 w-1.5 rounded-sm bg-red-500"></span></span>1 bloque = 1 alumno</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-emerald-500"></span>Alcanza la nota</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-red-500"></span>Debajo de la nota</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-slate-300"></span>Sin datos</span>
          </div>
        </div>
      </div>
      <div class="hidden grid-cols-[minmax(190px,.85fr)_minmax(300px,2fr)] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[9px] font-semibold uppercase text-slate-500 sm:grid">
        <span>Curso</span><span>Alumnos</span>
      </div>
      <div class="divide-y divide-slate-100">
        ${courses.map((item, index) => {
          return `
            <div class="group/row block w-full bg-white px-3 py-3 transition hover:bg-green-50/40 sm:grid sm:grid-cols-[minmax(190px,.85fr)_minmax(300px,2fr)] sm:items-center sm:gap-4 sm:px-4 sm:py-2.5">
              <button type="button" data-director-note-course="${item.course.id}" class="flex w-full min-w-0 items-center gap-2.5 rounded-md text-left" aria-label="Ver materias de ${escapeDirectorHtml(item.course.nombre)}">
                <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 transition group-hover/row:bg-green-100 group-hover/row:text-school-green">${escapeDirectorHtml(item.course.corto || String(index + 1))}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-xs font-semibold text-slate-800">${escapeDirectorHtml(item.course.nombre)}</span>
                  <span class="mt-0.5 block text-xs font-semibold text-school-green">Ver materias</span>
                </span>
                ${icon("chevron-right", "h-4 w-4 shrink-0 text-school-green")}
              </button>
              <div class="mt-2 min-w-0 sm:mt-0">${studentStatusStrip(item.rows, (row) => row.average, { courseId: item.course.id, originView: "school" })}</div>
            </div>
          `;
        }).join("")}
      </div>
      <footer class="border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[10px] text-slate-500">Seleccione un curso para revisar sus materias.</footer>
    </section>
  `;
}

function subjectPerformance(courseView) {
  const subjectRows = courseView.subjects.map((subject) => ({ subject }));

  return `
    <section class="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div class="grid gap-4 border-b border-slate-200 px-3 py-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,520px)] lg:items-center lg:px-4">
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[.12em] text-school-green">${escapeDirectorHtml(courseView.course.nombre)}</p>
          <h2 class="mt-0.5 text-base font-semibold text-slate-950">Estado de alumnos por materia</h2>
          <p class="mt-1 text-[11px] leading-4 text-slate-500">Cada bloque corresponde al promedio de un alumno, en orden alfabetico.</p>
        </div>
        <div class="min-w-0">
          ${thresholdControl()}
          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs font-medium text-slate-600">
            <span class="inline-flex items-center gap-1.5 font-semibold text-slate-700"><span class="flex gap-0.5"><span class="h-2.5 w-1.5 rounded-sm bg-emerald-500"></span><span class="h-2.5 w-1.5 rounded-sm bg-red-500"></span></span>1 bloque = 1 alumno</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-emerald-500"></span>Alcanza</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-red-500"></span>Debajo</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-slate-300"></span>Sin datos</span>
          </div>
        </div>
      </div>

      <div class="hidden grid-cols-[minmax(210px,.9fr)_minmax(300px,2fr)] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[9px] font-semibold uppercase text-slate-500 sm:grid">
        <span>Materia</span><span>Alumnos</span>
      </div>
      <div class="divide-y divide-slate-100">
        ${subjectRows.length ? subjectRows.map((item) => {
          const selected = notesState.subjectId === item.subject.id;
          return `
            <div class="group/row block w-full px-3 py-3 transition hover:bg-slate-50 sm:grid sm:grid-cols-[minmax(210px,.9fr)_minmax(300px,2fr)] sm:items-center sm:gap-4 sm:px-4 sm:py-2.5 ${selected ? "bg-green-50 ring-1 ring-inset ring-school-green/30" : "bg-white"}">
              <button type="button" data-director-note-subject="${item.subject.id}" class="flex w-full min-w-0 items-center gap-2.5 rounded-md text-left" aria-label="Ver estudiantes de ${escapeDirectorHtml(item.subject.nombre)}">
                <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-700" style="background-color:${item.subject.color || "#eef2f7"}">${icon(SUBJECT_ICONS[item.subject.id] || "book-open", "h-4 w-4")}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-xs font-semibold text-slate-800">${escapeDirectorHtml(item.subject.nombre)}</span>
                  <span class="mt-0.5 block text-xs font-semibold text-school-green">Ver estudiantes</span>
                </span>
                ${icon("chevron-right", "h-4 w-4 shrink-0 text-school-green")}
              </button>
              <div class="mt-2 min-w-0 sm:mt-0">${studentStatusStrip(courseView.rows, (row) => row.subjectScores[item.subject.id], { courseId: courseView.course.id, subjectId: item.subject.id, originView: "course" })}</div>
            </div>
          `;
        }).join("") : `<p class="px-4 py-8 text-center text-xs text-slate-500">No hay materias calificadas para este curso.</p>`}
      </div>
      <footer class="border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[10px] text-slate-500">Pulse una materia para ver sus estudiantes o toque un bloque para abrir directamente su boleta.</footer>
    </section>
  `;
}

function subjectStudentPerformance(courseView, subject) {
  const subjectId = subject.id;
  let rows = courseView.rows.map((row) => ({
    ...row,
    value: Number(row.subjectScores[subjectId]) || 0,
    subjectPendingCount: Number(row.subjectPending[subjectId]) || 0
  }));
  if (notesState.filter === "risk") rows = rows.filter((row) => row.value < notesState.threshold);
  if (notesState.filter === "pending") rows = rows.filter((row) => row.subjectPendingCount > 0);
  rows.sort((a, b) => a.value - b.value || String(a.student.nombre || "").localeCompare(String(b.student.nombre || ""), "es", { sensitivity: "base" }));

  const allRows = courseView.rows.map((row) => Number(row.subjectScores[subjectId]) || 0).filter(Boolean);
  const reached = allRows.filter((value) => value >= notesState.threshold).length;
  const subjectRate = percentage(reached, allRows.length);
  const subjectTone = performanceTone(subjectRate);

  return `
    <section class="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-3.5 sm:px-4">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-700" style="background-color:${subject.color || "#eef2f7"}">${icon(SUBJECT_ICONS[subject.id] || "book-open", "h-5 w-5")}</span>
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-[.12em] text-school-green">Rendimiento por estudiante</p>
            <h2 class="truncate text-base font-semibold text-slate-950">${escapeDirectorHtml(subject.nombre)}</h2>
            <p class="text-[11px] text-slate-500">${escapeDirectorHtml(courseView.course.nombre)} · ${allRows.length} estudiantes evaluados</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="rounded-md px-2.5 py-1.5 text-sm font-semibold ${subjectTone.soft} ${subjectTone.text}">${percentageLabel(subjectRate)}</span>
          <div class="inline-flex rounded-lg bg-slate-100 p-1">
            ${[["all", "Todos"], ["risk", "En riesgo"], ["pending", "Pendientes"]].map(([id, label]) => `<button type="button" data-director-note-filter="${id}" class="rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${notesState.filter === id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}">${label}</button>`).join("")}
          </div>
        </div>
      </header>
      <div class="hidden grid-cols-[minmax(220px,1.25fr)_110px_minmax(240px,1.5fr)_100px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[9px] font-semibold uppercase text-slate-500 sm:grid">
        <span>Estudiante</span><span>Rendimiento</span><span>Porcentaje final</span><span>Estado</span>
      </div>
      <div class="divide-y divide-slate-100">
        ${rows.length ? rows.map((row) => {
          const reachedMinimum = row.value >= notesState.threshold;
          const tone = reachedMinimum
            ? row.value >= 80 ? { text: "text-emerald-700", bar: "bg-emerald-500", soft: "bg-emerald-50" } : { text: "text-amber-700", bar: "bg-amber-400", soft: "bg-amber-50" }
            : { text: "text-red-600", bar: "bg-red-500", soft: "bg-red-50" };
          return `
            <button type="button" data-director-note-student="${row.student.id}" class="block w-full bg-white px-3 py-3 text-left transition hover:bg-green-50/40 sm:grid sm:grid-cols-[minmax(220px,1.25fr)_110px_minmax(240px,1.5fr)_100px] sm:items-center sm:gap-3 sm:px-4 sm:py-2.5">
              <span class="min-w-0"><span class="block truncate text-xs font-semibold text-slate-800">${escapeDirectorHtml(row.student.nombre || "Sin nombre")}</span><span class="mt-0.5 block text-[10px] ${row.subjectPendingCount ? "text-red-600" : "text-slate-400"}">${row.subjectPendingCount ? `${row.subjectPendingCount} pendiente(s)` : "Sin pendientes"}</span></span>
              <span class="mt-2 inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold sm:mt-0 ${tone.soft} ${tone.text}">${row.value ? `${row.value}%` : "-"}</span>
              <span class="mt-2 flex items-center gap-2 sm:mt-0"><span class="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><span class="block h-full rounded-full ${tone.bar}" style="width:${row.value}%"></span></span><span class="w-10 text-right text-[11px] font-semibold ${tone.text}">${row.value}%</span></span>
              <span class="mt-2 inline-flex w-fit rounded-full px-2 py-1 text-[10px] font-semibold sm:mt-0 ${tone.soft} ${tone.text}">${reachedMinimum ? row.value >= 80 ? "Alto" : "Aceptable" : "En riesgo"}</span>
            </button>
          `;
        }).join("") : `<p class="px-4 py-10 text-center text-xs text-slate-500">No hay estudiantes para este filtro.</p>`}
      </div>
      <footer class="border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[10px] text-slate-500">Ordenado de menor a mayor rendimiento. Pulse un estudiante para abrir su boleta de esta materia.</footer>
    </section>
  `;
}

function hasAttendanceForTrimester(trimesterId) {
  return Boolean(notesData?.attendanceByTrimester) && Object.prototype.hasOwnProperty.call(notesData.attendanceByTrimester, trimesterId);
}

async function ensureAttendanceForTrimester(trimesterId) {
  const data = notesData;
  if (!data) return [];
  if (Object.prototype.hasOwnProperty.call(data.attendanceByTrimester, trimesterId)) return data.attendanceByTrimester[trimesterId];
  const pending = data.attendancePromises[trimesterId] || listDirectorAttendanceByTrimester(trimesterId);
  data.attendancePromises[trimesterId] = pending;
  let records;
  try {
    records = await pending;
  } finally {
    delete data.attendancePromises[trimesterId];
  }
  data.attendanceByTrimester[trimesterId] = records;
  return records;
}

async function openStudentDetails(studentId) {
  notesState.studentId = studentId;
  notesState.fromStudents = false;
  notesState.reportError = "";
  const trimesterId = notesState.trimesterId;
  if (!notesState.subjectId || hasAttendanceForTrimester(trimesterId)) {
    notesState.reportLoading = false;
    renderNotesContent();
    return;
  }

  notesState.reportLoading = true;
  renderNotesContent();
  try {
    await ensureAttendanceForTrimester(trimesterId);
  } catch {
    notesState.reportError = "No se pudo cargar la asistencia necesaria para calcular SER.";
  } finally {
    notesState.reportLoading = false;
    if (notesState.studentId === studentId) renderNotesContent();
  }
}

function subjectReportData(courseView, row, subject) {
  const activities = (notesData.allActivities || []).filter((activity) => termOf(activity) === notesState.trimesterId && activity.cursoId === courseView.course.id);
  const gradesMap = gradeByActivityAndStudent(notesData.grades);
  const attendanceRows = notesData.attendanceByTrimester[notesState.trimesterId] || [];
  const calc = calculateSubjectTerm(row.student, subject.id, activities, gradesMap, attendanceRows);
  return { calc, serCriteria: calc.serCriteria, autoActivity: calc.autoActivity, autoGradeRecord: calc.autoGradeRecord, pendingCount: calc.pendingCount };
}

function subjectReportContent(courseView, row, subject) {
  const { calc, pendingCount } = subjectReportData(courseView, row, subject);
  const passed = calc.final >= 51;
  const scores = [
    { label: "SER", value: calc.ser10, maximum: 10, tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    { label: "SABER", value: calc.saber45, maximum: 45, tone: "border-amber-200 bg-amber-50 text-amber-700" },
    { label: "HACER", value: calc.hacer40, maximum: 40, tone: "border-green-200 bg-green-50 text-green-700" },
    { label: "AUTO", value: calc.auto5, maximum: 5, tone: "border-slate-200 bg-slate-50 text-slate-700" }
  ];
  return `
    <div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        ${scores.map((item) => `
          <div class="rounded-lg border px-3 py-3 text-center ${item.tone}">
            <p class="text-[10px] font-semibold uppercase">${item.label}</p>
            <p class="mt-1 text-2xl font-semibold leading-none">${item.value}<span class="text-xs font-medium opacity-70">/${item.maximum}</span></p>
          </div>
        `).join("")}
      </div>
      <div class="mt-3 flex items-center justify-between gap-3 rounded-lg bg-school-navy px-4 py-4 text-white">
        <div><p class="text-[10px] font-semibold uppercase text-white/70">Nota final</p><p class="mt-1 text-sm font-semibold">${passed ? "Aprobado" : "Reprobado"}</p></div>
        <p class="text-4xl font-semibold leading-none">${calc.final}<span class="text-sm font-medium text-white/70">/100</span></p>
      </div>
      ${pendingCount ? `<p class="mt-3 flex items-center gap-2 text-[11px] text-red-700">${icon("circle-alert", "h-4 w-4 shrink-0")} ${pendingCount} pendiente(s) se calculan con 35 puntos.</p>` : ""}
    </div>
  `;
}

function studentPanel(courseView) {
  if (!notesState.studentId) return "";
  const row = courseView.rows.find((item) => item.student.id === notesState.studentId);
  if (!row) return "";
  const selectedSubject = notesState.subjectId ? courseView.subjects.find((subject) => subject.id === notesState.subjectId) : null;
  const activities = courseView.activities.map((activity) => {
    const grade = courseView.gradeByKey.get(`${activity.id}|${row.student.id}`);
    return { activity, grade, value: gradeValue(grade?.nota), pending: !grade };
  }).sort((a, b) => Number(b.pending) - Number(a.pending) || String(b.activity.fecha || "").localeCompare(String(a.activity.fecha || "")));
  const pendingCount = activities.filter((item) => item.pending).length;
  const lowCount = activities.filter((item) => !item.pending && item.value < notesState.threshold).length;
  const subjectContent = selectedSubject
    ? notesState.reportLoading
      ? `<div class="grid min-h-72 place-items-center"><div class="text-center"><span class="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-school-green"></span><p class="mt-3 text-xs font-medium text-slate-600">Calculando la boleta...</p><p class="mt-1 text-[10px] text-slate-400">Cargando asistencia de ${escapeDirectorHtml(TRIMESTERS.find((term) => term.id === notesState.trimesterId)?.label || "este trimestre")}</p></div></div>`
      : notesState.reportError
        ? `<div class="grid min-h-72 place-items-center"><div class="max-w-sm text-center"><span class="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-red-100 text-red-700">${icon("triangle-alert", "h-5 w-5")}</span><p class="mt-3 text-sm font-semibold text-red-700">No se pudo calcular la boleta</p><p class="mt-1 text-xs leading-5 text-slate-500">${escapeDirectorHtml(notesState.reportError)}</p><button type="button" data-director-note-retry-report class="mt-4 rounded-lg bg-school-green px-3 py-2 text-xs font-semibold text-white">Reintentar</button></div></div>`
        : subjectReportContent(courseView, row, selectedSubject)
    : `
      <div class="grid grid-cols-3 gap-2">
        ${stat("Rendimiento", row.average ? `${row.average}%` : "-", "Todas las materias", "chart-no-axes-column-increasing", "bg-green-100 text-school-green")}
        ${stat("Pendientes", pendingCount, "Valen 35", "circle-dashed", "bg-red-100 text-red-700")}
        ${stat("Bajo minimo", lowCount, `Menores a ${notesState.threshold}`, "triangle-alert", "bg-amber-100 text-amber-700")}
      </div>
      <h4 class="mt-5 text-xs font-semibold uppercase text-slate-800">Rendimiento por materia</h4>
      <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">${courseView.subjects.map((subject) => `<div class="rounded-lg border border-slate-200 px-2.5 py-2"><p class="truncate text-[10px] text-slate-500">${escapeDirectorHtml(subject.nombre)}</p><p class="mt-0.5 text-base font-semibold ${(row.subjectScores[subject.id] || 0) < notesState.threshold ? "text-red-600" : "text-school-green"}">${row.subjectScores[subject.id] ? `${row.subjectScores[subject.id]}%` : "-"}</p></div>`).join("")}</div>
      <div class="mt-5 flex items-center justify-between gap-2"><h4 class="text-xs font-semibold uppercase text-slate-800">Actividades</h4><span class="text-[10px] text-slate-500">Pendientes primero</span></div>
      <div class="mt-2 overflow-hidden rounded-lg border border-slate-200">
        ${activities.length ? activities.map(({ activity, grade, value, pending }) => `
          <div class="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-0 ${pending ? "bg-red-50/60" : "bg-white"}">
            <div class="min-w-0">
              <p class="truncate text-xs font-medium text-slate-800">${escapeDirectorHtml(activity.titulo || "Actividad")}</p>
              <p class="mt-0.5 text-[10px] text-slate-500">${escapeDirectorHtml(subjectName(activity.materiaId))}${activity.fecha ? ` · ${escapeDirectorHtml(activity.fecha)}` : ""}</p>
            </div>
            <div class="text-right">${score(value)}<p class="mt-0.5 text-[9px] ${pending ? "text-red-600" : "text-slate-400"}">${pending ? "Pendiente" : escapeDirectorHtml(grade?.estado || "Calificada")}</p></div>
          </div>
        `).join("") : `<p class="p-5 text-center text-xs text-slate-500">Sin actividades calificadas.</p>`}
      </div>
    `;
  if (selectedSubject) {
    return `
      <div class="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[1px]" data-close-director-note-panel></div>
      <div class="pointer-events-none fixed inset-0 z-[60] grid place-items-center p-3 sm:p-5">
        <section class="pointer-events-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Boleta de ${escapeDirectorHtml(row.student.nombre)}">
          <header class="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
            <div class="min-w-0">
              <p class="text-[10px] font-semibold uppercase tracking-[.12em] text-school-green">Boleta del trimestre</p>
              <h3 class="mt-1 truncate text-base font-semibold text-slate-950">${escapeDirectorHtml(row.student.nombre)}</h3>
              <p class="mt-1 text-xs text-slate-500">${escapeDirectorHtml(selectedSubject.nombre)} · ${escapeDirectorHtml(courseView.course.nombre)} · ${escapeDirectorHtml(TRIMESTERS.find((term) => term.id === notesState.trimesterId)?.label || notesState.trimesterId)}</p>
            </div>
            <button type="button" data-close-director-note-student class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200" aria-label="Cerrar">${icon("x", "h-4 w-4")}</button>
          </header>
          <div class="p-4 sm:p-5">${subjectContent}</div>
        </section>
      </div>
    `;
  }
  return `
    <div class="fixed inset-0 z-50 bg-slate-950/35" data-close-director-note-panel></div>
    <aside class="fixed inset-y-0 right-0 z-[60] flex w-full max-w-xl flex-col bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
        <div class="min-w-0">
          ${notesState.fromStudents ? `<a href="#/director/estudiantes" class="mb-2 inline-flex items-center gap-1 text-[10px] font-semibold text-school-green hover:underline">${icon("arrow-left", "h-3.5 w-3.5")} Volver a estudiantes</a>` : ""}
          <p class="text-[10px] font-semibold uppercase text-school-green">${selectedSubject ? "Boleta del estudiante" : "Detalle del estudiante"}</p>
          <h3 class="mt-1 truncate text-base font-semibold text-slate-950">${escapeDirectorHtml(row.student.nombre)}</h3>
          <p class="mt-1 text-xs text-slate-500">${escapeDirectorHtml(courseView.course.nombre)}${selectedSubject ? ` · ${escapeDirectorHtml(selectedSubject.nombre)}` : ""} · ${TRIMESTERS.find((term) => term.id === notesState.trimesterId)?.label}</p>
        </div>
        <button type="button" data-close-director-note-student class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600" aria-label="Cerrar">${icon("x", "h-4 w-4")}</button>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">${subjectContent}</div>
    </aside>
  `;
}

function renderNotesContent() {
  const root = document.querySelector("[data-director-notes-root]");
  if (!root || !notesData) return;
  const data = selectedData();
  const courses = activeCourses(data.activities, data.grades);
  if (!courses.some((item) => item.course.id === notesState.courseId)) {
    if (notesState.studentId) {
      const requestedStudent = notesData.students.find((student) => student.id === notesState.studentId);
      notesState.courseId = requestedStudent?.cursoId || courses[0]?.course.id || COURSES[0].id;
    } else if (notesState.view !== "school") {
      notesState.view = "school";
      notesState.courseId = "";
      notesState.subjectId = "";
    }
  }
  const fallbackCourse = COURSES.find((item) => item.id === notesState.courseId) || COURSES[0];
  const course = courses.find((item) => item.course.id === notesState.courseId) || {
    course: fallbackCourse,
    ...rowsForCourse(fallbackCourse.id, data.activities, data.grades)
  };
  let subject = course.subjects.find((item) => item.id === notesState.subjectId) || null;
  if (notesState.view === "subject" && !subject) {
    notesState.view = "course";
    notesState.subjectId = "";
    subject = null;
  }
  sessionStorage.setItem("directorNotasTrimestre", notesState.trimesterId);
  sessionStorage.setItem("directorNotasCurso", notesState.courseId);
  sessionStorage.setItem("directorNotasVista", notesState.view);

  let viewContent = "";
  if (courses.length) {
    if (notesState.view === "school") {
      viewContent = `${breadcrumbs(course, subject)}${schoolOverview(courses)}`;
    } else if (notesState.view === "subject" && subject) {
      viewContent = `${breadcrumbs(course, subject)}${subjectStudentPerformance(course, subject)}`;
    } else {
      viewContent = `${breadcrumbs(course)}${subjectPerformance(course)}`;
    }
  } else {
    viewContent = `<section class="mt-3 rounded-lg border border-slate-200 bg-white px-5 py-12 text-center shadow-sm"><div class="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-slate-100 text-slate-400">${icon("notebook-tabs", "h-5 w-5")}</div><h2 class="mt-3 text-sm font-semibold text-slate-800">Sin notas en este trimestre</h2><p class="mt-1 text-xs text-slate-500">Las actividades aparecen cuando ya tienen al menos una calificacion.</p></section>`;
  }
  root.innerHTML = `
    ${toolbar()}
    ${viewContent}
    ${studentPanel(course)}
  `;
  refreshDirectorIcons();
}

function loadingState(message = "Cargando notas...") {
  const root = document.querySelector("[data-director-notes-root]");
  if (!root) return;
  root.innerHTML = `<section class="grid min-h-72 place-items-center rounded-lg border border-slate-200 bg-white"><div class="text-center"><span class="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-school-green"></span><p class="mt-3 text-xs text-slate-500">${message}</p></div></section>`;
}

function loadError(message) {
  const root = document.querySelector("[data-director-notes-root]");
  if (!root) return;
  root.innerHTML = `${toolbar()}<section class="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center"><p class="text-sm font-semibold text-red-700">${escapeDirectorHtml(message)}</p><button type="button" data-director-note-retry-load class="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700">Reintentar</button></section>`;
  refreshDirectorIcons();
}

async function loadNotes(force = false) {
  if (notesData && !force) {
    applyRequestedStudent();
    await ensureAttendanceForTrimester(notesState.trimesterId);
    renderNotesContent();
    return;
  }
  loadingState(force ? "Actualizando datos..." : "Cargando notas...");
  const [students, allActivities, grades] = await Promise.all([
    listDirectorStudents(),
    listDirectorAllActivities(),
    listDirectorGrades()
  ]);
  const activities = allActivities.filter((item) => (
    !item.interno && !["material", "materiales"].includes(String(item.tipo || "").toLowerCase())
  ));
  notesData = { students, activities, allActivities, grades, attendanceByTrimester: {}, attendancePromises: {}, updatedAt: Date.now() };
  notesState.trimesterId = preferredTrimester(activities, grades);
  applyRequestedStudent();
  await ensureAttendanceForTrimester(notesState.trimesterId);
  renderNotesContent();
}

function bindInteractions() {
  const root = document.querySelector("[data-director-notes-root]");
  if (!root || root.dataset.bound === "true") return;
  root.dataset.bound = "true";
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) {
      if (event.target.matches("[data-close-director-note-panel]")) {
        notesState.studentId = "";
        notesState.fromStudents = false;
        notesState.reportLoading = false;
        notesState.reportError = "";
        renderNotesContent();
      }
      return;
    }
    if (button.dataset.directorNoteSegmentStudent) {
      if (button.dataset.directorNoteSegmentView === "school") {
        return;
      }
      notesState.courseId = button.dataset.directorNoteSegmentCourse || notesState.courseId;
      notesState.subjectId = button.dataset.directorNoteSegmentSubject || "";
      notesState.view = button.dataset.directorNoteSegmentView === "school" ? "school" : "course";
      await openStudentDetails(button.dataset.directorNoteSegmentStudent);
      return;
    }
    if (button.dataset.directorNoteView) {
      const nextView = button.dataset.directorNoteView;
      if (nextView === "course" && !notesState.courseId) return;
      if (nextView === "subject" && (!notesState.courseId || !notesState.subjectId)) return;
      notesState.view = nextView;
      notesState.studentId = "";
      notesState.filter = "all";
      notesState.fromStudents = false;
      notesState.reportLoading = false;
      notesState.reportError = "";
      renderNotesContent();
      return;
    }
    if (button.dataset.directorNoteTerm) {
      notesState.trimesterId = button.dataset.directorNoteTerm;
      notesState.courseId = "";
      notesState.view = "school";
      notesState.subjectId = "";
      notesState.studentId = "";
      notesState.fromStudents = false;
      notesState.reportLoading = false;
      notesState.reportError = "";
      loadingState("Calculando notas del trimestre...");
      try {
        await ensureAttendanceForTrimester(notesState.trimesterId);
        renderNotesContent();
      } catch {
        loadError("No se pudo cargar la asistencia para calcular las notas.");
      }
      return;
    }
    if (button.dataset.directorNoteCourse) {
      notesState.courseId = button.dataset.directorNoteCourse;
      notesState.view = "course";
      notesState.subjectId = "";
      notesState.studentId = "";
      notesState.fromStudents = false;
      notesState.reportLoading = false;
      notesState.reportError = "";
      renderNotesContent();
      return;
    }
    if (button.dataset.directorNoteFilter) {
      notesState.filter = button.dataset.directorNoteFilter;
      renderNotesContent();
      return;
    }
    if (button.dataset.directorNoteSubject) {
      notesState.subjectId = button.dataset.directorNoteSubject;
      notesState.view = "subject";
      notesState.filter = "all";
      notesState.studentId = "";
      notesState.fromStudents = false;
      notesState.reportLoading = false;
      notesState.reportError = "";
      renderNotesContent();
      return;
    }
    if ("directorNoteSchool" in button.dataset) {
      notesState.view = "school";
      notesState.studentId = "";
      notesState.filter = "all";
      notesState.fromStudents = false;
      notesState.reportLoading = false;
      notesState.reportError = "";
      renderNotesContent();
      return;
    }
    if (button.dataset.directorNoteStudent) {
      await openStudentDetails(button.dataset.directorNoteStudent);
      return;
    }
    if ("directorNoteRetryReport" in button.dataset) {
      if (notesData?.attendanceByTrimester) delete notesData.attendanceByTrimester[notesState.trimesterId];
      await openStudentDetails(notesState.studentId);
      return;
    }
    if ("closeDirectorNoteStudent" in button.dataset) {
      notesState.studentId = "";
      notesState.fromStudents = false;
      notesState.reportLoading = false;
      notesState.reportError = "";
      renderNotesContent();
      return;
    }
    if ("directorNoteRetryLoad" in button.dataset) {
      button.disabled = true;
      await loadNotes(false).catch(() => loadError("No se pudieron cargar las notas."));
      return;
    }
    if ("directorNoteRefresh" in button.dataset) {
      button.disabled = true;
      await loadNotes(true).catch(() => loadError("No se pudieron actualizar las notas."));
    }
  });
  root.addEventListener("change", (event) => {
    const input = event.target.closest("[data-director-note-threshold]");
    if (!input) return;
    notesState.threshold = Math.max(35, Math.min(100, Number(input.value) || 51));
    sessionStorage.setItem("directorNotasMinima", String(notesState.threshold));
    renderNotesContent();
  });
}

export function DirectorNotes() {
  return DirectorShell("/director/notas", `<div class="mx-auto max-w-[1600px]" data-director-notes-root><section class="grid min-h-72 place-items-center rounded-lg border border-slate-200 bg-white"><p class="text-xs text-slate-500">Preparando notas...</p></section></div>`, {
    title: "Notas",
    subtitle: "Rendimiento por trimestre, curso, materia y estudiante."
  });
}

export async function bindDirectorNotes(route) {
  if (route !== "/director/notas") return;
  bindInteractions();
  try {
    await loadNotes(false);
  } catch {
    loadError("No se pudieron cargar las notas.");
  }
}
