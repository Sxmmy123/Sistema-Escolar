import { icon } from "../../ui/dom.js";
import { appShell, statCard } from "../../ui/shell.js";
import { COURSES, DAYS, SUBJECTS, periodsForCourse } from "../../data/catalog.js";

function hero(kicker, title, text) {
  return `
    <section class="rounded-2xl bg-white p-4 shadow-soft sm:p-5">
      <p class="text-[11px] font-black uppercase tracking-[.16em] text-school-navy sm:text-sm">${kicker}</p>
      <h1 class="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">${title}</h1>
      <p class="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 sm:text-base sm:leading-7">${text}</p>
    </section>
  `;
}

function courseOptions() {
  return COURSES.map((course) => `<option value="${course.id}">${course.nombre}</option>`).join("");
}

function courseTabs(action = "select-course") {
  return `<div class="flex gap-2 overflow-x-auto pb-2" data-course-tabs>${COURSES.map((course, index) => `<button type="button" data-action="${action}" data-course-id="${course.id}" class="shrink-0 rounded-xl border px-3 py-2 text-xs font-black transition sm:rounded-2xl sm:px-4 sm:text-sm ${index === 0 ? "border-school-navy bg-school-navy text-white" : "border-slate-200 bg-white text-slate-600"}">${course.nombre}</button>`).join("")}</div>`;
}

function subjectsLegend() {
  return `
    <div class="space-y-3">
      <div class="flex flex-wrap gap-2" data-subject-palette>
        <button type="button" data-subject-option="" class="rounded-xl border-2 border-school-navy bg-white px-3 py-2 text-xs font-black text-school-navy shadow-soft sm:rounded-2xl sm:px-4 sm:text-sm">Quitar materia</button>
        ${SUBJECTS.map((subject) => `<button type="button" data-subject-option="${subject.id}" class="rounded-xl border-2 border-transparent px-3 py-2 text-xs font-black text-slate-700 transition hover:-translate-y-0.5 sm:rounded-2xl sm:px-4 sm:text-sm" style="background:${subject.color}">${subject.nombre}</button>`).join("")}
      </div>
      <div class="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
        Materia seleccionada: <span data-selected-subject-label class="text-school-navy">Quitar materia</span>
      </div>
    </div>
  `;
}


