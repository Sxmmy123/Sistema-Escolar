import { createIcons, icons } from "lucide";
import { appShell } from "../../ui/shell.js";
import { icon } from "../../ui/dom.js";
import { observarPanelAlumno, subjectName, STUDENT_TRIMESTERS } from "../../services/studentData.js";
import { vincularCalendarioAlumno } from "./AsistenciaAlumno.js";
import { BoletaAlumno } from "./BoletaAlumno.js";
import { materialItemsForActivity, printStudentMaterials } from "./MaterialesAlumno.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function refreshIcons() {
  createIcons({ icons });
}

function dateOnly(date) {
  return new Date(`${date}T12:00:00`);
}

function daysDiff(date) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = dateOnly(date);
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((targetStart - start) / 86400000);
}

function weekDayName(date) {
  return dateOnly(date).toLocaleDateString("es-BO", { weekday: "long" });
}

function dueText(date) {
  const diff = daysDiff(date);
  if (!date) return "Sin fecha";
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === 2) return "En 2 dias";
  if (diff > 2 && diff <= 6) return `Este ${weekDayName(date)}`;
  if (diff >= 7 && diff <= 13) return `Proximo ${weekDayName(date)}`;
  if (diff > 13) return `En ${diff} dias`;
  if (diff === -1) return "Ayer";
  return `Hace ${Math.abs(diff)} dias`;
}

function shortDate(date) {
  if (!date) return "-";
  return dateOnly(date).toLocaleDateString("es-BO", { day: "2-digit", month: "short" });
}

function activityRow(activity, tone = "green") {
  const isMissing = tone === "red";
  const color = isMissing
    ? "border-red-100 bg-red-50/70 text-red-700"
    : "border-green-100 bg-green-50/70 text-green-800";
  const due = isMissing ? shortDate(activity.fecha) : dueText(activity.fecha);
  return `
    <article class="rounded-xl border ${color} px-3 py-2">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-slate-900">${escapeHtml(activity.titulo || "Actividad")}</p>
          <p class="truncate text-[11px] font-semibold text-slate-500">${escapeHtml(subjectName(activity.materiaId))} - ${["examen", "saber"].includes(String(activity.tipo || "").toLowerCase()) ? "Saber" : "Hacer"}</p>
        </div>
        <span class="shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-black">${escapeHtml(due)}</span>
      </div>
    </article>
  `;
}

function materialRow(activity) {
  const scored = activity.calificable === true || activity.calificable === 1 || activity.calificable === "true";
  const items = materialItemsForActivity(activity);
  return `
    <article class="min-w-0 overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
      <div class="flex items-center gap-2.5 border-b border-amber-100 px-3 py-2.5">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-800">${icon("package-open", "h-4 w-4")}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-slate-950">${escapeHtml(subjectName(activity.materiaId))}</p>
          <p class="mt-0.5 text-[10px] font-medium text-slate-500">${escapeHtml(dueText(activity.fecha))}${scored ? ` · Responsabilidad /${Number(activity.maximo || 100)}` : ""}</p>
        </div>
        <button type="button" data-print-student-material="${escapeHtml(activity.id)}" title="Imprimir lista" aria-label="Imprimir lista de materiales" class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100">
          ${icon("printer", "h-4 w-4")}<span class="hidden sm:inline">Imprimir</span>
        </button>
      </div>
      <div class="grid grid-cols-[72px_minmax(0,1fr)] text-xs">
        <span class="border-r border-amber-100 bg-amber-50 px-2 py-1.5 text-center text-[9px] font-semibold uppercase text-amber-800">Cantidad</span>
        <span class="bg-amber-50 px-3 py-1.5 text-[9px] font-semibold uppercase text-amber-800">Material</span>
        ${items.map((item) => `
          <span class="border-r border-t border-amber-100 px-2 py-2 text-center font-semibold text-slate-700">${escapeHtml(item.cantidad)}</span>
          <span class="border-t border-amber-100 px-3 py-2 font-medium text-slate-900">${escapeHtml(item.material)}</span>
        `).join("")}
      </div>
    </article>
  `;
}


