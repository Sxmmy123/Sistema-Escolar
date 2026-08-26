import { appShell, moduleCard, statCard } from "../../ui/shell.js";

export function AdminDashboard() {
  return appShell("admin", "/admin", `
    <section class="rounded-2xl bg-white p-4 shadow-soft sm:p-5">
      <p class="text-[11px] font-black uppercase tracking-[.18em] text-school-navy sm:text-sm">Administrador</p>
      <h1 class="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">Panel administrativo</h1>
      <p class="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 sm:text-base">Gestiona alumnos, docentes, director, horarios, carga historica y auditoria.</p>
    </section>
    <section class="mt-3 grid grid-cols-1 gap-3 sm:mt-5 sm:grid-cols-3 sm:gap-4">
      ${statCard("Alumnos", `<span data-admin-count="students">...</span>`, "users")}
      ${statCard("Docentes", `<span data-admin-count="teachers">...</span>`, "presentation")}
      ${statCard("Horarios", `<span data-admin-count="schedules">...</span>`, "calendar-days")}
    </section>
    <section class="mt-3 grid grid-cols-1 gap-3 sm:mt-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      ${moduleCard("Alumnos", "Registrar, importar y habilitar alumnos.", "#/admin/alumnos", "users")}
      ${moduleCard("Docentes", "Asignar cursos y materias por docente.", "#/admin/docentes", "presentation")}
      ${moduleCard("Director", "Gestionar usuario visualizador.", "#/admin/director", "eye")}
      ${moduleCard("Horarios", "Configurar horario oficial por curso.", "#/admin/horarios", "calendar-days")}
      ${moduleCard("Carga Historica", "Importar asistencias ya registradas.", "#/admin/carga-historica", "upload")}
      ${moduleCard("Auditoria", "Revisar movimientos del sistema.", "#/admin/auditoria", "activity")}
    </section>
  `);
}

