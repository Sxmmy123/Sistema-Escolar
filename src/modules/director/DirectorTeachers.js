import { COURSES, SUBJECTS, listDirectorTeachers } from "../../services/directorData.js";
import { icon } from "../../ui/dom.js";
import { DirectorShell } from "./DirectorShell.js";
import { escapeDirectorHtml, refreshDirectorIcons } from "./DirectorUtils.js";

function subjectById(subjectId) {
  return SUBJECTS.find((subject) => subject.id === subjectId) || null;
}

function subjectIds(value) {
  const source = value?.materias || value?.subjects || value;
  if (Array.isArray(source)) return source.map(String).filter(Boolean);
  if (source && typeof source === "object") {
    return Object.keys(source).filter((subjectId) => Boolean(source[subjectId]));
  }
  return [];
}

function assignmentGroups(teacher) {
  const assignments = teacher?.asignaciones || {};
  return COURSES.map((course) => ({
    course,
    subjects: subjectIds(assignments[course.id])
  })).filter(({ course, subjects }) => (
    subjects.length || Object.prototype.hasOwnProperty.call(assignments, course.id)
  ));
}

function groupedAssignments(teacher) {
  const grouped = new Map();
  assignmentGroups(teacher).forEach(({ course, subjects }) => {
    const key = [...subjects].sort().join("|") || "sin-materias";
    const current = grouped.get(key) || { courses: [], subjects };
    current.courses.push(course);
    grouped.set(key, current);
  });
  return [...grouped.values()];
}

function teacherInitials(name) {
  const words = String(name || "Docente").trim().split(/\s+/).filter(Boolean);
  return `${words[0]?.[0] || "D"}${words.length > 1 ? words[words.length - 1][0] : ""}`.toUpperCase();
}

function subjectBadge(subjectId) {
  const subject = subjectById(subjectId);
  return `
    <span class="inline-flex min-h-5 items-center rounded-md border border-slate-200/70 bg-slate-100 px-1.5 py-0.5 text-[8px] font-medium leading-none text-slate-600 sm:min-h-6 sm:px-2 sm:py-1 sm:text-[10px]" title="${escapeDirectorHtml(subject?.nombre || subjectId)}">
      <span class="sm:hidden">${escapeDirectorHtml(subject?.corto || subject?.nombre || subjectId)}</span>
      <span class="hidden sm:inline">${escapeDirectorHtml(subject?.nombre || subjectId)}</span>
    </span>
  `;
}

function teacherCard(teacher) {
  const groups = assignmentGroups(teacher);
  const compactGroups = groupedAssignments(teacher);
  const assignedSubjects = [...new Set(groups.flatMap((group) => group.subjects))];
  return `
    <article class="min-w-0 overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition hover:border-green-200 hover:shadow-[0_5px_14px_rgba(15,23,42,0.09)]">
      <div class="flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
        <div class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-green-50 text-[10px] font-semibold text-school-green ring-1 ring-green-100 sm:h-10 sm:w-10 sm:text-xs">
          ${escapeDirectorHtml(teacherInitials(teacher.nombre))}
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-[10px] font-semibold text-slate-950 sm:text-sm" title="${escapeDirectorHtml(teacher.nombre || "Sin nombre")}">${escapeDirectorHtml(teacher.nombre || "Sin nombre")}</h3>
          <div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] text-slate-500 sm:gap-x-3 sm:text-[10px]">
            <span class="inline-flex items-center gap-1">${icon("school", "h-2.5 w-2.5 text-school-green sm:h-3.5 sm:w-3.5")} ${groups.length} curso${groups.length === 1 ? "" : "s"}</span>
            <span class="inline-flex items-center gap-1">${icon("book-open", "h-2.5 w-2.5 text-amber-500 sm:h-3.5 sm:w-3.5")} ${assignedSubjects.length} materia${assignedSubjects.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>
      <div class="border-t border-slate-100 px-2.5 sm:px-3">
        ${compactGroups.length ? compactGroups.map(({ courses, subjects }) => `
          <div class="border-b border-slate-100 py-2 last:border-0 sm:py-2.5">
            <div class="flex min-w-0 flex-wrap gap-1">
              ${courses.map((course) => `
                <span class="inline-flex min-h-5 items-center gap-1 rounded-md bg-green-50 px-1.5 py-0.5 text-[8px] font-medium text-school-green sm:min-h-6 sm:px-2 sm:py-1 sm:text-[10px]">
                  ${icon("users-round", "h-2.5 w-2.5 sm:h-3 sm:w-3")}
                  <span class="sm:hidden">${escapeDirectorHtml(course.corto)}</span>
                  <span class="hidden sm:inline">${escapeDirectorHtml(course.nombre)}</span>
                </span>
              `).join("")}
            </div>
            <div class="mt-1.5 flex min-w-0 flex-wrap gap-1 sm:mt-2 sm:gap-1.5">
              ${subjects.length ? subjects.map(subjectBadge).join("") : `<span class="py-1 text-[10px] text-slate-400 sm:text-[11px]">Sin materias asignadas</span>`}
            </div>
          </div>
        `).join("") : `
          <div class="flex items-center gap-2 py-3 text-[11px] text-amber-700">
            ${icon("circle-alert", "h-4 w-4")} Sin cursos asignados
          </div>
        `}
      </div>
    </article>
  `;
}

function renderTeacherList(teachers) {
  const list = document.querySelector("[data-director-teachers-list]");
  if (!list) return;
  list.innerHTML = teachers.length
    ? teachers.map(teacherCard).join("")
    : `
      <div class="col-span-full rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
        ${icon("users", "mx-auto h-6 w-6 text-slate-300")}
        <p class="mt-2 text-sm font-medium text-slate-700">No hay docentes registrados</p>
      </div>
    `;
  refreshDirectorIcons();
}

export function DirectorTeachers() {
  const content = `
    <section class="grid grid-cols-2 items-start gap-2 sm:gap-3 lg:grid-cols-3" data-director-teachers-list>
      <div class="col-span-full rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">Cargando docentes...</div>
    </section>
  `;
  return DirectorShell("/director/docentes", content, {
    title: "Docentes",
    subtitle: "Cursos y materias asignadas al plantel docente."
  });
}

export async function bindDirectorTeachers(route) {
  if (route !== "/director/docentes") return;
  const list = document.querySelector("[data-director-teachers-list]");
  try {
    const teachers = await listDirectorTeachers();
    renderTeacherList(teachers);
  } catch (error) {
    if (list) {
      list.innerHTML = `<div class="col-span-full rounded-lg border border-red-100 bg-red-50 px-4 py-8 text-center text-sm text-red-700">No se pudo cargar la informacion de docentes.</div>`;
    }
  }
}
