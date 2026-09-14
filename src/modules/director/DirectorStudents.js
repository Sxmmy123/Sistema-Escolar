import { icon } from "../../ui/dom.js";
import {
  COURSES,
  attendancePercent,
  attendanceTotals,
  listDirectorActivities,
  listDirectorGrades,
  listDirectorRecentAttendance,
  listDirectorStudents,
  subjectName
} from "../../services/directorData.js";
import { DirectorShell, directorCard, directorStat } from "./DirectorShell.js";
import { escapeDirectorHtml, refreshDirectorIcons } from "./DirectorUtils.js";

const TRIMESTERS = [
  { id: "t1", label: "1er trimestre" },
  { id: "t2", label: "2do trimestre" },
  { id: "t3", label: "3er trimestre" }
];

let selectedCourseId = sessionStorage.getItem("directorCursoEstudiantes") || COURSES[0].id;
let allStudents = [];
let studentsLoaded = false;
let studentSearch = "";
let reportDataPromise = null;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function courseFor(courseId) {
  return COURSES.find((course) => course.id === courseId) || COURSES[0];
}

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

function courseTabs() {
  return `
    <div class="flex gap-1.5 overflow-x-auto pb-1">
      ${COURSES.map((course) => `
        <button type="button" data-director-student-course="${course.id}" class="shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition ${course.id === selectedCourseId ? "border-school-green bg-school-green text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-green-300 hover:bg-green-50"}">${escapeDirectorHtml(course.corto)}</button>
      `).join("")}
    </div>
  `;
}

function studentsTable() {
  return `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <label class="relative block w-full sm:max-w-sm">
        ${icon("search", "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400")}
        <input type="search" data-director-student-search value="${escapeDirectorHtml(studentSearch)}" placeholder="Buscar por nombre, CI o curso..." class="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-school-green focus:ring-2 focus:ring-green-100" />
      </label>
      <p class="text-[11px] text-slate-500" data-director-students-visible>Preparando lista...</p>
    </div>
    <div class="overflow-x-auto">
      <table class="min-w-[680px] w-full text-left text-sm">
        <thead><tr class="border-b border-slate-100 text-[10px] font-semibold uppercase text-slate-500"><th class="w-12 py-2.5">N.</th><th>Alumno</th><th class="w-24">Curso</th><th class="w-28">CI</th><th class="w-20">Estado</th><th class="w-10"><span class="sr-only">Abrir informe</span></th></tr></thead>
        <tbody data-director-students-list>
          <tr><td colspan="6" class="py-5 text-sm font-medium text-slate-500">Cargando alumnos...</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

export function DirectorStudents() {
  const course = courseFor(selectedCourseId);
  const content = `
    <div class="mx-auto max-w-[1500px]">
      <section class="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <div data-director-students-course-total>${directorStat("Alumnos del curso", "0", course.nombre, "users", "bg-school-green text-white")}</div>
        <div data-director-students-general-total>${directorStat("Total registrados", "0", "Estudiantes activos", "contact-round", "bg-school-gold text-white")}</div>
        <div class="col-span-2 lg:col-span-1" data-director-students-courses-total>${directorStat("Cursos activos", "0", "Con estudiantes", "school", "bg-slate-700 text-white")}</div>
      </section>
      <section class="mt-3">
        ${directorCard("Seleccionar curso", courseTabs())}
      </section>
      <section class="mt-3">
        ${directorCard(`<span data-director-students-title>${escapeDirectorHtml(course.nombre)}</span>`, studentsTable())}
      </section>
    </div>
    <div data-director-student-modal></div>
  `;
  return DirectorShell("/director/estudiantes", content, {
    title: "Estudiantes",
    subtitle: "Busque un estudiante y revise su avance academico."
  });
}

function studentsForView() {
  const query = normalizeText(studentSearch);
  if (!query) return allStudents.filter((student) => student.cursoId === selectedCourseId);
  return allStudents.filter((student) => {
    const course = courseFor(student.cursoId);
    return normalizeText(`${student.nombre} ${student.ci} ${course.nombre} ${course.corto}`).includes(query);
  });
}

function renderRows() {
  const tbody = document.querySelector("[data-director-students-list]");
  const visible = document.querySelector("[data-director-students-visible]");
  if (!tbody) return;
  const students = studentsForView();
  if (visible) {
    visible.textContent = studentSearch
      ? `${students.length} resultado(s) en todos los cursos`
      : `${students.length} estudiante(s) en ${courseFor(selectedCourseId).nombre}`;
  }
  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-sm text-slate-500">No se encontraron estudiantes.</td></tr>`;
    return;
  }
  tbody.innerHTML = students.map((student, index) => {
    const course = courseFor(student.cursoId);
    return `
      <tr class="group border-b border-slate-100 transition last:border-0 hover:bg-green-50/60">
        <td class="py-2 text-xs font-semibold text-school-green">${index + 1}</td>
        <td class="py-2 pr-3">
          <button type="button" data-director-student-report="${student.id}" class="max-w-[22rem] truncate text-left text-sm font-semibold text-slate-900 transition group-hover:text-school-green">
            ${escapeDirectorHtml(student.nombre || "Sin nombre")}
          </button>
        </td>
        <td class="py-2 pr-3"><span class="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">${escapeDirectorHtml(course.corto)}</span></td>
        <td class="py-2 pr-3 text-xs text-slate-500">${escapeDirectorHtml(student.ci || "-")}</td>
        <td class="py-2"><span class="rounded-full bg-green-50 px-2 py-1 text-[10px] font-semibold text-school-green">Activo</span></td>
        <td class="py-2 text-right">
          <button type="button" data-director-student-report="${student.id}" class="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-school-green" aria-label="Abrir informe de ${escapeDirectorHtml(student.nombre || "estudiante")}">
            ${icon("chevron-right", "h-4 w-4")}
          </button>
        </td>
      </tr>
    `;
  }).join("");
  refreshDirectorIcons();
}

