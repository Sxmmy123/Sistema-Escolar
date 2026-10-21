import { appShell } from "../../ui/shell.js";

function hero(kicker, title, text) {
  return `
    <section class="rounded-2xl bg-white p-4 shadow-soft sm:p-5">
      <p class="text-[11px] font-black uppercase tracking-[.16em] text-school-navy sm:text-sm">${kicker}</p>
      <h1 class="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">${title}</h1>
      <p class="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 sm:text-base sm:leading-7">${text}</p>
    </section>
  `;
}

export function DocenteModule(route) {
  const pageMap = {
    "/docente/asistencia": ["Asistencia", "Tomar asistencia", "Selecciona un curso asignado y registra la asistencia del dia.", "data-teacher-attendance"],
    "/docente/tareas": ["Agenda", "Actividades programadas", "Agenda tareas o examenes solo para tus cursos y materias asignadas.", "data-teacher-tasks"],
    "/docente/calificar": ["Calificar", "Calificar por fecha", "Selecciona una actividad agendada y registra las notas correspondientes.", "data-teacher-grading"],
    "/docente/regularizacion": ["Regularizacion", "Seguimiento academico", "Estudiantes con actividades no presentadas o bajo rendimiento.", "data-teacher-regularization"],
    "/docente/notas": ["Notas", "Calificaciones", "Registra notas por trimestre, materia y estudiante.", "data-teacher-notes"],
    "/docente/boletin": ["Boletin", "Centralizador", "Vista general de notas finales por materia y trimestre.", "data-teacher-bulletin"],
    "/docente/resumen": ["Resumen Asistencia", "Resumen de asistencias", "Revisa asistencia, atrasos, permisos y faltas por curso.", "data-teacher-summary"],
    "/docente/horario": ["Horario", "Mi horario", "Visualiza solamente los cursos y materias que tienes asignados.", "data-teacher-schedule"]
  };
  const page = pageMap[route] || pageMap["/docente/asistencia"];
  const showTrimester = route === "/docente";
  const compactRoutes = ["/docente/asistencia", "/docente/tareas", "/docente/calificar", "/docente/regularizacion", "/docente/notas", "/docente/boletin", "/docente/horario", "/docente/resumen"];
  const showControls = !compactRoutes.includes(route);
  const header = compactRoutes.includes(route) ? "" : hero("Docente", page[0], page[2]);
  return appShell("docente", route, `
    ${header}
    ${showControls ? `<section class="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
      <div class="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <p class="text-xs font-black uppercase tracking-[.18em] text-slate-400">Cursos asignados</p>
          <div class="mt-3 flex gap-2 overflow-x-auto pb-2" data-teacher-course-tabs>
            <span class="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-500">Cargando cursos...</span>
          </div>
        </div>
        <div class="grid gap-3 sm:grid-cols-[1fr_auto] xl:min-w-[440px]">
          ${showTrimester ? `
            <div>
              <p class="text-xs font-black uppercase tracking-[.18em] text-slate-400">Trimestre</p>
              <div class="mt-3 flex gap-2 overflow-x-auto pb-2" data-teacher-trimester-tabs>
                <span class="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-500">Cargando trimestre...</span>
              </div>
            </div>
          ` : ""}
          <div class="self-end rounded-2xl bg-school-sky px-4 py-3 text-sm font-black text-school-navy" data-teacher-page-status>Cargando datos...</div>
        </div>
      </div>
    </section>` : ""}
    <section class="teacher-module-page ${showControls ? "mt-6" : "mt-2"}" data-teacher-page ${page[3]}>
      <div class="rounded-3xl border border-slate-200 bg-white p-5 font-bold text-slate-500 shadow-soft">Cargando informacion del docente...</div>
    </section>
  `);
}