function shellHeader() {
  return `
    <section class="rounded-xl border border-green-100 bg-white px-3.5 py-3 shadow-sm sm:px-4 sm:py-3.5">
      <div class="flex min-w-0 items-center gap-3">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-green-50 text-school-green">${icon("user-round", "h-5 w-5")}</span>
        <div class="min-w-0 flex-1">
          <p class="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-school-green" data-student-trimester>Trimestre</p>
          <h1 class="mt-0.5 break-words text-base font-semibold leading-5 text-slate-950 sm:text-lg sm:leading-6" data-student-name>Seguimiento escolar</h1>
          <p class="mt-0.5 truncate text-[11px] font-medium text-slate-500 sm:text-xs" data-student-course>Cargando datos del alumno...</p>
        </div>
      </div>
    </section>
  `;
}

function panelView() {
  return `
    ${shellHeader()}
    <section class="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3" aria-label="Trimestre del alumno">
      <h2 class="text-sm font-semibold text-slate-800">Trimestre</h2>
      <div class="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Seleccionar trimestre">
        ${STUDENT_TRIMESTERS.map((item) => `<button type="button" data-student-select-term="${item.id}" aria-pressed="false" disabled class="rounded-md px-3 py-2 text-xs text-slate-600">${item.label}</button>`).join("")}
      </div>
      <p class="w-full text-sm text-red-700" data-student-term-error role="status" hidden></p>
    </section>
    <section class="student-attendance-alert relative mt-4 hidden overflow-hidden rounded-2xl px-4 py-4 sm:px-5 sm:py-5" data-student-attendance-warning role="alert" aria-live="assertive"></section>
    <section class="mt-4 overflow-hidden rounded-2xl border border-school-gold/60 bg-amber-50/60 shadow-soft">
      <div class="flex items-center justify-between gap-3 border-b border-amber-200/80 px-3.5 py-3 sm:px-4">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-school-gold text-school-bark">${icon("backpack", "h-5 w-5")}</span>
          <div class="min-w-0">
            <p class="text-[9px] font-semibold uppercase tracking-[.14em] text-amber-800">Prioridad</p>
            <h2 class="truncate text-base font-semibold text-slate-950 sm:text-lg">Materiales por traer</h2>
          </div>
        </div>
        <span class="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-200" data-student-material-count>...</span>
      </div>
      <div class="grid gap-2 p-3 sm:grid-cols-2 sm:p-4" data-student-materials><p class="text-sm font-medium text-slate-500">Cargando...</p></div>
    </section>

    <section class="mt-3 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-3 sm:px-4">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-green-50 text-school-green">${icon("clipboard-check", "h-4 w-4")}</span>
          <div class="min-w-0">
            <p class="text-[9px] font-medium uppercase tracking-[.12em] text-school-green">Despues</p>
            <h2 class="truncate text-sm font-semibold text-slate-950 sm:text-base">Actividades Hacer y Saber</h2>
          </div>
        </div>
        <span class="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-school-green" data-student-programmed-count>...</span>
      </div>
      <div class="grid gap-2 p-3 sm:grid-cols-2 sm:p-4" data-student-programmed><p class="text-sm font-medium text-slate-500">Cargando...</p></div>
    </section>

    <section class="mt-3 grid gap-2 sm:grid-cols-2">
      <button type="button" data-open-attendance-calendar class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-slate-600 transition hover:border-school-green/40 hover:bg-green-50/40">
        <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-school-green">${icon("calendar-check-2", "h-4 w-4")}</span>
        <span class="min-w-0 flex-1"><span class="block text-[10px] font-medium uppercase text-slate-400">Asistencia</span><span class="block text-sm font-semibold text-slate-800">Ver calendario registrado</span></span>
        <span class="text-sm font-semibold text-school-green" data-student-attendance-percent>...</span>
      </button>
      <details class="group rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-600">
        <summary class="flex cursor-pointer list-none items-center gap-3">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">${icon("clipboard-x", "h-4 w-4")}</span>
          <span class="min-w-0 flex-1"><span class="block text-[10px] font-medium uppercase text-slate-400">Seguimiento</span><span class="block text-sm font-semibold text-slate-800">Actividades no presentadas</span></span>
          <span class="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600" data-student-missing-count>...</span>
          ${icon("chevron-down", "h-4 w-4 transition group-open:rotate-180")}
        </summary>
        <div class="mt-3 space-y-2 border-t border-slate-100 pt-3" data-student-missing><p class="text-sm font-medium text-slate-500">Cargando...</p></div>
      </details>
    </section>
    <div data-student-attendance-modal></div>
  `;
}

