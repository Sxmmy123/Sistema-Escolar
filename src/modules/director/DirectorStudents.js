import { icon } from "../../ui/dom.js";
import {
  COURSES,
  attendancePercent,
  listDirectorAllActivities,
  listDirectorAttendanceByTrimester,
  listDirectorGrades,
  listDirectorStudents,
  subjectName
} from "../../services/directorData.js";
import {
  activityHasGrades,
  calculateStudentTerm,
  gradeByActivityAndStudent,
  studentActivityGrade
} from "../docente/AcademicoDocente.js";
import { DirectorShell, directorCard, directorStat } from "./DirectorShell.js";
import { escapeDirectorHtml, refreshDirectorIcons } from "./DirectorUtils.js";

const TRIMESTERS = [
  { id: "t1", label: "1er trimestre" },
  { id: "t2", label: "2do trimestre" },
  { id: "t3", label: "3er trimestre" }
];

const rememberedCourseId = sessionStorage.getItem("directorCursoEstudiantes") || "";
let selectedCourseId = COURSES.some((course) => course.id === rememberedCourseId) ? rememberedCourseId : COURSES[0].id;
let allStudents = [];
let studentsLoaded = false;
let studentSearch = "";
let reportDataPromise = null;
const reportAttendancePromises = new Map();

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

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : 0;
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
      <table class="min-w-[610px] w-full text-left text-sm">
        <thead>
          <tr class="border-b border-slate-100 text-[10px] font-semibold uppercase text-slate-500">
            <th class="w-12 py-2.5">N.</th>
            <th>Alumno</th>
            <th class="w-44 py-2">
              <label class="relative inline-flex min-w-36 items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2 py-1.5 text-school-green shadow-sm">
                ${icon("school", "h-3.5 w-3.5 shrink-0")}
                <select data-director-student-course-select aria-label="Seleccionar curso" class="min-w-0 flex-1 appearance-none bg-transparent pr-4 text-[10px] font-semibold uppercase text-school-green outline-none">
                  ${COURSES.map((course) => `<option value="${course.id}" ${course.id === selectedCourseId ? "selected" : ""}>${escapeDirectorHtml(course.nombre)}</option>`).join("")}
                </select>
                ${icon("chevron-down", "pointer-events-none absolute right-1.5 h-3.5 w-3.5")}
              </label>
            </th>
            <th class="w-28">CI</th>
            <th class="w-10"><span class="sr-only">Abrir resumen</span></th>
          </tr>
        </thead>
        <tbody data-director-students-list>
          <tr><td colspan="5" class="py-5 text-sm font-medium text-slate-500">Cargando alumnos...</td></tr>
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
        ${directorCard(`<span data-director-students-title>Estudiantes de ${escapeDirectorHtml(course.nombre)}</span>`, studentsTable())}
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
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-sm text-slate-500">No se encontraron estudiantes.</td></tr>`;
    return;
  }
  tbody.innerHTML = students.map((student, index) => {
    const course = courseFor(student.cursoId);
    return `
      <tr data-director-student-report="${student.id}" class="group cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-green-50/60">
        <td class="py-2 text-xs font-semibold text-school-green">${index + 1}</td>
        <td class="py-2 pr-3">
          <button type="button" data-director-student-report="${student.id}" class="max-w-[22rem] truncate text-left text-sm font-semibold text-slate-900 transition group-hover:text-school-green">
            ${escapeDirectorHtml(student.nombre || "Sin nombre")}
          </button>
        </td>
        <td class="py-2 pr-3"><button type="button" data-director-student-row-course="${course.id}" class="inline-flex items-center gap-1 rounded-md border border-green-100 bg-green-50 px-2 py-1 text-[10px] font-semibold text-school-green transition hover:border-green-300 hover:bg-green-100" title="Mostrar ${escapeDirectorHtml(course.nombre)}">${icon("school", "h-3 w-3")} ${escapeDirectorHtml(course.nombre)}</button></td>
        <td class="py-2 pr-3 text-xs text-slate-500">${escapeDirectorHtml(student.ci || "-")}</td>
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
  if (title) title.textContent = studentSearch ? "Resultados de busqueda" : `Estudiantes de ${course.nombre}`;
}

async function refreshStudents() {
  const tbody = document.querySelector("[data-director-students-list]");
  if (!studentsLoaded && tbody) tbody.innerHTML = `<tr><td colspan="5" class="py-5 text-sm font-medium text-slate-500">Cargando alumnos...</td></tr>`;
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
      listDirectorAllActivities(),
      listDirectorGrades()
    ]).then(([activities, grades]) => ({ activities, grades }));
  }
  try {
    return await reportDataPromise;
  } catch (error) {
    reportDataPromise = null;
    throw error;
  }
}

async function reportAttendance(trimesterId) {
  if (!reportAttendancePromises.has(trimesterId)) {
    reportAttendancePromises.set(trimesterId, listDirectorAttendanceByTrimester(trimesterId));
  }
  try {
    return await reportAttendancePromises.get(trimesterId);
  } catch (error) {
    reportAttendancePromises.delete(trimesterId);
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
  const termActivities = data.activities.filter((activity) => (
    activity.cursoId === student.cursoId &&
    termOf(activity) === trimesterId
  ));
  const termActivityIds = new Set(termActivities.map((activity) => activity.id));
  const termGrades = data.grades.filter((grade) => termActivityIds.has(grade.actividadId));
  const gradesMap = gradeByActivityAndStudent(termGrades);
  const attendance = data.attendance.filter((record) => record.alumnoId === student.id && termOf(record) === trimesterId);
  const subjectIds = [...new Set(termActivities
    .filter((activity) => activity.materiaId && activityHasGrades(activity, gradesMap))
    .map((activity) => activity.materiaId))];
  const subjects = subjectIds.map((subjectId) => {
    const subjectActivities = termActivities.filter((activity) => activity.materiaId === subjectId);
    const gradedActivities = subjectActivities
      .filter((activity) => !activity.interno && !["ser", "auto"].includes(String(activity.tipo || "").toLowerCase()))
      .filter((activity) => activityHasGrades(activity, gradesMap));
    const serCriteria = subjectActivities.filter((activity) => String(activity.tipo || "").toLowerCase() === "ser");
    const autoActivity = subjectActivities.find((activity) => String(activity.tipo || "").toLowerCase() === "auto") || null;
    const serExtraValues = serCriteria.filter((activity) => gradesMap[activity.id]?.[student.id]).map((activity) => studentActivityGrade(activity, student.id, gradesMap));
    const autoGrade = autoActivity ? gradesMap[autoActivity.id]?.[student.id]?.nota ?? null : null;
    const calculation = calculateStudentTerm(student, gradedActivities, gradesMap, attendance, serExtraValues, autoGrade);
    return {
      id: subjectId,
      name: subjectName(subjectId),
      average: calculation.final
    };
  }).sort((a, b) => a.average - b.average || a.name.localeCompare(b.name));
  return {
    student,
    course: courseFor(student.cursoId),
    trimesterId,
    trimester: TRIMESTERS.find((term) => term.id === trimesterId)?.label || trimesterId,
    average: average(subjects.map((subject) => subject.average)),
    subjects,
    attendance,
    attendancePercent: attendancePercent(attendance)
  };
}

function reportModal(report) {
  const hasGrades = report.subjects.length > 0;
  const scoreIsLow = hasGrades && report.average < 51;
  const attendanceValue = report.attendance.length ? `${report.attendancePercent}%` : "--";
  const scoreValue = hasGrades ? report.average : "--";
  return `
    <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-2 sm:p-5" data-close-director-student-report>
      <section class="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="director-student-report-title">
        <header class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-[.12em] text-school-green">Resumen del estudiante</p>
            <h3 id="director-student-report-title" class="mt-1 truncate text-base font-semibold text-slate-950 sm:text-xl">${escapeDirectorHtml(report.student.nombre || "Sin nombre")}</h3>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700">${icon("school", "h-3.5 w-3.5")} ${escapeDirectorHtml(report.course.nombre)}</span>
              <span class="inline-flex items-center gap-1.5 rounded-md bg-school-green px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm">${icon("calendar-range", "h-3.5 w-3.5")} ${escapeDirectorHtml(report.trimester)}</span>
            </div>
          </div>
          <button type="button" data-close-director-student-report-button class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600" aria-label="Cerrar">${icon("x", "h-4 w-4")}</button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div class="grid gap-3 sm:grid-cols-2">
            <article class="flex min-h-52 flex-col overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
              <div class="flex flex-1 flex-col items-center justify-center p-5 text-center">
                <span class="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700">${icon("clipboard-check", "h-5 w-5")}</span>
                <p class="mt-3 text-xs font-semibold uppercase tracking-[.08em] text-slate-500">Asistencia total</p>
                <strong class="mt-1 text-4xl font-semibold leading-none text-slate-950">${attendanceValue}</strong>
              </div>
              <button type="button" data-open-director-student-attendance="${report.student.id}" data-student-course="${report.student.cursoId}" data-student-term="${report.trimesterId}" class="flex min-h-11 w-full items-center justify-between border-t border-blue-100 bg-blue-50 px-4 text-xs font-semibold text-blue-800 transition hover:bg-blue-100">
                Ver mas en Asistencia ${icon("arrow-right", "h-4 w-4")}
              </button>
            </article>

            <article class="flex min-h-52 flex-col overflow-hidden rounded-lg border ${scoreIsLow ? "border-red-200" : "border-green-200"} bg-white shadow-sm">
              <div class="flex flex-1 flex-col items-center justify-center p-5 text-center">
                <span class="grid h-11 w-11 place-items-center rounded-lg ${scoreIsLow ? "bg-red-50 text-red-700" : "bg-green-50 text-school-green"}">${icon("chart-no-axes-column-increasing", "h-5 w-5")}</span>
                <p class="mt-3 text-xs font-semibold uppercase tracking-[.08em] text-slate-500">Nota trimestral</p>
                <div class="mt-1 flex items-end gap-1"><strong class="text-4xl font-semibold leading-none ${scoreIsLow ? "text-red-700" : "text-slate-950"}">${scoreValue}</strong>${hasGrades ? `<span class="pb-0.5 text-xs text-slate-500">/100</span>` : ""}</div>
              </div>
              <button type="button" data-open-director-student-notes="${report.student.id}" data-student-course="${report.student.cursoId}" data-student-term="${report.trimesterId}" class="flex min-h-11 w-full items-center justify-between border-t ${scoreIsLow ? "border-red-100 bg-red-50 text-red-800 hover:bg-red-100" : "border-green-100 bg-green-50 text-green-800 hover:bg-green-100"} px-4 text-xs font-semibold transition">
                Ver mas en Notas ${icon("arrow-right", "h-4 w-4")}
              </button>
            </article>
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
    const data = await reportData();
    const trimesterId = reportTerm(student, data);
    const attendance = await reportAttendance(trimesterId);
    modal.innerHTML = reportModal(buildStudentReport(student, { ...data, attendance }));
    refreshDirectorIcons();
  } catch {
    modal.innerHTML = `<div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" data-close-director-student-report><div class="w-full max-w-sm rounded-lg bg-white p-5 text-center shadow-2xl"><p class="text-sm font-semibold text-red-700">No se pudo cargar el informe.</p><button type="button" data-close-director-student-report-button class="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Cerrar</button></div></div>`;
  }
}

