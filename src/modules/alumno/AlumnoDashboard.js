import { createIcons, icons } from "lucide";
import { appShell } from "../../ui/shell.js";
import { icon } from "../../ui/dom.js";
import { getStudentDashboardData, subjectName, STUDENT_TRIMESTERS } from "../../services/studentData.js";
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

function statusMeta(status) {
  const key = String(status || "").toLowerCase();
  const map = {
    presente: { label: "Presente", short: "P", className: "bg-green-100 text-green-800 ring-green-200" },
    atraso: { label: "Atraso", short: "A", className: "bg-amber-100 text-amber-800 ring-amber-200" },
    permiso: { label: "Permiso", short: "L", className: "bg-purple-100 text-purple-800 ring-purple-200" },
    licencia: { label: "Permiso", short: "L", className: "bg-purple-100 text-purple-800 ring-purple-200" },
    falta: { label: "Falta", short: "F", className: "bg-red-100 text-red-800 ring-red-200" }
  };
  return map[key] || { label: "Sin registro", short: "-", className: "bg-slate-50 text-slate-400 ring-slate-100" };
}

function monthLabel(key) {
  const [year, month] = String(key || "").split("-").map(Number);
  if (!year || !month) return "Mes";
  return new Date(year, month - 1, 1).toLocaleDateString("es-BO", { month: "long", year: "numeric" });
}