function updateStudentSummary() {
  const course = courseFor(selectedCourseId);
  const courseStudents = allStudents.filter((student) => student.cursoId === selectedCourseId);
  const activeCourses = new Set(allStudents.map((student) => student.cursoId).filter(Boolean)).size;
  const courseTotal = document.querySelector("[data-director-students-course-total]");
  const generalTotal = document.querySelector("[data-director-students-general-total]");
  const coursesTotal = document.querySelector("[data-director-students-courses-total]");
  const title = document.querySelector("[data-director-students-title]");
  if (courseTotal) courseTotal.innerHTML = directorStat("Alumnos del curso", courseStudents.length, course.nombre, "users", "bg-school-green text-white");
  if (generalTotal) generalTotal.innerHTML = directorStat("Total registrados", allStudents.length, "Estudiantes activos", "contact-round", "bg-school-gold text-white");
  if (coursesTotal) coursesTotal.innerHTML = directorStat("Cursos activos", activeCourses, "Con estudiantes", "school", "bg-slate-700 text-white");
  if (title) title.textContent = studentSearch ? "Resultados de busqueda" : course.nombre;
}

async function refreshStudents() {
  const tbody = document.querySelector("[data-director-students-list]");
  if (!studentsLoaded && tbody) tbody.innerHTML = `<tr><td colspan="6" class="py-5 text-sm font-medium text-slate-500">Cargando alumnos...</td></tr>`;
  if (!studentsLoaded) {
    allStudents = (await listDirectorStudents())
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" }));
    studentsLoaded = true;
  }
  updateStudentSummary();
  renderRows();
  refreshDirectorIcons();
}

async function reportData() {
  if (!reportDataPromise) {
    reportDataPromise = Promise.all([
      listDirectorActivities(),
      listDirectorGrades(),
      listDirectorRecentAttendance(1500)
    ]).then(([activities, grades, attendance]) => ({ activities, grades, attendance }));
  }
  try {
    return await reportDataPromise;
  } catch (error) {
    reportDataPromise = null;
    throw error;
  }
}

function reportTerm(student, data) {
  const activityById = new Map(data.activities
    .filter((activity) => activity.cursoId === student.cursoId)
    .map((activity) => [activity.id, activity]));
  const counts = data.grades.reduce((result, grade) => {
    const activity = activityById.get(grade.actividadId);
    if (!activity) return result;
    const termId = termOf(activity);
    result[termId] = (result[termId] || 0) + 1;
    return result;
  }, {});
  const remembered = sessionStorage.getItem("directorNotasTrimestre");
  if (TRIMESTERS.some((term) => term.id === remembered) && counts[remembered]) return remembered;
  return [...TRIMESTERS].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))[0]?.id || remembered || "t1";
}

