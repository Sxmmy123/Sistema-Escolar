import { icon } from "../../ui/dom.js";
import {
  COURSES,
  SUBJECTS,
  listDirectorActivities,
  listDirectorGrades,
  listDirectorStudents,
  subjectName
} from "../../services/directorData.js";
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
  filter: "all",
  subjectId: "",
  studentId: "",
  fromStudents: false
};

let notesData = null;

function termOf(item) {
  return item?.trimestreId || "t1";
}

function gradeValue(value) {
  const parsed = Number(value);
  return Math.max(35, Math.min(100, Number.isFinite(parsed) ? Math.round(parsed) : 35));
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : 0;
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
  const subjects = SUBJECTS.filter((subject) => courseActivities.some((activity) => activity.materiaId === subject.id));

  const rows = students.map((student, index) => {
    const scores = [];
    let pending = 0;
    let low = 0;
    const subjectPending = {};
    const subjectScores = Object.fromEntries(subjects.map((subject) => {
      const subjectActivities = courseActivities.filter((activity) => activity.materiaId === subject.id);
      const values = subjectActivities.map((activity) => {
        const grade = gradeByKey.get(`${activity.id}|${student.id}`);
        if (!grade) {
          pending += 1;
          subjectPending[subject.id] = (subjectPending[subject.id] || 0) + 1;
        }
        const value = gradeValue(grade?.nota);
        if (grade && value < 51) low += 1;
        scores.push(value);
        return value;
      });
      return [subject.id, average(values)];
    }));
    return {
      student,
      number: index + 1,
      subjectScores,
      subjectPending,
      average: average(scores),
      pending,
      low
    };
  });

  return { rows, subjects, activities: courseActivities, gradeByKey };
}

function activeCourses(activities, grades) {
  return COURSES.map((course) => {
    const view = rowsForCourse(course.id, activities, grades);
    const averages = view.rows.filter((row) => row.average).map((row) => row.average);
    return {
      course,
      ...view,
      average: average(averages),
      approved: view.rows.filter((row) => row.average >= 51).length,
      risk: view.rows.filter((row) => row.average > 0 && row.average < 51).length,
      pending: view.rows.reduce((sum, row) => sum + row.pending, 0)
    };
  }).filter((item) => item.activities.length);
}

function scoreClass(value) {
  if (!value) return "text-slate-400";
  if (value < 51) return "bg-red-50 text-red-700";
  if (value < 70) return "bg-amber-50 text-amber-800";
  return "bg-green-50 text-school-green";
}

function score(value, pending = false) {
  if (!value) return `<span class="text-slate-300">-</span>`;
  return `<span class="inline-flex min-w-8 items-center justify-center rounded-md px-1.5 py-1 text-[11px] font-semibold ${scoreClass(value)}">${value}${pending ? `<span class="ml-1 h-1.5 w-1.5 rounded-full bg-red-500" title="Incluye pendientes"></span>` : ""}</span>`;
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

function toolbar(courses) {
  return `
    <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <div class="inline-flex rounded-lg bg-slate-100 p-1" aria-label="Seleccionar trimestre">
            ${TRIMESTERS.map((term) => `
              <button type="button" data-director-note-term="${term.id}" class="rounded-md px-3 py-1.5 text-xs font-semibold transition ${notesState.trimesterId === term.id ? "bg-school-green text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}">${term.label}</button>
            `).join("")}
          </div>
          <div class="flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
            ${courses.map((item) => `
              <button type="button" data-director-note-course="${item.course.id}" class="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${notesState.courseId === item.course.id ? "border-school-green bg-green-50 text-school-green" : "border-slate-200 bg-white text-slate-600 hover:border-green-300"}">
                ${escapeDirectorHtml(item.course.corto || item.course.nombre)} <span class="ml-1 text-[10px] opacity-60">${item.rows.length}</span>
              </button>
            `).join("")}
          </div>
        </div>
        <button type="button" data-director-note-refresh class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-school-green px-3 py-2 text-xs font-semibold text-school-green transition hover:bg-green-50">
          ${icon("refresh-cw", "h-4 w-4")} Actualizar datos
        </button>
      </div>
    </section>
  `;
}

function summaryStats(courses) {
  const rows = courses.flatMap((course) => course.rows).filter((row) => row.average);
  const pending = rows.reduce((sum, row) => sum + row.pending, 0);
  return `
    <section class="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
      ${stat("Promedio", average(rows.map((row) => row.average)) || "-", "Actividades iniciadas", "trending-up", "bg-green-100 text-school-green")}
      ${stat("Aprobados", rows.filter((row) => row.average >= 51).length, "Promedio desde 51", "user-check", "bg-emerald-100 text-emerald-700")}
      ${stat("En riesgo", rows.filter((row) => row.average < 51).length, "Promedio menor a 51", "triangle-alert", "bg-amber-100 text-amber-700")}
      ${stat("Sin calificar", pending, "Registrados como 35", "circle-dashed", "bg-red-100 text-red-700")}
    </section>
  `;
}

