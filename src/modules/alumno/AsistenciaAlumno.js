import { icon } from "../../ui/dom.js";
import { crearGloboAsistenciaAlumno } from "./GloboAsistenciaAlumno.js";
import { nombreDocenteAsistencia } from "../../services/autoriaAsistencia.js";

const e = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const dateLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("es-BO", { day: "numeric", month: "long" });
const timestamp = (value) => value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : Number(value) || Date.parse(value) || 0);

function statusMeta(status) {
  const states = {
    presente: ["Presente", "P", "bg-green-100 text-green-800 ring-green-200"],
    atraso: ["Atraso", "A", "bg-amber-100 text-amber-800 ring-amber-200"],
    permiso: ["Permiso", "L", "bg-purple-100 text-purple-800 ring-purple-200"],
    licencia: ["Permiso", "L", "bg-purple-100 text-purple-800 ring-purple-200"],
    falta: ["Falta", "F", "bg-red-100 text-red-800 ring-red-200"]
  };
  const [label, short, className] = states[status] || ["Sin registro", "", "bg-white text-slate-400 ring-slate-100"];
  return { label, short, className };
}

export function asistenciaPorFechaAlumno(records = []) {
  const result = new Map();
  for (const record of [...records].sort((a, b) => timestamp(a.updatedAt || a.horaRegistroISO) - timestamp(b.updatedAt || b.horaRegistroISO))) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.fecha || "")) continue;
    const day = result.get(record.fecha) || { record, observations: [] };
    day.record = record;
    if (String(record.observacion || "").trim()) day.observations.push(record);
    result.set(record.fecha, day);
  }
  return result;
}

function calendarCells(key) {
  const [year, month] = key.split("-").map(Number);
  const cells = Array.from({ length: (new Date(year, month - 1, 1).getDay() + 6) % 7 }, () => null);
  for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) cells.push({ day, date: `${key}-${String(day).padStart(2, "0")}` });
  return cells;
}

export function globoObservacionAlumno(data, selectedDate) {
  const observations = asistenciaPorFechaAlumno(data.attendance).get(selectedDate)?.observations || [];
  if (!observations.length) return "";
  return `<section id="student-attendance-note" class="student-attendance-balloon" role="region" aria-label="Observaciones del ${e(dateLabel(selectedDate))}">
    <div class="student-attendance-balloon-content" tabindex="0">${observations.map((record) => {
      const name = nombreDocenteAsistencia(record.registradoPor);
      return `<p class="student-attendance-balloon-entry"><span class="student-attendance-balloon-author">${e(name ? `Prof. ${name}` : "Docente")}:</span> ${e(record.observacion)}</p>`;
    }).join("")}</div>
  </section>`;
}