function teacherAssignmentFields() {
  return `
    <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4" data-teacher-assignment>
      <div class="mb-3">
        <p class="text-[10px] font-black uppercase tracking-[.16em] text-school-navy sm:text-xs">Asignacion docente</p>
        <h3 class="mt-1 text-base font-black text-slate-900 sm:text-lg">Cursos y materias</h3>
        <p class="mt-1 text-xs font-semibold leading-5 text-slate-500 sm:text-sm sm:leading-6">Marca el curso y luego sus materias.</p>
      </div>
      <div class="max-h-[52vh] space-y-2 overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
        ${COURSES.map((course) => `
          <article class="rounded-xl border border-slate-200 bg-white p-3 sm:rounded-2xl sm:p-4" data-assignment-course="${course.id}">
            <label class="flex items-center gap-2 text-sm font-black text-slate-900 sm:gap-3">
              <input class="h-4 w-4 rounded border-slate-300 text-school-navy focus:ring-school-navy sm:h-5 sm:w-5" type="checkbox" data-assignment-course-check value="${course.id}">
              <span class="truncate">${course.nombre}</span>
            </label>
            <div class="mt-2 grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2 sm:mt-3 sm:gap-2">
              ${SUBJECTS.map((subject) => `
                <label class="flex min-w-0 items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-[11px] font-black text-slate-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs" style="background:${subject.color}">
                  <input class="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-school-navy focus:ring-school-navy sm:h-4 sm:w-4" type="checkbox" data-assignment-subject="${course.id}" value="${subject.id}">
                  <span class="truncate">${subject.nombre}</span>
                </label>
              `).join("")}
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}
function userCreatePanel(role, title, note) {
  return `
    <section class="grid gap-3 lg:grid-cols-[minmax(320px,400px)_1fr] sm:gap-5">
      <form class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5" data-create-user-form data-role="${role}">
        <div class="mb-4">
          <p class="text-[10px] font-black uppercase tracking-[.16em] text-school-navy sm:text-xs">Nuevo usuario</p>
          <h2 class="mt-1 text-xl font-black text-slate-900 sm:text-2xl">${title}</h2>
          <p class="mt-1 text-xs font-semibold leading-5 text-slate-500 sm:text-sm sm:leading-6">${note}</p>
        </div>
        <label class="text-sm font-black text-slate-700">Nombre completo</label>
        <input class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-school-navy focus:ring-4 focus:ring-school-navy/10 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base" name="nombre" placeholder="Nombre completo" required>
        <label class="mt-4 block text-sm font-black text-slate-700">Usuario asignado</label>
        <input class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-school-navy focus:ring-4 focus:ring-school-navy/10 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base" name="username" type="text" placeholder="usuario000" required>
        <label class="mt-4 block text-sm font-black text-slate-700">Correo de recuperacion</label>
        <input class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-school-navy focus:ring-4 focus:ring-school-navy/10 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base" name="emailRecuperacion" type="email" placeholder="opcional">
        <label class="mt-4 block text-sm font-black text-slate-700">Contrasena temporal</label>
        <input class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-school-navy focus:ring-4 focus:ring-school-navy/10 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base" name="password" type="text" minlength="6" placeholder="minimo 6 caracteres" required>
        ${role === "docente" ? teacherAssignmentFields() : ""}
        <p class="mt-4 hidden rounded-2xl border px-4 py-3 text-sm font-bold" data-form-status></p>
        <button class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-school-navy px-4 py-2.5 text-sm font-black text-white shadow-soft transition hover:bg-slate-950 disabled:cursor-wait disabled:opacity-70 sm:rounded-2xl sm:py-3 sm:text-base" type="submit">
          ${icon("user-plus", "h-4 w-4 sm:h-5 sm:w-5")} Crear ${role}
        </button>
      </form>

      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div class="flex items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div>
            <p class="text-[10px] font-black uppercase tracking-[.16em] text-slate-400 sm:text-xs">Registrados</p>
            <h3 class="text-base font-black text-slate-900 sm:text-xl">Lista de ${title.toLowerCase()}</h3>
          </div>
          <button class="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-school-navy hover:bg-slate-50 sm:rounded-2xl sm:px-4 sm:text-sm" data-refresh-users="${role}">${icon("refresh-cw", "mr-1.5 inline h-3.5 w-3.5 sm:h-4 sm:w-4")}Actualizar</button>
        </div>
        <div class="overflow-x-auto">
        <table class="min-w-[680px] text-left text-xs sm:text-sm">
          <thead class="bg-school-navy text-white"><tr><th class="px-4 py-3 font-black">Nombre</th><th class="px-4 py-3 font-black">Usuario</th><th class="px-4 py-3 font-black">Recuperacion</th><th class="px-4 py-3 font-black">Rol</th><th class="px-4 py-3 font-black">Estado</th></tr></thead>
          <tbody class="divide-y divide-slate-100" data-user-list="${role}">
            <tr><td class="px-4 py-4 font-bold text-slate-500" colspan="5">Cargando...</td></tr>
          </tbody>
        </table>
        </div>
      </div>
    </section>
  `;
}

function studentsPanel() {
  return `
    <section class="grid gap-3 xl:grid-cols-[minmax(320px,400px)_1fr] sm:gap-5">
      <form class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5" data-students-import-form>
        <p class="text-[10px] font-black uppercase tracking-[.16em] text-school-navy sm:text-xs">Importar alumnos</p>
        <h2 class="mt-1 text-xl font-black text-slate-900 sm:text-2xl">Agregar en masa</h2>
        <label class="mt-4 block text-sm font-black text-slate-700">Curso</label>
        <select class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base" name="courseId">${courseOptions()}</select>
        <label class="mt-4 block text-sm font-black text-slate-700">Lista</label>
        <textarea class="mt-1.5 min-h-40 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs outline-none focus:border-school-navy focus:ring-4 focus:ring-school-navy/10 sm:min-h-56 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm" name="students" placeholder="ALANOCA LINARES ANGEL    17334501"></textarea>
        <p class="mt-4 hidden rounded-2xl border px-4 py-3 text-sm font-bold" data-students-status></p>
        <button class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-school-navy px-4 py-2.5 text-sm font-black text-white sm:rounded-2xl sm:py-3 sm:text-base" type="submit">${icon("upload", "h-4 w-4 sm:h-5 sm:w-5")} Importar alumnos</button>
      </form>
      <div class="min-w-0 space-y-3 sm:space-y-4" data-students-panel>
        ${courseTabs("students-course")}
        <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div class="flex items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
            <div class="min-w-0"><p class="text-[10px] font-black uppercase tracking-[.16em] text-slate-400 sm:text-xs">Curso seleccionado</p><h3 class="truncate text-base font-black text-slate-900 sm:text-xl" data-students-title>Pre Inicial - Inicial</h3></div>
            <div class="flex shrink-0 flex-wrap justify-end gap-2">
              <button class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-school-navy sm:rounded-2xl sm:px-4 sm:text-sm" data-action="refresh-students">Actualizar</button>
              <button class="rounded-xl bg-school-green px-3 py-2 text-xs font-black text-white sm:rounded-2xl sm:px-4 sm:text-sm" data-action="generate-student-accesses">Generar accesos CI/CI</button>
            </div>
          </div>
          <p class="mx-4 hidden rounded-2xl border px-4 py-3 text-sm font-bold sm:mx-5" data-students-access-status></p>
          <div class="overflow-x-auto">
          <table class="min-w-[640px] text-left text-xs sm:text-sm">
            <thead class="bg-school-navy text-white"><tr><th class="px-3 py-2 sm:px-4 sm:py-3">No.</th><th class="px-3 py-2 sm:px-4 sm:py-3">Alumno</th><th class="px-3 py-2 sm:px-4 sm:py-3">CI</th><th class="px-3 py-2 sm:px-4 sm:py-3">Estado</th><th class="px-3 py-2 sm:px-4 sm:py-3">Accion</th></tr></thead>
            <tbody class="divide-y divide-slate-100" data-students-list><tr><td colspan="5" class="px-4 py-4 font-bold text-slate-500">Cargando...</td></tr></tbody>
          </table>
          </div>
        </div>
      </div>
    </section>
  `;
}

