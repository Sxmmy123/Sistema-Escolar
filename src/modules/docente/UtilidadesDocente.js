import { createIcons, icons } from "lucide";
import { DAYS, findSubject } from "../../data/catalog.js";
import { icon } from "../../ui/dom.js";
import { todayIso } from "../../services/teacherData.js";
import { teacherState } from "./EstadoDocente.js";

export function refreshIcons() {
  createIcons({ icons });
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function setText(selector, value) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value;
  });
}

export function setHtml(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.innerHTML = value;
}

export function emptyState(message, detail = "") {
  return `
    <div class="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-soft">
      <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-school-sky text-school-navy">${icon("info", "h-7 w-7")}</div>
      <h3 class="mt-4 text-xl font-black text-slate-900">${escapeHtml(message)}</h3>
      ${detail ? `<p class="mx-auto mt-2 max-w-2xl font-semibold leading-7 text-slate-500">${escapeHtml(detail)}</p>` : ""}
    </div>
  `;
}

export function courseSubjectsBadges(course) {
  if (!course?.materias?.length) return `<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">Sin materias</span>`;
  return course.materias.map((subjectId) => {
    const subject = findSubject(subjectId);
    return `<span class="rounded-full px-2 py-0.5 text-[11px] font-black text-slate-700" style="background:${subject?.color || "#e2e8f0"}">${escapeHtml(subject?.corto || subjectId)}</span>`;
  }).join(" ");
}

export function scheduleList(rows, emptyMessage) {
  if (!rows.length) return `<p class="rounded-xl bg-school-sky px-3 py-2 text-xs font-bold text-school-navy">${escapeHtml(emptyMessage)}</p>`;
  const showCourseColors = (teacherState.context?.courses?.length || 0) >= 2;
  return rows.map((row) => `
    ${(() => {
      const rowCourse = teacherState.context?.courses?.find((course) => course.id === row.cursoId) || {};
      const accent = courseAccent(row.cursoId);
      const courseNumber = String(rowCourse.corto || rowCourse.nombre || "").replace(/\D/g, "") || "I";
      const subjectIcon = subjectIconName(row.materiaId, row.materia);
      return `
        <article class="min-w-0 overflow-hidden rounded-xl border border-amber-900/10 shadow-sm" style="background:${row.color || "#fff"}">
          <div class="flex items-stretch">
            <div class="min-w-0 flex-1 px-2 py-1.5">
              <p class="truncate text-[9px] font-black uppercase tracking-[.08em] text-slate-600">Per. ${escapeHtml(row.periodo)} · ${escapeHtml(row.hora)}</p>
              <h3 class="flex min-w-0 items-center gap-1.5 text-xs font-black text-school-bark">
                <span class="shrink-0 text-school-green">${icon(subjectIcon, "h-3.5 w-3.5")}</span>
                <span class="truncate">${escapeHtml(row.materia)}</span>
              </h3>
            </div>
            ${showCourseColors ? `<span class="grid min-w-8 place-items-center px-1 text-xs font-black text-white" style="background:${accent}">${escapeHtml(courseNumber)}</span>` : ""}
          </div>
        </article>
      `;
    })()}
  `).join("");
}

export function monthLabel(monthValue) {
  const date = new Date(`${monthValue}-01T12:00:00`);
  return date.toLocaleDateString("es-BO", { month: "long", year: "numeric" });
}

export function shiftMonth(monthValue, delta) {
  const date = new Date(`${monthValue}-01T12:00:00`);
  date.setMonth(date.getMonth() + delta);
  return date.toISOString().slice(0, 7);
}

export function workingDaysCalendar(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const last = new Date(year, month, 0);
  const weeks = [];
  let currentWeek = Array(5).fill(null);

  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(year, month - 1, day);
    const weekDay = date.getDay();
    if (weekDay === 0 || weekDay === 6) continue;
    const mondayIndex = weekDay - 1;
    if (mondayIndex === 0 && currentWeek.some(Boolean)) {
      weeks.push(currentWeek);
      currentWeek = Array(5).fill(null);
    }
    currentWeek[mondayIndex] = date.toISOString().slice(0, 10);
  }

  if (currentWeek.some(Boolean)) weeks.push(currentWeek);
  return weeks;
}

export function nextScheduleDates(enabledDayIds = new Set()) {
  const today = new Date(`${todayIso()}T12:00:00`);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const dates = [];

  for (let week = 0; week < 4; week += 1) {
    DAYS.forEach((day, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + (week * 7) + index);
      const iso = date.toISOString().slice(0, 10);
      dates.push({
        iso,
        dayId: day.id,
        dayLabel: day.label,
        label: iso === todayIso() ? "Hoy" : String(date.getDate()),
        enabled: enabledDayIds.has(day.id)
      });
    });
  }

  return dates;
}

export function dayIdFromIso(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  return DAYS[date.getDay() - 1]?.id || "";
}

export function longDateLabel(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
}

export function shortDateLabel(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("es-BO", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

export function activityTone(activity) {
  return activity.tipo === "examen"
    ? "border-blue-200 bg-blue-50 text-blue-800"
    : "border-green-200 bg-green-50 text-green-800";
}

const courseAccentColors = ["#2563eb", "#16a34a", "#9333ea", "#db2777", "#ea580c", "#0f766e", "#dc2626", "#475569"];

export function courseAccent(courseId = "") {
  const ids = teacherState.context?.courses?.map((course) => course.id) || [];
  const index = Math.max(ids.indexOf(courseId), 0);
  return courseAccentColors[index % courseAccentColors.length];
}

export function compactSubjectName(subjectId, fallback = "") {
  const subject = findSubject(subjectId);
  return subject?.corto || String(subject?.nombre || fallback || subjectId).split(/\s+/).map((part) => part.slice(0, 4)).join(" ");
}

export function subjectIconName(subjectId = "", fallback = "") {
  const text = `${subjectId} ${fallback}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (text.includes("fisica") || text.includes("ed_fis")) return "volleyball";
  if (text.includes("musica")) return "music";
  if (text.includes("matemat")) return "calculator";
  if (text.includes("leng")) return "book-open";
  if (text.includes("natur")) return "leaf";
  if (text.includes("social")) return "landmark";
  if (text.includes("relig")) return "cross";
  if (text.includes("arte") || text.includes("plast")) return "palette";
  if (text.includes("tecnica") || text.includes("tecnolog")) return "cpu";
  return "book-open";
}