function bulletinView() {
  return `${shellHeader()}<div class="mt-4" data-student-bulletin><p class="py-4 text-sm text-slate-500" role="status">Cargando boleta...</p></div>`;
}

export function AlumnoDashboard(route = "/alumno") {
  const content = route === "/alumno/boleta" ? bulletinView() : panelView();
  return appShell("alumno", route, content);
}

function fillCommon(data, route = "/alumno") {
  const name = document.querySelector("[data-student-name]");
  const course = document.querySelector("[data-student-course]");
  const trimester = document.querySelector("[data-student-trimester]");
  if (name) name.textContent = data.student.nombre || data.profile.nombre || "Alumno";
  if (course) course.textContent = `${data.course?.nombre || "Curso sin asignar"} - Usuario: ${data.profile.usuario || data.student.ci || "-"}`;
  if (trimester) trimester.textContent = route === "/alumno/boleta" ? `Gestion ${data.gestionId}` : data.trimesterLabel || "Alumno";
}

function fillPanel(data) {
  const attendanceWarning = document.querySelector("[data-student-attendance-warning]");
  const materials = document.querySelector("[data-student-materials]");
  const programmed = document.querySelector("[data-student-programmed]");
  const missing = document.querySelector("[data-student-missing]");
  const materialCount = document.querySelector("[data-student-material-count]");
  const programmedCount = document.querySelector("[data-student-programmed-count]");
  const missingCount = document.querySelector("[data-student-missing-count]");
  const attendancePercent = document.querySelector("[data-student-attendance-percent]");
  if (attendanceWarning && data.attendanceWarning) {
    attendanceWarning.classList.remove("hidden");
    attendanceWarning.innerHTML = `
      <span class="student-attendance-alert-line absolute inset-x-0 top-0 h-1.5 bg-red-600"></span>
      <div class="flex items-start gap-3.5 pt-1 sm:gap-4">
        <span class="student-attendance-alert-signal grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-red-600 text-white shadow-lg shadow-red-200 sm:h-14 sm:w-14">${icon("triangle-alert", "h-6 w-6 sm:h-7 sm:w-7")}</span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2.5">
            <p class="text-sm font-bold uppercase leading-5 text-red-900 sm:text-base">Aviso importante de Direccion</p>
            <span class="rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-bold uppercase text-white sm:text-[11px]">Alerta activa</span>
          </div>
          <p class="mt-2 break-words text-sm font-semibold leading-6 text-slate-900 [overflow-wrap:anywhere] sm:text-base sm:leading-7">${escapeHtml(data.attendanceWarning.mensaje)}</p>
          <p class="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-red-800 sm:text-sm">${icon("calendar-x", "h-4 w-4")} ${Number(data.attendanceWarning.faltas || 0)} faltas registradas</p>
        </div>
      </div>
    `;
  } else if (attendanceWarning) {
    attendanceWarning.classList.add("hidden");
    attendanceWarning.innerHTML = "";
  }
  if (materialCount) materialCount.textContent = String(data.materials.length);
  if (programmedCount) programmedCount.textContent = String(data.programmed.length);
  if (missingCount) missingCount.textContent = String(data.missing.length);
  if (attendancePercent) attendancePercent.textContent = `${data.attendancePercent}%`;
  if (materials) {
    materials.innerHTML = data.materials.length
      ? data.materials.map(materialRow).join("")
      : `<p class="col-span-full rounded-xl border border-dashed border-amber-200 bg-white/70 px-3 py-3 text-center text-xs font-medium text-amber-900">No hay materiales pendientes por traer.</p>`;
    materials.querySelectorAll("[data-print-student-material]").forEach((button) => {
      button.addEventListener("click", () => {
        const activity = data.materials.find((item) => item.id === button.dataset.printStudentMaterial);
        if (!activity) return;
        printStudentMaterials({
          activity,
          student: data.student,
          course: data.course,
          subject: subjectName(activity.materiaId),
          trimesterLabel: data.trimesterLabel
        });
      });
    });
  }
  if (programmed) {
    programmed.innerHTML = data.programmed.length
      ? data.programmed.map((activity) => activityRow(activity, "green")).join("")
      : `<p class="col-span-full rounded-xl bg-slate-50 px-3 py-3 text-center text-xs font-medium text-slate-500">No hay actividades programadas para este trimestre.</p>`;
  }
  if (missing) {
    missing.innerHTML = data.missing.length
      ? data.missing.map((activity) => activityRow(activity, "red")).join("")
      : `<p class="rounded-xl bg-green-50 px-3 py-2 text-xs font-medium text-green-700">No hay actividades no presentadas.</p>`;
  }
}

