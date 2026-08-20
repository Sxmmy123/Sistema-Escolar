import { appShell } from "../../ui/shell.js";
import { icon } from "../../ui/dom.js";

function metricCard(label, valueAttr, iconName, accentClass, linkText, href) {
  return `
    <article class="rounded-xl border border-amber-900/10 bg-white px-3 py-2 shadow-soft">
      <div class="flex items-center gap-3">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accentClass}">${icon(iconName, "h-5 w-5")}</span>
        <div class="min-w-0">
          <p class="text-2xl font-black leading-none text-school-bark" ${valueAttr}>...</p>
          <p class="mt-0.5 truncate text-[11px] font-bold text-slate-500">${label}</p>
          <a href="${href}" class="mt-0.5 inline-flex items-center gap-1 text-[10px] font-black text-school-green">${linkText} ${icon("arrow-right", "h-3 w-3")}</a>
        </div>
      </div>
    </article>
  `;
}

function summaryCard(label, valueAttr, toneClass, iconName = "") {
  return `
    <article class="rounded-xl ${toneClass} px-3 py-2">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate text-[10px] font-black">${label}</p>
          <p class="mt-1 text-xl font-black leading-none text-school-bark" ${valueAttr}>...</p>
        </div>
        ${iconName ? `<span class="shrink-0 opacity-80">${icon(iconName, "h-4 w-4")}</span>` : ""}
      </div>
    </article>
  `;
}