function selectCourse(courseId, searchInput) {
  if (!COURSES.some((course) => course.id === courseId)) return;
  selectedCourseId = courseId;
  studentSearch = "";
  if (searchInput) searchInput.value = "";
  sessionStorage.setItem("directorCursoEstudiantes", selectedCourseId);
  const courseSelect = document.querySelector("[data-director-student-course-select]");
  if (courseSelect) courseSelect.value = selectedCourseId;
  updateStudentSummary();
  renderRows();
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
    const courseButton = event.target.closest("[data-director-student-row-course]");
    if (courseButton) {
      selectCourse(courseButton.dataset.directorStudentRowCourse, searchInput);
      return;
    }
    const button = event.target.closest("[data-director-student-report]");
    if (button) openStudentReport(button.dataset.directorStudentReport);
  });

  document.querySelector("[data-director-student-modal]")?.addEventListener("click", (event) => {
    const modal = event.currentTarget;
    const attendanceButton = event.target.closest("[data-open-director-student-attendance]");
    if (attendanceButton) {
      sessionStorage.setItem("directorAsistenciaEstudiante", attendanceButton.dataset.openDirectorStudentAttendance);
      sessionStorage.setItem("directorAsistenciaCursoSolicitado", attendanceButton.dataset.studentCourse);
      sessionStorage.setItem("directorAsistenciaTrimestreSolicitado", attendanceButton.dataset.studentTerm);
      window.location.hash = "#/director/asistencia";
      return;
    }
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

  document.querySelector("[data-director-student-course-select]")?.addEventListener("change", (event) => {
    selectCourse(event.currentTarget.value, searchInput);
  });

  refreshStudents().catch(() => {
    const tbody = document.querySelector("[data-director-students-list]");
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-sm text-red-600">No se pudieron cargar los alumnos.</td></tr>`;
  });
}