function studentTable(courseView) {
  let rows = [...courseView.rows];
  if (notesState.filter === "risk") rows = rows.filter((row) => row.average > 0 && row.average < 51);
  if (notesState.filter === "pending") rows = rows.filter((row) => row.pending > 0);
  if (notesState.subjectId) {
    rows.sort((a, b) => (a.subjectScores[notesState.subjectId] || 999) - (b.subjectScores[notesState.subjectId] || 999) || a.student.nombre.localeCompare(b.student.nombre));
  }

  const empty = `<tr><td colspan="${courseView.subjects.length + 5}" class="px-4 py-10 text-center text-sm text-slate-500">No hay estudiantes para este filtro.</td></tr>`;
  return `
    <section class="mt-3 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
        <div>
          <h2 class="text-sm font-semibold text-slate-950">${escapeDirectorHtml(courseView.course.nombre)}</h2>
          <p class="text-[11px] text-slate-500">Pulse una materia para ordenar de menor a mayor. El punto rojo indica una nota pendiente.</p>
        </div>
        <div class="inline-flex rounded-lg bg-slate-100 p-1">
          ${[
            ["all", "Todos"],
            ["risk", "En riesgo"],
            ["pending", "Pendientes"]
          ].map(([id, label]) => `<button type="button" data-director-note-filter="${id}" class="rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${notesState.filter === id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}">${label}</button>`).join("")}
        </div>
      </div>
      <div class="max-w-full overflow-x-auto">
        <table class="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th class="sticky left-0 z-20 w-10 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center">N.</th>
              <th class="sticky left-10 z-20 min-w-52 border-b border-r border-slate-200 bg-slate-50 px-3 py-2">Estudiante</th>
              ${courseView.subjects.map((subject) => `
                <th class="border-b border-slate-200 px-1 py-1.5 text-center">
                  <button type="button" data-director-note-subject="${subject.id}" class="w-full rounded-md border px-2 py-1.5 text-[10px] font-semibold normal-case ${notesState.subjectId === subject.id ? "border-school-green bg-green-50 text-school-green" : "border-transparent hover:border-slate-200 hover:bg-white"}">${escapeDirectorHtml(subject.corto || subject.nombre)}</button>
                </th>
              `).join("")}
              <th class="border-b border-l border-slate-200 px-2 py-2 text-center">Prom.</th>
              <th class="border-b border-slate-200 px-2 py-2 text-center">Pend.</th>
              <th class="border-b border-slate-200 px-2 py-2 text-center">Estado</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rows.length ? rows.map((row) => `
              <tr class="group hover:bg-green-50/40">
                <td class="sticky left-0 z-10 border-r border-slate-100 bg-white px-2 py-2 text-center text-[11px] text-slate-500 group-hover:bg-green-50">${row.number}</td>
                <td class="sticky left-10 z-10 border-r border-slate-100 bg-white px-3 py-2 group-hover:bg-green-50">
                  <button type="button" data-director-note-student="${row.student.id}" class="max-w-56 truncate text-left text-xs font-semibold text-slate-800 hover:text-school-green">${escapeDirectorHtml(row.student.nombre || "Sin nombre")}</button>
                </td>
                ${courseView.subjects.map((subject) => `<td class="px-1 py-1.5 text-center">${score(row.subjectScores[subject.id], Boolean(row.subjectPending[subject.id]))}</td>`).join("")}
                <td class="border-l border-slate-100 px-2 py-1.5 text-center">${score(row.average)}</td>
                <td class="px-2 py-1.5 text-center"><span class="${row.pending ? "text-red-600" : "text-slate-400"}">${row.pending || "-"}</span></td>
                <td class="px-2 py-1.5 text-center"><span class="inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${!row.average ? "bg-slate-100 text-slate-500" : row.average >= 51 ? "bg-green-50 text-school-green" : "bg-red-50 text-red-700"}">${!row.average ? "Sin notas" : row.average >= 51 ? "Aprobado" : "En riesgo"}</span></td>
              </tr>
            `).join("") : empty}
          </tbody>
        </table>
      </div>
      <footer class="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">Mostrando ${rows.length} de ${courseView.rows.length} estudiantes</footer>
    </section>
  `;
}