function buildStudentReport(student, data) {
  const trimesterId = reportTerm(student, data);
  const startedIds = new Set(data.grades.map((grade) => grade.actividadId).filter(Boolean));
  const activities = data.activities.filter((activity) => (
    activity.cursoId === student.cursoId &&
    termOf(activity) === trimesterId &&
    startedIds.has(activity.id)
  ));
  const gradeByActivity = new Map(data.grades
    .filter((grade) => grade.alumnoId === student.id)
    .map((grade) => [grade.actividadId, grade]));
  const values = activities.map((activity) => gradeValue(gradeByActivity.get(activity.id)?.nota));
  const pending = activities.filter((activity) => !gradeByActivity.has(activity.id)).length;
  const low = activities.filter((activity) => {
    const grade = gradeByActivity.get(activity.id);
    return grade && gradeValue(grade.nota) < 51;
  }).length;
  const subjectIds = [...new Set(activities.map((activity) => activity.materiaId).filter(Boolean))];
  const subjects = subjectIds.map((subjectId) => {
    const subjectActivities = activities.filter((activity) => activity.materiaId === subjectId);
    return {
      id: subjectId,
      name: subjectName(subjectId),
      average: average(subjectActivities.map((activity) => gradeValue(gradeByActivity.get(activity.id)?.nota)))
    };
  }).sort((a, b) => a.average - b.average || a.name.localeCompare(b.name));
  const attendance = data.attendance.filter((record) => record.alumnoId === student.id && termOf(record) === trimesterId);
  return {
    student,
    course: courseFor(student.cursoId),
    trimesterId,
    trimester: TRIMESTERS.find((term) => term.id === trimesterId)?.label || trimesterId,
    average: average(values),
    pending,
    low,
    subjects,
    attendance,
    attendanceTotals: attendanceTotals(attendance),
    attendancePercent: attendancePercent(attendance)
  };
}

function metric(label, value, detail, tone, iconName) {
  return `
    <div class="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}">${icon(iconName, "h-4 w-4")}</span>
      <span class="min-w-0"><span class="block text-[9px] font-semibold uppercase text-slate-500">${label}</span><strong class="block text-lg font-semibold leading-tight text-slate-900">${value}</strong><span class="block truncate text-[9px] text-slate-500">${detail}</span></span>
    </div>
  `;
}

function reportModal(report) {
  const totals = report.attendanceTotals;
  const scoreTone = report.average && report.average < 51 ? "bg-red-100 text-red-700" : "bg-green-100 text-school-green";
  return `
    <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-2 sm:p-5" data-close-director-student-report>
      <section class="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="director-student-report-title">
        <header class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <div class="min-w-0">
            <p class="text-[9px] font-semibold uppercase tracking-[.12em] text-school-green">Informe del estudiante</p>
            <h3 id="director-student-report-title" class="mt-1 truncate text-base font-semibold text-slate-950 sm:text-xl">${escapeDirectorHtml(report.student.nombre || "Sin nombre")}</h3>
            <p class="mt-1 text-[11px] text-slate-500">${escapeDirectorHtml(report.course.nombre)} · ${escapeDirectorHtml(report.trimester)}</p>
          </div>
          <button type="button" data-close-director-student-report-button class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600" aria-label="Cerrar">${icon("x", "h-4 w-4")}</button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
            ${metric("Promedio", report.average || "-", "Actividades", scoreTone, "chart-no-axes-column-increasing")}
            ${metric("Asistencia", report.attendance.length ? `${report.attendancePercent}%` : "-", `${report.attendance.length} registros`, "bg-blue-100 text-blue-700", "clipboard-check")}
            ${metric("Pendientes", report.pending, "Se consideran 35", "bg-red-100 text-red-700", "circle-dashed")}
            ${metric("Notas bajas", report.low, "Menores a 51", "bg-amber-100 text-amber-700", "triangle-alert")}
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-[1fr_1.35fr]">
            <section class="rounded-lg border border-slate-200 p-3">
              <div class="flex items-center justify-between gap-2">
                <h4 class="text-xs font-semibold uppercase text-slate-800">Asistencia</h4>
                <span class="text-[10px] text-slate-500">Solo dias registrados</span>
              </div>
              <div class="mt-3 grid grid-cols-4 gap-1.5 text-center">
                <div class="rounded-md bg-green-50 px-1 py-2"><strong class="block text-base text-school-green">${totals.presente || 0}</strong><span class="text-[9px] text-slate-500">Presente</span></div>
                <div class="rounded-md bg-amber-50 px-1 py-2"><strong class="block text-base text-amber-700">${totals.atraso || 0}</strong><span class="text-[9px] text-slate-500">Atraso</span></div>
                <div class="rounded-md bg-purple-50 px-1 py-2"><strong class="block text-base text-purple-700">${totals.permiso || 0}</strong><span class="text-[9px] text-slate-500">Licencia</span></div>
                <div class="rounded-md bg-red-50 px-1 py-2"><strong class="block text-base text-red-700">${totals.falta || 0}</strong><span class="text-[9px] text-slate-500">Falta</span></div>
              </div>
            </section>

            <section class="rounded-lg border border-slate-200 p-3">
              <div class="flex items-center justify-between gap-2">
                <h4 class="text-xs font-semibold uppercase text-slate-800">Resumen por materia</h4>
                <span class="text-[10px] text-slate-500">Promedio /100</span>
              </div>
              <div class="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                ${report.subjects.length ? report.subjects.map((subject) => `<div class="rounded-md bg-slate-50 px-2 py-2"><span class="block truncate text-[9px] text-slate-500">${escapeDirectorHtml(subject.name)}</span><strong class="mt-0.5 block text-sm font-semibold ${subject.average < 51 ? "text-red-600" : "text-school-green"}">${subject.average}</strong></div>`).join("") : `<p class="col-span-full py-4 text-center text-xs text-slate-500">Sin actividades calificadas.</p>`}
              </div>
            </section>
          </div>

          <div class="mt-4 flex flex-col gap-3 rounded-lg bg-green-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-xs leading-5 text-slate-600">Este es un resumen. En Notas puede revisar cada materia y todas las actividades del estudiante.</p>
            <button type="button" data-open-director-student-notes="${report.student.id}" data-student-course="${report.student.cursoId}" data-student-term="${report.trimesterId}" class="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-school-green px-3 py-2 text-xs font-semibold text-white shadow-sm">
              Ver notas completas ${icon("arrow-right", "h-4 w-4")}
            </button>
          </div>
        </div>
      </section>
    </div>
  `;
}

