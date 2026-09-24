import { icon } from "../../ui/dom.js";
import { AdminShell } from "./AdminShell.js";

function metricCard(label, value, detail, iconName, tone) {
  return `
    <article class="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-center gap-3">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tone}">${icon(iconName, "h-5 w-5")}</span>
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[.1em] text-slate-500">${label}</p>
          <p class="mt-0.5 text-2xl font-semibold leading-none text-slate-950">${value}</p>
          <p class="mt-1 truncate text-[11px] text-slate-500">${detail}</p>
        </div>
      </div>
    </article>
  `;
}

function actionCard(title, description, href, iconName, accent = "bg-green-50 text-school-green") {
  return `
    <a href="${href}" class="group flex min-h-[108px] min-w-0 items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-school-green/30 hover:shadow-md">
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg ${accent}">${icon(iconName, "h-5 w-5")}</span>
      <span class="min-w-0 flex-1">
        <span class="flex items-center justify-between gap-2">
          <strong class="truncate text-sm font-semibold text-slate-900">${title}</strong>
          ${icon("chevron-right", "h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-school-green")}
        </span>
        <span class="mt-1.5 block text-xs leading-5 text-slate-500">${description}</span>
      </span>
    </a>
  `;
}

export function AdminDashboard() {
  return AdminShell("/admin", `
    <section class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      ${metricCard("Alumnos", `<span data-admin-count="students">...</span>`, "Registros activos del colegio", "users", "bg-green-50 text-school-green")}
      ${metricCard("Docentes", `<span data-admin-count="teachers">...</span>`, "Usuarios y asignaciones", "presentation", "bg-amber-50 text-amber-700")}
      ${metricCard("Horarios", `<span data-admin-count="schedules">...</span>`, "Cursos con horario configurado", "calendar-check", "bg-slate-100 text-slate-700")}
    </section>

    <section class="mt-6">
      <div class="mb-3 flex items-end justify-between gap-3">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[.14em] text-school-green">Gestion del sistema</p>
          <h2 class="mt-1 text-lg font-semibold text-slate-950">Accesos administrativos</h2>
        </div>
        <span class="hidden text-xs text-slate-400 sm:block">Selecciona una tarea para comenzar</span>
      </div>
      <div class="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-3">
        ${actionCard("Alumnos", "Importa estudiantes, genera accesos y controla su estado.", "#/admin/alumnos", "users")}
        ${actionCard("Docentes", "Crea cuentas y asigna cursos y materias.", "#/admin/docentes", "presentation")}
        ${actionCard("Director", "Administra la cuenta de consulta y seguimiento.", "#/admin/director", "user-cog")}
        ${actionCard("Horarios", "Organiza el horario oficial de cada curso.", "#/admin/horarios", "calendar-days")}
        ${actionCard("Carga de datos", "Registra asistencias y notas historicas en bloque.", "#/admin/carga-historica", "database-zap", "bg-amber-50 text-amber-700")}
        ${actionCard("Auditoria", "Consulta movimientos y cambios realizados en el sistema.", "#/admin/auditoria", "activity", "bg-slate-100 text-slate-700")}
      </div>
    </section>
  `, {
    title: "Panel administrativo",
    subtitle: "Usuarios, cursos, horarios y control general del sistema"
  });
}
