import { periodsForCourse } from "../../data/catalog.js";
import {
  COURSES,
  DAYS,
  SUBJECTS,
  listDirectorSchedules,
  listDirectorTeachers
} from "../../services/directorData.js";
import { icon } from "../../ui/dom.js";
import { DirectorShell } from "./DirectorShell.js";
import { escapeDirectorHtml, refreshDirectorIcons } from "./DirectorUtils.js";

const CACHE_KEY = "director:cursos-horarios:v2";
const COURSE_KEY = "directorCursoHorario";
const DAY_KEY = "directorDiaHorario";
const VIEW_KEY = "directorVistaHorario";
const DAY_NAMES = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miercoles",
  jueves: "Jueves",
  viernes: "Viernes"
};

let selectedCourseId = sessionStorage.getItem(COURSE_KEY) || COURSES[0].id;
let selectedDayId = sessionStorage.getItem(DAY_KEY) || defaultDayId();
let selectedView = sessionStorage.getItem(VIEW_KEY) || "day";
let moduleData = { schedules: {}, teachers: [], savedAt: 0 };

function defaultDayId() {
  const dayIndex = new Date().getDay();
  return DAYS[dayIndex - 1]?.id || DAYS[0].id;
}

function courseById(courseId) {
  return COURSES.find((course) => course.id === courseId) || COURSES[0];
}

function subjectById(subjectId) {
  return SUBJECTS.find((subject) => subject.id === subjectId) || null;
}

function subjectIcon(subjectId) {
  return {
    matematica: "calculator",
    lenguaje: "book-open-text",
    ciencias_naturales: "leaf",
    ciencias_sociales: "globe-2",
    educacion_fisica: "circle-dot",
    religion: "cross",
    musica: "music-2",
    artes_plasticas: "palette",
    tecnica_tecnologica: "cpu"
  }[subjectId] || "book-open";
}

function normalizedSubjectIds(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value && typeof value === "object") {
    return Object.keys(value).filter((subjectId) => Boolean(value[subjectId]));
  }
  return [];
}

function assignedSubjectIds(teacher, courseId) {
  const assignment = teacher?.asignaciones?.[courseId];
  return normalizedSubjectIds(assignment?.materias || assignment?.subjects || assignment);
}

function teacherNames(courseId, subjectId) {
  return moduleData.teachers
    .filter((teacher) => assignedSubjectIds(teacher, courseId).includes(subjectId))
    .map((teacher) => String(teacher.nombre || "").trim())
    .filter(Boolean);
}

function courseSchedule(courseId) {
  return moduleData.schedules?.[courseId]?.clases || {};
}

function scheduledCells(courseId) {
  const classes = courseSchedule(courseId);
  return periodsForCourse(courseId).flatMap((period) => (
    period.recreo
      ? []
      : DAYS.map((day) => ({
        period,
        day,
        subjectId: classes?.[period.id]?.[day.id] || ""
      })).filter((item) => item.subjectId)
  ));
}

function courseMetrics(courseId) {
  const cells = scheduledCells(courseId);
  const subjectIds = [...new Set(cells.map((item) => item.subjectId))];
  const teachers = [...new Set(subjectIds.flatMap((subjectId) => teacherNames(courseId, subjectId)))];
  return { classes: cells.length, subjects: subjectIds.length, teachers: teachers.length };
}

function loadedCourseCount() {
  return COURSES.filter((course) => scheduledCells(course.id).length > 0).length;
}

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      schedules: parsed.schedules || {},
      teachers: Array.isArray(parsed.teachers) ? parsed.teachers : [],
      savedAt: Number(parsed.savedAt || 0)
    };
  } catch {
    return null;
  }
}