function sideSummary(courses, courseView) {
  const subjectRows = courseView.subjects.map((subject) => ({
    subject,
    value: average(courseView.rows.map((row) => row.subjectScores[subject.id]).filter(Boolean))
  })).sort((a, b) => a.value - b.value);
  return `
    <aside class="mt-3 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-1">
      <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h2 class="text-xs font-semibold uppercase text-slate-800">Rendimiento por materia</h2>
        <div class="mt-3 grid gap-2.5">
          ${subjectRows.length ? subjectRows.map((item) => `
            <button type="button" data-director-note-subject="${item.subject.id}" class="group text-left">
              <div class="mb-1 flex items-center justify-between gap-2 text-[11px]"><span class="truncate text-slate-700">${escapeDirectorHtml(item.subject.nombre)}</span><span class="font-semibold ${item.value < 51 ? "text-red-600" : "text-school-green"}">${item.value}</span></div>
              <div class="h-1.5 overflow-hidden rounded-full bg-slate-100"><span class="block h-full rounded-full ${item.value < 51 ? "bg-red-500" : "bg-school-green"}" style="width:${item.value}%"></span></div>
            </button>
          `).join("") : `<p class="text-xs text-slate-500">Sin materias calificadas.</p>`}
        </div>
      </section>
      <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h2 class="text-xs font-semibold uppercase text-slate-800">Comparacion por curso</h2>
        <div class="mt-3 grid gap-2">
          ${courses.map((item) => `
            <button type="button" data-director-note-course="${item.course.id}" class="grid grid-cols-[42px_1fr_32px] items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-slate-50">
              <span class="text-[11px] text-slate-600">${escapeDirectorHtml(item.course.corto)}</span>
              <span class="h-1.5 overflow-hidden rounded-full bg-slate-100"><span class="block h-full rounded-full ${item.average && item.average < 51 ? "bg-red-500" : "bg-school-green"}" style="width:${item.average || 0}%"></span></span>
              <span class="text-right text-[11px] font-semibold ${item.average && item.average < 51 ? "text-red-600" : "text-school-green"}">${item.average || "-"}</span>
            </button>
          `).join("")}
        </div>
      </section>
    </aside>
  `;
}

function studentPanel(courseView) {
  if (!notesState.studentId) return "";
  const row = courseView.rows.find((item) => item.student.id === notesState.studentId);
  if (!row) return "";
  const activities = courseView.activities.map((activity) => {
    const grade = courseView.gradeByKey.get(`${activity.id}|${row.student.id}`);
    return { activity, grade, value: gradeValue(grade?.nota), pending: !grade };
  }).sort((a, b) => Number(b.pending) - Number(a.pending) || String(b.activity.fecha || "").localeCompare(String(a.activity.fecha || "")));
  return `
    <div class="fixed inset-0 z-50 bg-slate-950/35" data-close-director-note-panel></div>
    <aside class="fixed inset-y-0 right-0 z-[60] flex w-full max-w-lg flex-col bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
        <div class="min-w-0">
          ${notesState.fromStudents ? `<a href="#/director/estudiantes" class="mb-2 inline-flex items-center gap-1 text-[10px] font-semibold text-school-green hover:underline">${icon("arrow-left", "h-3.5 w-3.5")} Volver a estudiantes</a>` : ""}
          <p class="text-[10px] font-semibold uppercase text-school-green">Detalle del estudiante</p>
          <h3 class="mt-1 truncate text-base font-semibold text-slate-950">${escapeDirectorHtml(row.student.nombre)}</h3>
          <p class="mt-1 text-xs text-slate-500">${escapeDirectorHtml(courseView.course.nombre)} · ${TRIMESTERS.find((term) => term.id === notesState.trimesterId)?.label}</p>
        </div>
        <button type="button" data-close-director-note-student class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600" aria-label="Cerrar">${icon("x", "h-4 w-4")}</button>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <div class="grid grid-cols-3 gap-2">
          ${stat("Promedio", row.average || "-", "Sobre 100", "chart-no-axes-column-increasing", "bg-green-100 text-school-green")}
          ${stat("Pendientes", row.pending, "Valen 35", "circle-dashed", "bg-red-100 text-red-700")}
          ${stat("Bajas", row.low, "Menores a 51", "triangle-alert", "bg-amber-100 text-amber-700")}
        </div>
        <h4 class="mt-5 text-xs font-semibold uppercase text-slate-800">Promedio por materia</h4>
        <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          ${courseView.subjects.map((subject) => `<div class="rounded-lg border border-slate-200 px-2.5 py-2"><p class="truncate text-[10px] text-slate-500">${escapeDirectorHtml(subject.nombre)}</p><p class="mt-0.5 text-base font-semibold ${(row.subjectScores[subject.id] || 0) < 51 ? "text-red-600" : "text-school-green"}">${row.subjectScores[subject.id] || "-"}</p></div>`).join("")}
        </div>
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
      </div>
    </aside>
  `;
}

