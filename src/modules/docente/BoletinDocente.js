import { SUBJECTS, findSubject } from "../../data/catalog.js";
import { icon } from "../../ui/dom.js";
import {
  TRIMESTERS,
  getTeacherDataCacheMeta,
  getTeacherNotesSnapshot,
  refreshTeacherNotesSnapshot
} from "../../services/teacherData.js";
import {
  activityHasGrades,
  calculateStudentTerm,
  gradeByActivityAndStudent,
  gradeTone,
  isSaberActivity,
  studentActivityGrade
} from "./AcademicoDocente.js";
import { teacherState } from "./EstadoDocente.js";
import { compactSubjectName, emptyState, escapeHtml, refreshIcons } from "./UtilidadesDocente.js";

function selectedCourse(context = teacherState.context) {
  const courses = context?.courses || [];
  if (!courses.length) return null;
  return courses.find((course) => course.id === teacherState.selectedCourseId) || courses[0];
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  if (!valid.length) return "";
  return Math.round(valid.reduce((total, value) => total + Number(value), 0) / valid.length);
}

function gradeCell(value) {
  if (value === "" || value == null) return `<td class="px-1 py-1 text-center text-slate-300">-</td>`;
  return `<td class="px-1 py-1 text-center ${gradeTone(value)}">${value}</td>`;
}

function buildSubjectFinal(student, subjectId, snapshot) {
  if (!snapshot) return "";
  const { activities = [], gradesList = [], attendanceRows = [] } = snapshot;
  const gradesMap = gradeByActivityAndStudent(gradesList);
  const subjectActivitiesAll = activities.filter((item) => item.materiaId === subjectId);
  const subjectActivities = subjectActivitiesAll
    .filter((item) => !item.interno && !["ser", "auto"].includes(item.tipo))
    .filter((item) => activityHasGrades(item, gradesMap));
  const serCriteria = subjectActivitiesAll
    .filter((item) => item.tipo === "ser")
    .filter((item) => gradesMap[item.id]?.[student.id]);
  const autoActivity = subjectActivitiesAll.find((item) => item.tipo === "auto") || null;
  const autoGrade = autoActivity ? gradesMap[autoActivity.id]?.[student.id]?.nota : null;
  const hasData = subjectActivities.length || serCriteria.length || autoGrade != null;
  if (!hasData) return "";
  const serExtraValues = serCriteria.map((item) => studentActivityGrade(item, student.id, gradesMap));
  const calc = calculateStudentTerm(student, subjectActivities, gradesMap, attendanceRows, serExtraValues, autoGrade);
  return calc.final;
}

function courseTabs(context, currentCourse) {
  const courses = context?.courses || [];
  if (courses.length <= 1) return "";
  return `
    <div class="flex gap-2 overflow-x-auto pb-1">
      ${courses.map((course) => `
        <button type="button" data-bulletin-course="${course.id}" class="shrink-0 rounded-xl border px-3 py-2 text-xs font-black transition ${course.id === currentCourse.id ? "border-school-green bg-school-green text-white shadow-soft" : "border-slate-200 bg-white text-slate-600 hover:border-school-green/50"}">
          ${escapeHtml(course.nombre)}
        </button>
      `).join("")}
    </div>
  `;
}

function subjectHeaderCells() {
  return SUBJECTS.map((subject) => `
    <th class="h-24 w-8 border-r border-slate-200 px-1 py-1 text-center text-[9px] font-semibold text-slate-700 [writing-mode:vertical-rl]" title="${escapeHtml(subject.nombre)}">
      ${escapeHtml(compactSubjectName(subject.id, subject.nombre))}
    </th>
  `).join("");
}