function schedulePanel() {
  return `
    <section class="space-y-3 sm:space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-[.16em] text-school-navy sm:text-xs">Horario por curso</p>
            <h2 class="truncate text-xl font-black text-slate-900 sm:text-2xl" data-schedule-title>Pre Inicial - Inicial</h2>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-school-navy transition hover:bg-slate-50 sm:rounded-2xl sm:px-4 sm:text-sm" data-action="export-schedule-all">${icon("archive", "mr-1.5 inline h-3.5 w-3.5 sm:h-4 sm:w-4")}Exportar</button>
            <button type="button" class="rounded-xl bg-school-navy px-3 py-2 text-xs font-black text-white transition hover:bg-slate-950 sm:rounded-2xl sm:px-4 sm:text-sm" data-action="import-schedule-open">${icon("upload", "mr-1.5 inline h-3.5 w-3.5 sm:h-4 sm:w-4")}Importar</button>
            <input class="hidden" type="file" accept="application/json,.json" data-schedule-import-file>
          </div>
        </div>
        <div class="mt-3 text-sm font-black text-green-700" data-schedule-status></div>
        <div class="mt-4">${courseTabs("schedule-course")}</div>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
        <p class="mb-3 text-xs font-black text-slate-500 sm:text-sm">Selecciona una materia y toca los cuadros del horario</p>
        ${subjectsLegend()}
      </div>
      <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft" data-schedule-grid></div>
    </section>
  `;
}