function renderNotesContent() {
  const root = document.querySelector("[data-director-notes-root]");
  if (!root || !notesData) return;
  const data = selectedData();
  const courses = activeCourses(data.activities, data.grades);
  if (!notesState.studentId && !courses.some((item) => item.course.id === notesState.courseId)) {
    notesState.courseId = courses[0]?.course.id || COURSES[0].id;
  }
  const fallbackCourse = COURSES.find((item) => item.id === notesState.courseId) || COURSES[0];
  const course = courses.find((item) => item.course.id === notesState.courseId) || {
    course: fallbackCourse,
    ...rowsForCourse(fallbackCourse.id, data.activities, data.grades)
  };
  sessionStorage.setItem("directorNotasTrimestre", notesState.trimesterId);
  sessionStorage.setItem("directorNotasCurso", notesState.courseId);
  root.innerHTML = `
    ${toolbar(courses)}
    ${summaryStats(courses)}
    ${courses.length ? `<div class="xl:grid xl:grid-cols-[minmax(0,1fr)_250px] xl:gap-3">${studentTable(course)}${sideSummary(courses, course)}</div>` : `<section class="mt-3 rounded-lg border border-slate-200 bg-white px-5 py-12 text-center shadow-sm"><div class="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-slate-100 text-slate-400">${icon("notebook-tabs", "h-5 w-5")}</div><h2 class="mt-3 text-sm font-semibold text-slate-800">Sin notas en este trimestre</h2><p class="mt-1 text-xs text-slate-500">Las actividades aparecen cuando ya tienen al menos una calificacion.</p></section>`}
    ${studentPanel(course)}
  `;
  refreshDirectorIcons();
}

function loadingState(message = "Cargando notas...") {
  const root = document.querySelector("[data-director-notes-root]");
  if (!root) return;
  root.innerHTML = `<section class="grid min-h-72 place-items-center rounded-lg border border-slate-200 bg-white"><div class="text-center"><span class="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-school-green"></span><p class="mt-3 text-xs text-slate-500">${message}</p></div></section>`;
}

async function loadNotes(force = false) {
  if (notesData && !force) {
    applyRequestedStudent();
    renderNotesContent();
    return;
  }
  loadingState(force ? "Actualizando datos..." : "Cargando notas...");
  const [students, activities, grades] = await Promise.all([
    listDirectorStudents(),
    listDirectorActivities(),
    listDirectorGrades()
  ]);
  notesData = { students, activities, grades, updatedAt: Date.now() };
  notesState.trimesterId = preferredTrimester(activities, grades);
  applyRequestedStudent();
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
        renderNotesContent();
      }
      return;
    }
    if (button.dataset.directorNoteTerm) {
      notesState.trimesterId = button.dataset.directorNoteTerm;
      notesState.courseId = "";
      notesState.subjectId = "";
      notesState.studentId = "";
      notesState.fromStudents = false;
      renderNotesContent();
    }
    if (button.dataset.directorNoteCourse) {
      notesState.courseId = button.dataset.directorNoteCourse;
      notesState.subjectId = "";
      notesState.studentId = "";
      notesState.fromStudents = false;
      renderNotesContent();
    }
    if (button.dataset.directorNoteFilter) {
      notesState.filter = button.dataset.directorNoteFilter;
      renderNotesContent();
    }
    if (button.dataset.directorNoteSubject) {
      notesState.subjectId = notesState.subjectId === button.dataset.directorNoteSubject ? "" : button.dataset.directorNoteSubject;
      renderNotesContent();
    }
    if (button.dataset.directorNoteStudent) {
      notesState.studentId = button.dataset.directorNoteStudent;
      notesState.fromStudents = false;
      renderNotesContent();
    }
    if ("closeDirectorNoteStudent" in button.dataset) {
      notesState.studentId = "";
      notesState.fromStudents = false;
      renderNotesContent();
    }
    if ("directorNoteRefresh" in button.dataset) {
      button.disabled = true;
      await loadNotes(true).catch(() => {
        const currentRoot = document.querySelector("[data-director-notes-root]");
        if (currentRoot) currentRoot.insertAdjacentHTML("afterbegin", `<p class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">No se pudieron actualizar las notas.</p>`);
      });
    }
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
    const root = document.querySelector("[data-director-notes-root]");
    if (root) root.innerHTML = `<section class="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center"><p class="text-sm font-semibold text-red-700">No se pudieron cargar las notas.</p><button type="button" data-director-note-refresh class="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700">Reintentar</button></section>`;
  }
}