function calendarDaysInMonth(key) {
  const [year, month] = String(key || "").split("-").map(Number);
  if (!year || !month) return [];
  const first = new Date(year, month - 1, 1);
  const total = new Date(year, month, 0).getDate();
  const mondayIndex = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: mondayIndex }, () => null);
  for (let day = 1; day <= total; day += 1) {
    cells.push({ day, date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` });
  }
  return cells;
}
function attendanceModal(data) {
  const records = [...(data.attendance || [])]
    .filter((item) => item.fecha)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || Number(a.updatedAt || 0) - Number(b.updatedAt || 0));
  const monthKeys = [...new Set(records.map((item) => String(item.fecha).slice(0, 7)))].sort();
  const monthsHtml = monthKeys.length
    ? monthKeys.map((monthKey) => {
        const byDate = new Map(records.filter((item) => String(item.fecha).startsWith(monthKey)).map((item) => [item.fecha, item]));
        return `
          <section class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h3 class="text-sm font-black capitalize text-slate-900">${escapeHtml(monthLabel(monthKey))}</h3>
            <div class="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase text-slate-400">
              <span>Lun</span><span>Mar</span><span>Mie</span><span>Jue</span><span>Vie</span><span>Sab</span><span>Dom</span>
            </div>
            <div class="mt-2 grid grid-cols-7 gap-1">
              ${calendarDaysInMonth(monthKey).map((cell) => {
                if (!cell) return `<div class="min-h-10 rounded-xl bg-transparent"></div>`;
                const record = byDate.get(cell.date);
                const meta = record ? statusMeta(record.estado) : null;
                return `<div class="min-h-10 rounded-xl p-1 text-center ring-1 ${meta ? meta.className : "bg-white text-slate-400 ring-slate-100"}" title="${escapeHtml(meta?.label || "Sin lista tomada")}">
                  <div class="text-[11px] font-black">${cell.day}</div>
                  <div class="mt-0.5 text-xs font-black">${meta?.short || ""}</div>
                </div>`;
              }).join("")}
            </div>
          </section>
        `;
      }).join("")
    : `<div class="rounded-2xl bg-slate-50 p-5 text-center font-bold text-slate-500">Todavia no hay asistencias registradas en este trimestre.</div>`;

  return `
    <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" data-attendance-backdrop>
      <section class="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header class="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <p class="text-xs font-black uppercase tracking-[.18em] text-school-green">Asistencia - ${escapeHtml(data.trimesterLabel)}</p>
            <h2 class="mt-1 text-xl font-black text-slate-950 sm:text-2xl">${escapeHtml(data.student.nombre || data.profile.nombre || "Alumno")}</h2>
            <p class="mt-1 text-sm font-bold text-slate-500">Se muestra el mes completo; solo se colorean los dias con lista tomada.</p>
          </div>
          <button type="button" class="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200" data-close-attendance>${icon("x", "h-5 w-5")}</button>
        </header>
        <div class="max-h-[70vh] overflow-y-auto p-5">
          <div class="mb-4 flex flex-wrap gap-2 text-xs font-black">
            <span class="rounded-full bg-green-100 px-3 py-1 text-green-800">P Presente</span>
            <span class="rounded-full bg-amber-100 px-3 py-1 text-amber-800">A Atraso</span>
            <span class="rounded-full bg-purple-100 px-3 py-1 text-purple-800">L Permiso</span>
            <span class="rounded-full bg-red-100 px-3 py-1 text-red-800">F Falta</span>
          </div>
          <div class="grid gap-4 md:grid-cols-2">${monthsHtml}</div>
        </div>
      </section>
    </div>
  `;
}

function bindAttendanceModal(data) {
  const target = document.querySelector("[data-student-attendance-modal]");
  const close = () => { if (target) target.innerHTML = ""; };
  document.querySelectorAll("[data-open-attendance-calendar]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!target) return;
      target.innerHTML = attendanceModal(data);
      refreshIcons();
      target.querySelectorAll("[data-close-attendance]").forEach((closeButton) => closeButton.addEventListener("click", close));
      target.querySelector("[data-attendance-backdrop]")?.addEventListener("click", (event) => {
        if (event.target?.hasAttribute("data-attendance-backdrop")) close();
      });
    });
  });
}

function shellHeader() {
  return `
    <section class="rounded-xl border border-green-100 bg-white px-3.5 py-3 shadow-sm sm:px-4 sm:py-3.5">
      <div class="flex min-w-0 items-center gap-3">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-green-50 text-school-green">${icon("user-round", "h-5 w-5")}</span>
        <div class="min-w-0 flex-1">
          <p class="text-[9px] font-semibold uppercase text-school-green" data-student-trimester>Alumno</p>
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
    <section class="student-attendance-alert relative mt-3 hidden overflow-hidden rounded-xl px-3 py-3 sm:px-4 sm:py-3.5" data-student-attendance-warning role="alert" aria-live="assertive"></section>
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

function gradeTone(value) {
  const number = Number(value || 0);
  return number <= 50 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800";
}

function bulletinView() {
  return `
    ${shellHeader()}
    <section class="mt-4 rounded-3xl border border-slate-200 bg-white shadow-soft">
      <div class="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[.18em] text-school-green">Boleta</p>
          <h2 class="text-xl font-black text-slate-950">Resumen trimestral</h2>
        </div>
        <div class="flex flex-wrap gap-2 text-xs font-black" data-bulletin-trimesters>
          ${STUDENT_TRIMESTERS.map((item) => `<span data-bulletin-trimester="${item.id}" class="rounded-full border px-3 py-1.5">${item.label}</span>`).join("")}
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-[680px] w-full text-left text-xs sm:text-sm">
          <thead class="bg-school-green text-white">
            <tr>
              <th class="px-3 py-2 font-black">Materia</th>
              <th class="px-3 py-2 text-center font-black">SER /10</th>
              <th class="px-3 py-2 text-center font-black">SABER /45</th>
              <th class="px-3 py-2 text-center font-black">HACER /40</th>
              <th class="px-3 py-2 text-center font-black">Auto /5</th>
              <th class="px-3 py-2 text-center font-black">Nota final</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100" data-student-bulletin>
            <tr><td colspan="6" class="px-4 py-4 font-bold text-slate-500">Cargando boleta...</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <div data-student-attendance-modal></div>
  `;
}

export function AlumnoDashboard(route = "/alumno") {
  const content = route === "/alumno/boleta" ? bulletinView() : panelView();
  return appShell("alumno", route, content);
}

function fillCommon(data) {
  const name = document.querySelector("[data-student-name]");
  const course = document.querySelector("[data-student-course]");
  const trimester = document.querySelector("[data-student-trimester]");
  if (name) name.textContent = data.student.nombre || data.profile.nombre || "Alumno";
  if (course) course.textContent = `${data.course?.nombre || "Curso sin asignar"} - Usuario: ${data.profile.usuario || data.student.ci || "-"}`;
  if (trimester) trimester.textContent = data.trimesterLabel || "Alumno";
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
      <span class="student-attendance-alert-line absolute inset-x-0 top-0 h-1 bg-red-600"></span>
      <div class="flex items-start gap-3 pt-1 sm:items-center">
        <span class="student-attendance-alert-signal grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-600 text-white shadow-md shadow-red-200 sm:h-11 sm:w-11">${icon("triangle-alert", "h-5 w-5")}</span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-[11px] font-bold uppercase text-red-800 sm:text-xs">Aviso importante de Direccion</p>
            <span class="rounded-md border border-red-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-red-700">${Number(data.attendanceWarning.faltas || 0)} faltas</span>
          </div>
          <p class="mt-1 break-words text-xs font-medium leading-5 text-slate-800 [overflow-wrap:anywhere] sm:text-sm">${escapeHtml(data.attendanceWarning.mensaje)}</p>
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

function fillBulletin(data) {
  const body = document.querySelector("[data-student-bulletin]");
  const tabs = document.querySelectorAll("[data-bulletin-trimester]");
  tabs.forEach((tab) => {
    const active = tab.dataset.bulletinTrimester === data.trimesterId;
    tab.className = `rounded-full border px-3 py-1.5 ${active ? "border-school-green bg-green-50 text-school-green" : "border-slate-200 bg-white text-slate-500"}`;
  });
  if (!body) return;
  const rows = data.bulletin.filter((item) => item.hasData);
  body.innerHTML = rows.length
    ? rows.map((item) => `
      <tr class="hover:bg-slate-50">
        <td class="px-3 py-2 font-semibold text-slate-900">
          <span class="inline-block h-2.5 w-2.5 rounded-full align-middle" style="background:${item.color}"></span>
          <span class="ml-2">${escapeHtml(item.subjectName)}</span>
        </td>
        <td class="px-3 py-2 text-center"><span class="rounded-lg px-2 py-1 ${gradeTone(item.ser10)}">${item.ser10}</span></td>
        <td class="px-3 py-2 text-center"><span class="rounded-lg px-2 py-1 ${gradeTone(item.saber45)}">${item.saber45}</span></td>
        <td class="px-3 py-2 text-center"><span class="rounded-lg px-2 py-1 ${gradeTone(item.hacer40)}">${item.hacer40}</span></td>
        <td class="px-3 py-2 text-center"><span class="rounded-lg px-2 py-1 ${gradeTone(item.auto5)}">${item.auto5}</span></td>
        <td class="px-3 py-2 text-center"><span class="rounded-xl px-3 py-1 text-sm font-black ${gradeTone(item.final)}">${item.final}</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="px-4 py-5 text-center font-bold text-slate-500">Todavia no hay notas calificadas en este trimestre.</td></tr>`;
}

export async function bindAlumnoPage(route) {
  if (!route.startsWith("/alumno")) return;

  try {
    const data = await getStudentDashboardData();
    fillCommon(data);
    if (route === "/alumno/boleta") fillBulletin(data);
    else fillPanel(data);
    bindAttendanceModal(data);
    refreshIcons();
  } catch (error) {
    const course = document.querySelector("[data-student-course]");
    if (course) course.textContent = `No se pudo cargar el alumno: ${error.message}`;
  }
}