export function calendarioAsistenciaAlumno(data) {
  const byDate = asistenciaPorFechaAlumno(data.attendance);
  const monthKeys = [...new Set([...byDate.keys()].map((date) => date.slice(0, 7)))].sort();
  const months = monthKeys.map((key) => {
    const title = new Date(`${key}-01T12:00:00`).toLocaleDateString("es-BO", { month: "long" });
    return `<section class="min-w-0 rounded-lg border border-slate-200 bg-white p-3"><h3 class="text-sm font-semibold capitalize text-slate-900">${e(title)}</h3>
      <div class="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500"><span>Lun</span><span>Mar</span><span>Mie</span><span>Jue</span><span>Vie</span><span>Sab</span><span>Dom</span></div>
      <div class="mt-2 grid grid-cols-7 gap-1">${calendarCells(key).map((cell) => {
        if (!cell) return `<div class="h-14"></div>`;
        const day = byDate.get(cell.date), meta = statusMeta(day?.record.estado);
        const hasNote = Boolean(day?.observations.length);
        return `<div class="relative flex h-14 min-w-0 flex-col items-center justify-center rounded-md ring-1 ${meta.className}" title="${e(meta.label)}"><span class="text-xs">${cell.day}</span><span class="text-xs font-semibold">${meta.short}</span>${hasNote ? `<button type="button" data-attendance-note-date="${cell.date}" title="Observacion del docente" aria-label="Ver observacion del ${e(dateLabel(cell.date))}" aria-expanded="false" aria-controls="student-attendance-note" class="absolute inset-0 flex items-start justify-end rounded-md p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-700">${icon("message-circle-more", "h-3.5 w-3.5 shrink-0")}</button>` : ""}</div>`;
      }).join("")}</div></section>`;
  }).join("");
  return `<div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-3 sm:p-4" data-attendance-backdrop><section role="dialog" aria-modal="true" aria-labelledby="student-attendance-title" class="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
    <header class="flex items-start justify-between gap-3 border-b border-slate-100 p-4"><div class="min-w-0"><p class="text-xs font-semibold text-school-green">Asistencia · ${e(data.trimesterLabel)}</p><h2 id="student-attendance-title" class="mt-1 break-words text-base font-semibold text-slate-950">${e(data.student.nombre || data.profile.nombre || "Alumno")}</h2></div><button type="button" data-close-attendance aria-label="Cerrar calendario" class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">${icon("x", "h-5 w-5")}</button></header>
    <div class="overflow-y-auto p-4" data-attendance-scroll><div class="mb-4 flex flex-wrap gap-2 text-xs"><span class="rounded-md bg-green-100 px-2 py-1 text-green-800">P Presente</span><span class="rounded-md bg-amber-100 px-2 py-1 text-amber-800">A Atraso</span><span class="rounded-md bg-purple-100 px-2 py-1 text-purple-800">L Permiso</span><span class="rounded-md bg-red-100 px-2 py-1 text-red-800">F Falta</span></div>
    <div class="grid gap-4 md:grid-cols-2">${months || `<p class="p-4 text-sm text-slate-500">Todavia no hay asistencias registradas en este trimestre.</p>`}</div></div></section><div data-attendance-balloon-host class="pointer-events-none fixed inset-0" aria-live="polite"></div></div>`;
}

export function vincularCalendarioAlumno(getData, { signal, refreshIcons = () => {} } = {}) {
  const target = document.querySelector("[data-student-attendance-modal]");
  let opened = false, opener = null;
  const balloon = crearGloboAsistenciaAlumno({ target, render: (date) => getData() ? globoObservacionAlumno(getData(), date) : "", refreshIcons });
  const draw = () => {
    if (!opened || !target || !getData()) return;
    const selectedDate = balloon.fecha;
    const scrollTop = target.querySelector("[data-attendance-scroll]")?.scrollTop || 0;
    const focusedDate = document.activeElement?.dataset?.attendanceNoteDate;
    balloon.desmontar();
    target.innerHTML = calendarioAsistenciaAlumno(getData()); refreshIcons();
    target.querySelector("[data-attendance-scroll]")?.scrollTo({ top: scrollTop });
    const button = selectedDate && target.querySelector(`[data-attendance-note-date="${selectedDate}"]`);
    if (button) balloon.abrir(button, { animate: false });
    if (focusedDate) target.querySelector(`[data-attendance-note-date="${focusedDate}"]`)?.focus({ preventScroll: true });
  };
  const close = () => { balloon.desmontar(); opened = false; if (target) target.innerHTML = ""; opener?.focus(); };
  document.querySelectorAll("[data-open-attendance-calendar]").forEach((button) => button.addEventListener("click", () => { if (!getData()) return; opener = button; opened = true; draw(); target?.querySelector("[data-close-attendance]")?.focus(); }, { signal }));
  target?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button?.hasAttribute("data-close-attendance") || event.target.hasAttribute("data-attendance-backdrop")) return close();
    if (button?.dataset.attendanceNoteDate) balloon.alternar(button);
    else if (!event.target.closest(".student-attendance-balloon")) balloon.cerrar();
  }, { signal });
  target?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (balloon.fecha) balloon.cerrar(); else close();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...target.querySelectorAll("button:not([disabled]), [tabindex='0']")];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }, { signal });
  target?.addEventListener("scroll", (event) => { if (!event.target.closest(".student-attendance-balloon")) balloon.reubicar(); }, { signal, capture: true });
  target?.ownerDocument.defaultView.addEventListener("resize", () => balloon.reubicar(), { signal });
  signal?.addEventListener("abort", () => balloon.desmontar(), { once: true });
  return { actualizar: draw };
}