function fillBulletin(data, view, selection = "") {
  const target = document.querySelector("[data-student-bulletin]");
  if (target) target.innerHTML = BoletaAlumno(data, view, selection);
}

let disposePage = null;

export function desmontarAlumno() { disposePage?.(); disposePage = null; }

export async function bindAlumnoPage(route, { observe = observarPanelAlumno } = {}) {
  desmontarAlumno();
  if (!route.startsWith("/alumno")) return;
  const controller = new AbortController(), { signal } = controller;
  let watcher = null, latestData = null, saving = false, bulletinSelection = "", bulletinViewId = null;
  disposePage = () => { controller.abort(); watcher?.stop(); };
  const calendar = vincularCalendarioAlumno(() => latestData, { signal, refreshIcons });
  if (route === "/alumno/boleta") document.querySelector("[data-student-bulletin]")?.addEventListener("click", (event) => {
    if (!latestData) return;
    const view = event.target.closest("[data-student-bulletin-view]")?.dataset.studentBulletinView;
    if (view) {
      if (!["t1", "t2", "t3", "total"].includes(view) || bulletinViewId === view) return;
      bulletinViewId = view; bulletinSelection = "";
      fillBulletin(latestData, bulletinViewId); refreshIcons();
      document.querySelector(`[data-student-bulletin-view="${view}"]`)?.focus({ preventScroll: true });
      return;
    }
    const key = event.target.closest("[data-student-grade-detail]")?.dataset.studentGradeDetail;
    if (!key || bulletinViewId !== "total") return;
    const [subjectId, termId] = key.split(":");
    if (!latestData.annualBulletin?.rows.find((row) => row.subjectId === subjectId)?.terms[termId]) return;
    bulletinSelection = bulletinSelection === key ? "" : key;
    fillBulletin(latestData, bulletinViewId, bulletinSelection); refreshIcons();
    document.querySelector(`[data-student-grade-detail="${key}"]`)?.focus({ preventScroll: true });
  }, { signal });
  const syncSelection = () => document.querySelectorAll("[data-student-select-term]").forEach((button) => {
    const active = button.dataset.studentSelectTerm === latestData?.trimesterId;
    button.disabled = saving || !latestData;
    button.setAttribute("aria-pressed", String(active));
    button.className = `rounded-md px-3 py-2 text-xs transition ${active ? "bg-school-green font-semibold text-white shadow-sm" : "text-slate-600 hover:bg-white"}`;
  });
  document.querySelectorAll("[data-student-select-term]").forEach((button) => button.addEventListener("click", async () => {
    if (!watcher || saving || !latestData || button.dataset.studentSelectTerm === latestData.trimesterId) return;
    const error = document.querySelector("[data-student-term-error]");
    if (error) { error.hidden = true; error.textContent = ""; }
    saving = true; syncSelection();
    try { await watcher.seleccionarTrimestre(button.dataset.studentSelectTerm); }
    catch (failure) { if (!signal.aborted && error) { error.textContent = `No se cambio el trimestre: ${failure.message}`; error.hidden = false; } }
    finally { saving = false; if (!signal.aborted) syncSelection(); }
  }, { signal }));
  const fail = (error) => {
    if (signal.aborted) return;
    const course = document.querySelector("[data-student-course]");
    if (course) course.textContent = `No se pudo cargar el alumno: ${error.message}`;
  };
  try {
    watcher = await observe((data) => {
      if (signal.aborted) return;
      latestData = data;
      fillCommon(data, route); syncSelection();
      if (route === "/alumno/boleta") {
        bulletinViewId ??= ["t1", "t2", "t3"].includes(data.trimesterId) ? data.trimesterId : "t1";
        fillBulletin(data, bulletinViewId, bulletinSelection);
      }
      else fillPanel(data);
      calendar.actualizar(); refreshIcons();
    }, fail);
    if (signal.aborted) watcher.stop();
  } catch (error) { fail(error); }
}