function auditPanel() {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <section class="space-y-3 sm:space-y-5">
      <div class="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft lg:grid-cols-[190px_190px_1fr_120px] sm:p-5">
        <label class="text-sm font-black text-slate-700">Fecha
          <input class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:rounded-2xl sm:px-4 sm:py-3" type="date" value="${today}" data-audit-date>
        </label>
        <label class="text-sm font-black text-slate-700">Tipo
          <select class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:rounded-2xl sm:px-4 sm:py-3" data-audit-type>
            <option value="">Todo</option>
            <option value="alumnos">Alumnos</option>
            <option value="usuarios">Usuarios</option>
            <option value="horarios">Horarios</option>
            <option value="sistema">Sistema</option>
          </select>
        </label>
        <label class="text-sm font-black text-slate-700">Buscar
          <input class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:rounded-2xl sm:px-4 sm:py-3" type="search" placeholder="Usuario, curso, alumno o accion" data-audit-search>
        </label>
        <button class="self-end rounded-xl bg-school-navy px-4 py-2.5 text-sm font-black text-white sm:rounded-2xl sm:py-3" data-action="load-audit">Ver</button>
      </div>
      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div class="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
          <div><p class="text-[10px] font-black uppercase tracking-[.16em] text-slate-400 sm:text-xs">Historial</p><h3 class="text-base font-black text-slate-900 sm:text-xl"><span data-audit-count>0</span> movimientos</h3></div>
          <span class="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700" data-audit-status>Listo</span>
        </div>
        <div class="overflow-x-auto">
        <table class="min-w-[760px] text-left text-xs sm:text-sm">
          <thead class="bg-school-navy text-white"><tr><th class="px-4 py-3 font-black">Hora</th><th class="px-4 py-3 font-black">Usuario</th><th class="px-4 py-3 font-black">Tipo</th><th class="px-4 py-3 font-black">Accion</th><th class="px-4 py-3 font-black">Detalle</th><th class="px-4 py-3 font-black"></th></tr></thead>
          <tbody class="divide-y divide-slate-100" data-audit-list><tr><td colspan="6" class="px-4 py-4 font-bold text-slate-500">Cargando...</td></tr></tbody>
        </table>
        </div>
      </div>
      <div class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/50 p-4" data-audit-modal>
        <div class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
          <div class="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
            <h3 class="text-lg font-black text-slate-900 sm:text-xl">Detalle de auditoria</h3>
            <button class="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-600" data-action="close-audit-modal">×</button>
          </div>
          <div class="space-y-4 p-4 sm:p-5" data-audit-detail></div>
        </div>
      </div>
    </section>
  `;
}
export function AdminModule(route) {
  const pages = {
    "/admin/alumnos": ["Alumnos", "Registro e importacion", "Agregar alumnos por curso, habilitar, retirar y mantener numero de lista.", "", studentsPanel()],
    "/admin/docentes": ["Docentes", "Asignacion docente", "Crear docentes en Firebase Authentication y guardar su perfil docente en Firestore.", "", userCreatePanel("docente", "Docentes", "Luego se les asignara cursos y materias desde este mismo modulo.")],
    "/admin/director": ["Director", "Usuario director", "Crear o actualizar el usuario visualizador del colegio.", "", userCreatePanel("director", "Director", "El director podra ingresar a reportes, asistencias y auditoria.")],
    "/admin/horarios": ["Horarios", "Horario escolar", "Configurar materias por curso con colores fijos por materia.", "", schedulePanel()],
    "/admin/auditoria": ["Auditoria", "Movimientos", "Historial claro de cambios importantes hechos por admin, docente y director.", "", auditPanel()]
  };
  const page = pages[route] || pages["/admin/alumnos"];
  const statsSection = page[3] ? `<section class="mt-3 grid gap-3 sm:mt-5 sm:grid-cols-3 sm:gap-4">${page[3]}</section>` : "";
  return appShell("admin", route, `${hero("Administrador", page[0], page[2])}${statsSection}<section class="mt-3 sm:mt-5">${page[4]}</section>`);
}

function simpleTable(headers, rows) {
  return `
    <div class="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-soft">
      <table class="min-w-full text-left text-sm">
        <thead class="bg-school-navy text-white"><tr>${headers.map((h) => `<th class="px-4 py-3 font-black">${h}</th>`).join("")}</tr></thead>
        <tbody class="divide-y divide-slate-100">${rows.map((row) => `<tr>${row.map((cell) => `<td class="px-4 py-3 font-semibold text-slate-700">${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
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
    <section class="${showControls ? "mt-6" : "mt-2"}" ${page[3]}>
      <div class="rounded-3xl border border-slate-200 bg-white p-5 font-bold text-slate-500 shadow-soft">Cargando informacion del docente...</div>
    </section>
  `);
}
export function DirectorModule(route) {
  const pages = {
    "/director/asistencias": ["Asistencias", "Vista general", "Resumen por curso y trimestre para supervision.", `<div class="grid gap-4 sm:grid-cols-4">${statCard("Asistencia", "0%", "check-circle")} ${statCard("Atrasos", "0%", "clock")} ${statCard("Permisos", "0%", "file-check")} ${statCard("Faltas", "0%", "x-circle")}</div>`, simpleTable(["Curso", "Asistencia", "Atraso", "Permiso", "Falta"], [["Primero A", "0%", "0%", "0%", "0%"]])],
    "/director/reportes": ["Reportes", "Clasificacion academica", "Estadisticas por curso y materia para detectar avance y riesgo academico.", `<div class="flex gap-2 overflow-x-auto pb-2">${SUBJECTS.map((s, i) => `<button class="shrink-0 rounded-2xl border px-4 py-2 text-sm font-black ${i === 0 ? "border-school-navy bg-school-navy text-white" : "border-slate-200 bg-white text-slate-600"}">${s.nombre}</button>`).join("")}</div>`, simpleTable(["Curso", "Notas altas", "Notas bajas", "Promedio"], [["Primero A", "0%", "0%", "-"]])],
    "/director/auditoria": ["Auditoria", "Historial", "Revision de movimientos del sistema con detalle visual y tecnico.", `<div class="grid gap-3 sm:grid-cols-3"><input class="rounded-2xl border border-slate-200 px-4 py-3 font-semibold" type="date"><select class="rounded-2xl border border-slate-200 px-4 py-3 font-semibold"><option>Todo</option></select><button class="rounded-2xl bg-school-navy px-4 py-3 font-black text-white">Ver</button></div>`, simpleTable(["Hora", "Usuario", "Tipo", "Accion"], [["--:--", "docente", "asistencia", "actualizado"]])]
  };
  const page = pages[route] || pages["/director/asistencias"];
  return appShell("director", route, `${hero("Director", page[0], page[2])}<section class="mt-6">${page[3]}</section><section class="mt-6">${page[4]}</section>`);
}