function renderBulletinTable({ course, students, snapshotsByTerm, cacheMetas }) {
  const rows = students.map((student, index) => {
    const termAverages = [];
    const termCells = TRIMESTERS.map((trimester) => {
      const snapshot = snapshotsByTerm[trimester.id];
      const subjectGrades = SUBJECTS.map((subject) => buildSubjectFinal(student, subject.id, snapshot));
      const termAverage = average(subjectGrades);
      if (termAverage !== "") termAverages.push(termAverage);
      return `${subjectGrades.map(gradeCell).join("")}${gradeCell(termAverage)}`;
    }).join("");
    const annualAverage = average(termAverages);
    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50">
        <td class="sticky left-0 z-10 border-r border-slate-200 bg-white px-1 py-1.5 text-center text-[10px] font-semibold text-school-green">${escapeHtml(student.numeroLista || index + 1)}</td>
        <td class="sticky left-8 z-10 min-w-48 border-r border-slate-200 bg-white px-2 py-1.5 text-left text-[10px] font-normal uppercase text-slate-800">${escapeHtml(student.nombre)}</td>
        ${termCells}
        <td class="border-l border-slate-200 px-2 py-1.5 text-center text-[11px] font-semibold ${annualAverage !== "" && annualAverage <= 50 ? "bg-red-50 text-red-700" : annualAverage !== "" ? "bg-green-50 text-green-800" : "bg-slate-50 text-slate-400"}">${annualAverage || "-"}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
      <table class="min-w-[1180px] border-collapse text-[10px] leading-tight">
        <thead>
          <tr class="bg-white">
            <th colspan="2" class="sticky left-0 z-20 border-b border-r border-slate-200 bg-white px-2 py-2 text-left text-xs font-black text-school-bark">
              ${escapeHtml(course.nombre)}
            </th>
            ${TRIMESTERS.map((trimester) => `
              <th colspan="${SUBJECTS.length + 1}" class="border-b border-r border-slate-200 px-2 py-2 text-center text-xs font-black uppercase text-school-green">
                ${escapeHtml(trimester.label)}
              </th>
            `).join("")}
            <th rowspan="2" class="w-20 border-b border-slate-200 bg-green-50 px-2 py-2 text-center text-[11px] font-semibold leading-tight text-school-green">Promedio<br>anual</th>
          </tr>
          <tr class="bg-slate-50">
            <th class="sticky left-0 z-20 w-8 border-b border-r border-slate-200 bg-slate-50 px-1 py-2 text-center font-semibold">No.</th>
            <th class="sticky left-8 z-20 w-48 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-left font-semibold">Apellidos y nombres</th>
            ${TRIMESTERS.map(() => `${subjectHeaderCells()}<th class="h-24 w-8 border-r border-slate-200 bg-amber-50 px-1 py-1 text-center text-[9px] font-semibold text-amber-800 [writing-mode:vertical-rl]">Prom.</th>`).join("")}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
      ${TRIMESTERS.map((trimester) => `<span class="rounded-full bg-slate-100 px-2 py-1">${escapeHtml(trimester.label)}: ${cacheMetas[trimester.id]?.label ? `copia ${escapeHtml(cacheMetas[trimester.id].label)}` : "sin copia"}</span>`).join("")}
    </div>
  `;
}

export async function renderBulletin(context) {
  const container = document.querySelector("[data-teacher-bulletin]");
  if (!container) return;
  const course = selectedCourse(context);
  if (!course) {
    container.innerHTML = emptyState("Sin cursos asignados", "Admin debe asignarte un curso antes de ver el boletin.");
    return;
  }

  const snapshots = await Promise.all(TRIMESTERS.map((trimester) => getTeacherNotesSnapshot(context, course, trimester.id)));
  const snapshotsByTerm = Object.fromEntries(TRIMESTERS.map((trimester, index) => [trimester.id, snapshots[index]]));
  const cacheMetas = Object.fromEntries(TRIMESTERS.map((trimester) => [trimester.id, getTeacherDataCacheMeta(context, "notas", course.id, trimester.id)]));
  const firstSnapshot = snapshots.find(Boolean);
  const students = firstSnapshot?.students || [];
  const missing = snapshots.some((snapshot) => !snapshot);

  container.innerHTML = `
    <section class="space-y-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:rounded-3xl sm:p-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-[.18em] text-school-green">Boletin centralizador</p>
            <h2 class="mt-1 text-xl font-black text-slate-900 sm:text-2xl">${escapeHtml(course.nombre)}</h2>
            <p class="mt-1 text-xs font-semibold text-slate-500">${students.length || "-"} alumno(s) · ${SUBJECTS.length} materia(s) · 3 trimestres</p>
          </div>
          <div class="flex flex-col gap-2 lg:items-end">
            ${courseTabs(context, course)}
            <button type="button" data-refresh-bulletin class="inline-flex items-center justify-center gap-2 rounded-xl bg-school-green px-3 py-2 text-xs font-black text-white shadow-soft transition hover:bg-school-navy sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
              ${icon("refresh-cw", "h-4 w-4")} Actualizar boletin
            </button>
          </div>
        </div>
      </div>
      ${missing ? `
        <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 shadow-soft">
          Faltan datos cargados de uno o mas trimestres. Presiona <b>Actualizar boletin</b> para reunir notas, asistencias y alumnos del curso.
        </div>
      ` : ""}
      ${students.length ? renderBulletinTable({ course, students, snapshotsByTerm, cacheMetas }) : emptyState("Sin alumnos cargados", "Actualiza el boletin o registra alumnos en este curso.")}
    </section>
  `;

  container.querySelectorAll("[data-bulletin-course]").forEach((button) => {
    button.addEventListener("click", async () => {
      teacherState.selectedCourseId = button.dataset.bulletinCourse;
      sessionStorage.setItem("docenteCursoId", teacherState.selectedCourseId);
      await renderBulletin(context);
    });
  });

  container.querySelector("[data-refresh-bulletin]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = `${icon("loader-2", "h-4 w-4 animate-spin")} Actualizando...`;
    await Promise.all(TRIMESTERS.map((trimester) => refreshTeacherNotesSnapshot(context, course, trimester.id)));
    await renderBulletin(context);
  });

  refreshIcons();
}