async function openStudentReport(studentId) {
  const modal = document.querySelector("[data-director-student-modal]");
  const student = allStudents.find((item) => item.id === studentId);
  if (!modal || !student) return;
  modal.innerHTML = `<div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"><div class="rounded-lg bg-white px-6 py-5 text-center shadow-2xl"><span class="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-school-green"></span><p class="mt-3 text-xs text-slate-500">Preparando informe...</p></div></div>`;
  try {
    modal.innerHTML = reportModal(buildStudentReport(student, await reportData()));
    refreshDirectorIcons();
  } catch {
    modal.innerHTML = `<div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" data-close-director-student-report><div class="w-full max-w-sm rounded-lg bg-white p-5 text-center shadow-2xl"><p class="text-sm font-semibold text-red-700">No se pudo cargar el informe.</p><button type="button" data-close-director-student-report-button class="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Cerrar</button></div></div>`;
  }
}

function updateCourseButtons() {
  document.querySelectorAll("[data-director-student-course]").forEach((button) => {
    const active = button.dataset.directorStudentCourse === selectedCourseId;
    button.className = `shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition ${active ? "border-school-green bg-school-green text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-green-300 hover:bg-green-50"}`;
  });
}

export function bindDirectorStudents(route) {
  if (route !== "/director/estudiantes") return;
  const searchInput = document.querySelector("[data-director-student-search]");
  searchInput?.addEventListener("input", () => {
    studentSearch = searchInput.value;
    updateStudentSummary();
    renderRows();
  });

  document.querySelector("[data-director-students-list]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-director-student-report]");
    if (button) openStudentReport(button.dataset.directorStudentReport);
  });

  document.querySelector("[data-director-student-modal]")?.addEventListener("click", (event) => {
    const modal = event.currentTarget;
    const openButton = event.target.closest("[data-open-director-student-notes]");
    if (openButton) {
      sessionStorage.setItem("directorNotasEstudiante", openButton.dataset.openDirectorStudentNotes);
      sessionStorage.setItem("directorNotasCursoSolicitado", openButton.dataset.studentCourse);
      sessionStorage.setItem("directorNotasTrimestreSolicitado", openButton.dataset.studentTerm);
      sessionStorage.setItem("directorNotasOrigen", "estudiantes");
      window.location.hash = "#/director/notas";
      return;
    }
    if (event.target.matches("[data-close-director-student-report]") || event.target.closest("[data-close-director-student-report-button]")) {
      modal.innerHTML = "";
    }
  });

  document.querySelectorAll("[data-director-student-course]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCourseId = button.dataset.directorStudentCourse;
      studentSearch = "";
      if (searchInput) searchInput.value = "";
      sessionStorage.setItem("directorCursoEstudiantes", selectedCourseId);
      updateCourseButtons();
      updateStudentSummary();
      renderRows();
    });
  });

  refreshStudents().catch(() => {
    const tbody = document.querySelector("[data-director-students-list]");
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-sm text-red-600">No se pudieron cargar los alumnos.</td></tr>`;
  });
}