function writeCache(schedules, teachers) {
  const compactSchedules = Object.fromEntries(COURSES.map((course) => [course.id, {
    clases: schedules?.[course.id]?.clases || {}
  }]));
  const compactTeachers = teachers.map((teacher) => ({
    id: teacher.id,
    nombre: teacher.nombre || "",
    asignaciones: teacher.asignaciones || {}
  }));
  const payload = { schedules: compactSchedules, teachers: compactTeachers, savedAt: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  return payload;
}

function cacheLabel() {
  if (!moduleData.savedAt) return "Sin copia local";
  return `Actualizado ${new Date(moduleData.savedAt).toLocaleString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function courseButtons() {
  const options = COURSES.map((course) => `
    <option value="${course.id}" ${course.id === selectedCourseId ? "selected" : ""}>${escapeDirectorHtml(course.nombre)} · ${courseMetrics(course.id).classes || 0} clases</option>
  `).join("");
  const tabs = COURSES.map((course) => {
    const active = course.id === selectedCourseId;
    const metrics = courseMetrics(course.id);
    return `
      <button type="button" data-director-schedule-course="${course.id}" class="inline-flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${active ? "bg-school-green text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-school-green"}">
        <span class="whitespace-nowrap">${escapeDirectorHtml(course.nombre)}</span>
        <span class="rounded px-1.5 py-0.5 text-[9px] ${active ? "bg-white/15 text-white" : "bg-white text-slate-400"}">${metrics.classes || 0}</span>
      </button>
    `;
  }).join("");
  return `
    <label class="block sm:hidden">
      <span class="mb-1 block text-[10px] font-medium uppercase text-slate-500">Curso seleccionado</span>
      <select data-director-schedule-course-select class="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-school-green focus:ring-2 focus:ring-green-100">
        ${options}
      </select>
    </label>
    <div class="hidden flex-wrap gap-1 rounded-lg bg-slate-100 p-1 sm:flex">
      ${tabs}
    </div>
  `;
}

function viewButtons() {
  return `
    <div class="grid w-full grid-cols-2 rounded-lg bg-slate-100 p-1 sm:w-auto" aria-label="Vista del horario">
      <button type="button" data-director-schedule-view="day" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${selectedView === "day" ? "bg-school-green text-white shadow-sm" : "text-slate-600 hover:bg-white"}">
        ${icon("calendar-days", "h-3.5 w-3.5")} Por dia
      </button>
      <button type="button" data-director-schedule-view="course" class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${selectedView === "course" ? "bg-school-green text-white shadow-sm" : "text-slate-600 hover:bg-white"}">
        ${icon("school", "h-3.5 w-3.5")} Por curso
      </button>
    </div>
  `;
}

function dayButtons() {
  return `
    <div class="grid grid-cols-5 gap-1 rounded-lg bg-slate-100 p-1">
      ${DAYS.map((day) => `
        <button type="button" data-director-schedule-day="${day.id}" class="rounded-md px-1 py-2 text-[11px] font-medium transition ${day.id === selectedDayId ? "bg-school-green text-white shadow-sm" : "text-slate-500 hover:bg-white"}">${day.label}</button>
      `).join("")}
    </div>
  `;
}

function navigationControls() {
  return `
    <div class="grid gap-2 sm:flex sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
      <div class="w-full min-w-0 sm:flex-1">
        ${selectedView === "day" ? dayButtons() : courseButtons()}
      </div>
      ${viewButtons()}
    </div>
  `;
}

function subjectCell(courseId, subjectId) {
  if (!subjectId) {
    return `<div class="grid min-h-11 place-items-center rounded-md border border-dashed border-slate-200 text-xs text-slate-300">-</div>`;
  }
  const subject = subjectById(subjectId);
  const names = teacherNames(courseId, subjectId);
  const fullNames = names.length ? names.join(" / ") : "Docente sin asignar";
  const background = subject?.color || "#f1f5f9";
  return `
    <div class="flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-black/5 px-2 py-1.5 text-slate-900" style="background:${background}" title="${escapeDirectorHtml(fullNames)}">
      <span class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/75 text-slate-700">${icon(subjectIcon(subjectId), "h-3.5 w-3.5")}</span>
      <span class="min-w-0">
        <span class="block truncate text-[11px] font-semibold leading-tight">${escapeDirectorHtml(subject?.nombre || subjectId)}</span>
        <span class="mt-0.5 block truncate text-[9px] leading-tight text-slate-600">${escapeDirectorHtml(fullNames)}</span>
      </span>
    </div>
  `;
}

function dailySubjectCell(courseId, period, dayId) {
  if (!period) {
    return `<div class="grid min-h-12 place-items-center text-[10px] text-slate-300">-</div>`;
  }
  const subjectId = courseSchedule(courseId)?.[period.id]?.[dayId] || "";
  if (!subjectId) {
    return `<div class="grid min-h-12 place-items-center rounded-md border border-dashed border-slate-200 text-[10px] text-slate-300">-</div>`;
  }
  const subject = subjectById(subjectId);
  const names = teacherNames(courseId, subjectId);
  const fullNames = names.length ? names.join(" / ") : "Docente sin asignar";
  const startTime = period.hora.split(" - ")[0];
  const mobileName = {
    matematica: "Mat",
    lenguaje: "Len",
    ciencias_naturales: "C.Nat",
    ciencias_sociales: "C.Soc",
    educacion_fisica: "Ed.F",
    religion: "Rel",
    musica: "Mus",
    artes_plasticas: "Art",
    tecnica_tecnologica: "Tec"
  }[subjectId] || subject?.corto || subject?.nombre || subjectId;
  return `
    <div class="grid min-h-12 min-w-0 place-content-center rounded-md border border-black/5 px-1 py-1.5 text-center text-slate-900" style="background:${subject?.color || "#f1f5f9"}" title="${escapeDirectorHtml(`${subject?.nombre || subjectId} · ${period.hora} · ${fullNames}`)}">
      <span class="block truncate text-[8px] font-semibold sm:hidden">${escapeDirectorHtml(mobileName)}</span>
      <span class="hidden truncate text-[10px] font-semibold sm:block lg:text-[11px]">${escapeDirectorHtml(subject?.nombre || subjectId)}</span>
      <span class="mt-0.5 block text-[8px] text-slate-600 sm:text-[9px]">${escapeDirectorHtml(startTime)}</span>
    </div>
  `;
}

function dailySchedule(dayId) {
  const dayName = DAY_NAMES[dayId] || DAY_NAMES.lunes;
  const classesToday = COURSES.reduce((total, course) => (
    total + scheduledCells(course.id).filter((item) => item.day.id === dayId).length
  ), 0);
  const primaryPeriods = periodsForCourse("primero_a").filter((period) => !period.recreo);
  return `
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p class="text-[10px] font-medium uppercase text-school-green">Horario por dia</p>
        <h2 class="mt-0.5 text-xl font-semibold text-slate-950">${dayName}</h2>
      </div>
      <span class="rounded-md bg-green-50 px-2.5 py-1 text-[11px] font-medium text-school-green">${classesToday} clases · ${COURSES.length} cursos</span>
    </div>
    <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
      <table class="w-full table-fixed border-collapse text-left">
        <colgroup>
          <col class="w-12 sm:w-20">
          ${COURSES.map(() => "<col>").join("")}
        </colgroup>
        <thead class="bg-school-green text-white">
          <tr>
            <th class="border-r border-white/15 px-1 py-2.5 text-center text-[8px] font-medium uppercase sm:text-[10px]">Per.</th>
            ${COURSES.map((course) => `
              <th class="border-r border-white/15 px-0.5 py-2.5 text-center text-[8px] font-medium last:border-0 sm:text-[9px] lg:text-[10px]">
                <span class="lg:hidden">${escapeDirectorHtml(course.corto)}</span>
                <span class="hidden lg:block">${escapeDirectorHtml(course.nombre)}</span>
              </th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${primaryPeriods.map((primaryPeriod, index) => `
            <tr class="border-t border-slate-200 odd:bg-slate-50/50">
              <th class="px-1 py-2 text-center text-[9px] font-semibold text-slate-700 sm:text-[11px]">
                <span class="sm:hidden">P${primaryPeriod.label}</span>
                <span class="hidden sm:block">Periodo ${primaryPeriod.label}</span>
              </th>
              ${COURSES.map((course) => {
                const periods = periodsForCourse(course.id).filter((period) => !period.recreo);
                return `<td class="border-l border-slate-200 p-0.5 align-middle sm:p-1">${dailySubjectCell(course.id, periods[index] || null, dayId)}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function desktopSchedule(courseId) {
  const periods = periodsForCourse(courseId);
  const classes = courseSchedule(courseId);
  return `
    <div class="hidden overflow-hidden rounded-lg border border-slate-200 xl:block">
      <table class="w-full table-fixed border-collapse text-left">
        <colgroup>
          <col class="w-12">
          <col class="w-28">
          ${DAYS.map(() => "<col>").join("")}
        </colgroup>
        <thead class="bg-school-green text-white">
          <tr>
            <th class="border-r border-white/15 px-2 py-2.5 text-center text-[10px] font-medium uppercase">Per.</th>
            <th class="border-r border-white/15 px-2 py-2.5 text-[10px] font-medium uppercase">Hora</th>
            ${DAYS.map((day) => `<th class="border-r border-white/15 px-2 py-2.5 text-center text-xs font-medium last:border-0">${day.label}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${periods.map((period) => period.recreo ? `
            <tr class="border-t border-amber-200 bg-amber-50/70">
              <td class="px-2 py-1.5 text-center text-[10px] font-medium text-amber-700">R</td>
              <td class="whitespace-nowrap border-l border-amber-200 px-2 py-1.5 text-[10px] text-amber-700">${period.hora}</td>
              <td colspan="5" class="border-l border-amber-200 px-2 py-1.5 text-center text-[10px] font-medium uppercase text-amber-700">Recreo</td>
            </tr>
          ` : `
            <tr class="border-t border-slate-200 odd:bg-slate-50/40">
              <td class="px-2 py-2 text-center"><span class="mx-auto grid h-7 w-7 place-items-center rounded-md bg-amber-50 text-xs font-semibold text-school-green">${period.label}</span></td>
              <td class="whitespace-nowrap border-l border-slate-200 px-2 py-2 text-[10px] font-medium text-slate-500">${period.hora}</td>
              ${DAYS.map((day) => `<td class="border-l border-slate-200 p-1.5 align-middle">${subjectCell(courseId, classes?.[period.id]?.[day.id] || "")}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function mobileSchedule(courseId) {
  const periods = periodsForCourse(courseId);
  const classes = courseSchedule(courseId);
  const selectedDay = DAYS.find((day) => day.id === selectedDayId) || DAYS[0];
  return `
    <div class="xl:hidden">
      <div class="grid grid-cols-5 gap-1 rounded-lg bg-slate-100 p-1">
        ${DAYS.map((day) => `
          <button type="button" data-director-schedule-day="${day.id}" class="rounded-md px-1 py-2 text-[11px] font-semibold transition ${day.id === selectedDay.id ? "bg-school-green text-white shadow-sm" : "text-slate-500 hover:bg-white"}">${day.label}</button>
        `).join("")}
      </div>
      <div class="mt-2 overflow-hidden rounded-lg border border-slate-200">
        ${periods.map((period) => period.recreo ? `
          <div class="grid grid-cols-[54px_82px_1fr] items-center border-b border-slate-200 bg-slate-50 px-2 py-1.5 last:border-0">
            <span class="text-center text-[10px] font-semibold text-slate-400">R</span>
            <span class="text-[10px] text-slate-500">${period.hora}</span>
            <span class="text-center text-[10px] font-medium uppercase text-slate-400">Recreo</span>
          </div>
        ` : `
          <div class="grid grid-cols-[54px_82px_minmax(0,1fr)] items-center border-b border-slate-200 px-2 py-1.5 last:border-0">
            <span class="grid h-7 w-7 place-items-center justify-self-center rounded-md bg-amber-50 text-xs font-semibold text-school-green">${period.label}</span>
            <span class="text-[10px] leading-tight text-slate-500">${period.hora}</span>
            ${subjectCell(courseId, classes?.[period.id]?.[selectedDay.id] || "")}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function scheduleMeta(courseId) {
  const metrics = courseMetrics(courseId);
  return `
    <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
      <span class="inline-flex items-center gap-1.5">${icon("calendar-check", "h-3.5 w-3.5 text-school-green")} <strong class="font-semibold text-slate-900">${loadedCourseCount()}/${COURSES.length}</strong> horarios</span>
      <span class="inline-flex items-center gap-1.5">${icon("clock-3", "h-3.5 w-3.5 text-school-green")} <strong class="font-semibold text-slate-900">${metrics.classes}</strong> clases</span>
      <span class="inline-flex items-center gap-1.5">${icon("book-open", "h-3.5 w-3.5 text-school-green")} <strong class="font-semibold text-slate-900">${metrics.subjects}</strong> materias</span>
      <span class="inline-flex items-center gap-1.5">${icon("graduation-cap", "h-3.5 w-3.5 text-school-green")} <strong class="font-semibold text-slate-900">${metrics.teachers}</strong> docentes</span>
    </div>
  `;
}

function schedulePanel(courseId) {
  const course = courseById(courseId);
  const metrics = courseMetrics(courseId);
  return `
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p class="text-[10px] font-medium uppercase text-school-green">Horario semanal</p>
        <h2 class="mt-0.5 text-xl font-semibold text-slate-950">${escapeDirectorHtml(course.nombre)}</h2>
      </div>
      <span class="rounded-md px-2.5 py-1 text-[11px] font-medium ${metrics.classes ? "bg-green-50 text-school-green" : "bg-amber-50 text-amber-700"}">${metrics.classes ? `${metrics.classes} clases registradas` : "Horario sin registrar"}</span>
    </div>
    ${scheduleMeta(courseId)}
    <div class="mt-4">
      ${desktopSchedule(courseId)}
      ${mobileSchedule(courseId)}
    </div>
  `;
}

function renderModule() {
  const selector = document.querySelector("[data-director-schedule-courses]");
  const panel = document.querySelector("[data-director-schedule-panel]");
  const cache = document.querySelector("[data-director-schedule-cache]");
  if (selector) selector.innerHTML = navigationControls();
  if (panel) panel.innerHTML = selectedView === "day" ? dailySchedule(selectedDayId) : schedulePanel(selectedCourseId);
  if (cache) cache.textContent = cacheLabel();
  bindCourseButtons();
  bindDayButtons();
  refreshDirectorIcons();
}

function bindCourseButtons() {
  document.querySelectorAll("[data-director-schedule-course]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCourseId = button.dataset.directorScheduleCourse || COURSES[0].id;
      sessionStorage.setItem(COURSE_KEY, selectedCourseId);
      renderModule();
    });
  });
  document.querySelector("[data-director-schedule-course-select]")?.addEventListener("change", (event) => {
    selectedCourseId = event.currentTarget.value || COURSES[0].id;
    sessionStorage.setItem(COURSE_KEY, selectedCourseId);
    renderModule();
  });
  document.querySelectorAll("[data-director-schedule-view]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedView = button.dataset.directorScheduleView === "course" ? "course" : "day";
      sessionStorage.setItem(VIEW_KEY, selectedView);
      renderModule();
    });
  });
}

function bindDayButtons() {
  document.querySelectorAll("[data-director-schedule-day]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDayId = button.dataset.directorScheduleDay || DAYS[0].id;
      sessionStorage.setItem(DAY_KEY, selectedDayId);
      renderModule();
    });
  });
}

function setStatus(message, tone = "text-slate-500") {
  const status = document.querySelector("[data-director-schedule-status]");
  if (!status) return;
  status.className = `min-h-4 text-[11px] ${tone}`;
  status.textContent = message;
}

async function loadRemote() {
  const button = document.querySelector("[data-action='director-refresh-schedules']");
  if (button) {
    button.disabled = true;
    button.innerHTML = `${icon("loader-circle", "h-4 w-4 animate-spin")} Cargando`;
  }
  setStatus("Consultando horarios y asignaciones...");
  try {
    const [schedules, teachers] = await Promise.all([
      listDirectorSchedules(),
      listDirectorTeachers()
    ]);
    moduleData = writeCache(schedules, teachers);
    renderModule();
    setStatus("Datos actualizados correctamente.", "text-school-green");
  } catch {
    const fallback = readCache();
    if (fallback) {
      moduleData = fallback;
      renderModule();
      setStatus("No se pudo actualizar. Se mantiene la copia local.", "text-amber-700");
    } else {
      setStatus("No se pudieron cargar los horarios.", "text-red-600");
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = `${icon("refresh-cw", "h-4 w-4")} Actualizar`;
      refreshDirectorIcons();
    }
  }
}

export function DirectorCoursesSchedules() {
  const content = `
    <section class="rounded-lg border border-slate-200 border-t-[3px] border-t-school-green bg-white p-3 shadow-sm sm:p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-slate-950">Vista del horario</h2>
          <p class="mt-0.5 text-xs text-slate-500">Consulta la semana por curso o compara todos por dia.</p>
          <p class="mt-1 min-h-4 text-[10px] text-slate-400" data-director-schedule-cache>Sin copia local</p>
        </div>
        <button type="button" data-action="director-refresh-schedules" class="inline-flex h-9 items-center gap-2 rounded-md border border-school-green bg-white px-3 text-xs font-semibold text-school-green transition hover:bg-green-50 disabled:cursor-wait disabled:opacity-60">
          ${icon("refresh-cw", "h-4 w-4")} Actualizar
        </button>
      </div>
      <div class="mt-3" data-director-schedule-courses>
        <div class="h-11 animate-pulse rounded-lg bg-slate-100" aria-hidden="true"></div>
      </div>
      <p class="mt-2 min-h-4 text-[10px] text-slate-500" data-director-schedule-status></p>
    </section>
    <section class="mt-3 min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4" data-director-schedule-panel>
      <div class="h-80 animate-pulse rounded-lg bg-slate-100" aria-hidden="true"></div>
    </section>
  `;
  return DirectorShell("/director/cursos-horarios", content, {
    title: "Cursos y Horarios",
    subtitle: "Horario oficial, materias y docentes por curso."
  });
}

export function bindDirectorCoursesSchedules(route) {
  if (route !== "/director/cursos-horarios") return;
  document.querySelector("[data-action='director-refresh-schedules']")?.addEventListener("click", loadRemote);
  const cached = readCache();
  if (cached) {
    moduleData = cached;
    renderModule();
    setStatus("Mostrando la copia guardada en este dispositivo.");
    return;
  }
  renderModule();
  loadRemote();
}