export function DocenteDashboard() {
  const today = new Date().toLocaleDateString("es-BO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  return appShell("docente", "/docente", `
    <div class="mx-auto grid w-full max-w-[1120px] gap-3 lg:h-full lg:grid-rows-[38px_64px_88px_74px_minmax(0,1fr)_92px] lg:overflow-hidden">
      <section class="hidden justify-end sm:flex">
        <div class="w-full max-w-[245px] rounded-xl border border-amber-900/10 bg-white px-4 py-2 text-[11px] font-black capitalize text-school-bark shadow-soft">
          <div class="flex h-full items-center justify-between gap-3">
            <span>${today}</span>
            ${icon("calendar-days", "h-4 w-4 text-school-green")}
          </div>
        </div>
      </section>

      <section class="rounded-xl border border-school-green/20 bg-white px-3 py-2 shadow-soft">
        <div class="flex h-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <p class="text-[9px] font-black uppercase tracking-[.18em] text-school-green">Trimestre activo</p>
            <p class="truncate text-sm font-black text-school-bark" data-teacher-active-trimester>1er trimestre</p>
          </div>
          <div class="flex shrink-0 gap-1.5 overflow-x-auto pb-1 sm:pb-0" data-teacher-dashboard-trimesters>
            <span class="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500">Cargando...</span>
          </div>
        </div>
      </section>

      <section class="relative overflow-hidden rounded-xl border border-amber-900/10 bg-white px-4 py-3 shadow-soft">
        <div class="absolute inset-y-0 right-0 hidden w-80 bg-gradient-to-l from-school-sky via-school-sky/80 to-transparent lg:block"></div>
        <img src="/images/logo-nueva-bolivia.png" alt="" class="absolute right-20 top-1/2 hidden h-20 -translate-y-1/2 object-contain opacity-20 lg:block">
        <div class="relative flex h-full items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="hidden text-[9px] font-black uppercase tracking-[.18em] text-school-green sm:block">Unidad Educativa Ecologica Nueva Bolivia</p>
            <h1 class="text-xl font-black leading-tight text-school-bark" data-teacher-welcome>Cargando datos del docente...</h1>
            <p class="mt-1 text-[12px] font-semibold text-slate-500">Aqui veras solo tus cursos y materias asignadas.</p>
          </div>
          <div class="hidden shrink-0 rounded-xl border border-school-green/20 bg-green-50 px-3 py-2 text-[11px] font-black text-school-green sm:inline-flex" data-teacher-status>
            Conectando con Firebase
          </div>
        </div>
      </section>

      <section class="grid grid-cols-2 gap-3 xl:grid-cols-4">
        ${metricCard("Cursos asignados", 'data-teacher-count="courses"', "graduation-cap", "bg-school-sky text-school-bark", "Ver cursos", "#/docente")}
        ${metricCard("Alumnos visibles", 'data-teacher-count="students"', "users", "bg-green-100 text-school-green", "Ver alumnos", "#/docente/asistencia")}
        ${metricCard("Materias asignadas", 'data-teacher-count="subjects"', "book-open", "bg-school-sky text-school-green", "Ver materias", "#/docente/horario")}
        ${metricCard("Tareas pendientes", 'data-teacher-count="tasks"', "calendar-check", "bg-yellow-100 text-school-bark", "Ver agenda", "#/docente/tareas")}
      </section>

      <section class="grid min-h-0 grid-cols-2 gap-3 xl:grid-cols-[1fr_1fr_310px]">
        <div class="flex min-h-0 flex-col rounded-xl border border-amber-900/10 bg-white p-3 shadow-soft">
          <div class="flex items-center gap-2">
            ${icon("calendar-check", "h-4 w-4 text-school-green")}
            <h2 class="text-sm font-black text-school-bark">Hoy</h2>
          </div>
          <div class="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" data-teacher-today>Cargando horario...</div>
          <a href="#/docente/horario" class="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-school-sky px-3 py-1.5 text-[10px] font-black text-school-bark">Ver horario completo ${icon("arrow-right", "h-3 w-3")}</a>
        </div>

        <div class="flex min-h-0 flex-col rounded-xl border border-amber-900/10 bg-white p-3 shadow-soft">
          <div class="flex items-center gap-2">
            ${icon("calendar-clock", "h-4 w-4 text-school-green")}
            <h2 class="text-sm font-black text-school-bark" data-teacher-next-title>Mañana</h2>
          </div>
          <div class="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" data-teacher-tomorrow>Cargando horario...</div>
          <a href="#/docente/tareas" class="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-school-sky px-3 py-1.5 text-[10px] font-black text-school-bark">Ver agenda completa ${icon("arrow-right", "h-3 w-3")}</a>
        </div>

        <aside class="col-span-2 self-start rounded-xl border border-amber-900/10 bg-white p-4 shadow-soft xl:col-span-1">
          <div class="flex items-center gap-2">
            ${icon("layers", "h-4 w-4 text-school-green")}
            <h2 class="text-sm font-black text-school-bark">Curso y materias</h2>
          </div>
          <div class="mt-4 grid content-start gap-4" data-teacher-courses></div>
        </aside>
      </section>

      <section class="rounded-xl border border-amber-900/10 bg-white p-3 shadow-soft">
        <div class="mb-2 flex items-center gap-2">
          ${icon("chart-no-axes-combined", "h-4 w-4 text-school-green")}
          <h2 class="text-sm font-black text-school-bark">Resumen general</h2>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          ${summaryCard("Cursos activos", 'data-teacher-count="courses"', "bg-green-50 text-school-green", "graduation-cap")}
          ${summaryCard("Tareas pendientes", 'data-teacher-count="tasks"', "bg-school-sky text-school-bark", "calendar-check")}
          ${summaryCard("Actividades", 'data-teacher-count="activities"', "bg-yellow-50 text-amber-700", "clipboard-list")}
          ${summaryCard("Clases hoy", 'data-teacher-count="classesToday"', "bg-green-50 text-school-green", "calendar-days")}
          ${summaryCard("Materias", 'data-teacher-count="subjects"', "bg-amber-50 text-amber-700", "book-open")}
          <article class="rounded-xl border border-school-gold/30 bg-white px-3 py-2">
            <div class="flex items-center gap-2">
              <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-yellow-100 text-amber-700">${icon("trophy", "h-5 w-5")}</span>
              <div class="min-w-0">
                <p class="text-[10px] font-black text-amber-700">Buen trabajo</p>
                <p class="truncate text-[10px] font-bold text-slate-500">Labor docente al dia.</p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <div class="fixed inset-0 z-[80] hidden items-center justify-center bg-slate-950/50 p-4" data-trimester-confirm-modal>
        <div class="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
          <div class="grid h-12 w-12 place-items-center rounded-2xl bg-green-50 text-school-green">
            ${icon("calendar-check", "h-6 w-6")}
          </div>
          <h3 class="mt-4 text-xl font-black text-school-bark">Cambiar trimestre activo</h3>
          <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Todo lo que registres desde ahora en asistencia, agenda, calificar, regularizacion y notas se guardara en <b data-trimester-confirm-label>este trimestre</b>.
          </p>
          <div class="mt-5 flex gap-2">
            <button type="button" class="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600" data-trimester-cancel>Cancelar</button>
            <button type="button" class="flex-1 rounded-2xl bg-school-green px-4 py-3 text-sm font-black text-white shadow-soft" data-trimester-confirm>Aceptar</button>
          </div>
        </div>
      </div>
    </div>
  `);
}
