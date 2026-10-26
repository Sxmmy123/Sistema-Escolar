import { icon } from "../../ui/dom.js";
import { COURSES, PRIMARY_COURSES, DAYS, SUBJECTS, periodsForCourse } from "../../data/catalog.js";
import { AdminShell } from "./AdminShell.js";
import { fechaEscolarIso } from "../../services/fechaEscolar.js";
import { gestionActual } from "../../services/rutasFirestore.js";
import { AlumnosAdminPanel } from "./AlumnosAdmin.js";

function courseOptions(courses = COURSES) {
  return courses.map((course) => `<option value="${course.id}">${course.nombre}</option>`).join("");
}

function subjectOptions() {
  return SUBJECTS.map((subject) => `<option value="${subject.id}">${subject.nombre}</option>`).join("");
}

function courseTabs(action = "select-course") {
  return `<div class="flex gap-1.5 overflow-x-auto pb-1" data-course-tabs>${COURSES.map((course, index) => `<button type="button" data-action="${action}" data-course-id="${course.id}" class="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition ${index === 0 ? "border-school-green bg-school-green text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-school-green/30 hover:bg-green-50"}">${course.nombre}</button>`).join("")}</div>`;
}

function subjectsLegend() {
  return `
    <div class="space-y-2.5">
      <div class="flex flex-wrap gap-1.5" data-subject-palette>
        <button type="button" data-subject-option="" class="rounded-lg border-2 border-school-green bg-white px-3 py-2 text-xs font-medium text-school-green shadow-sm">Quitar materia</button>
        ${SUBJECTS.map((subject) => `<button type="button" data-subject-option="${subject.id}" class="rounded-lg border-2 border-transparent px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-school-green/20" style="background:${subject.color}">${subject.nombre}</button>`).join("")}
      </div>
      <div class="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span>Materia seleccionada:</span><strong data-selected-subject-label class="font-semibold text-school-green">Quitar materia</strong>
      </div>
    </div>
  `;
}


function teacherWizardProgress() {
  const steps = ["Datos", "Cursos", "Materias", "Confirmar", "Listo"];
  return `
    <div class="-mx-4 -mt-4 border-b border-slate-100 bg-slate-50/80 px-2 py-4 sm:px-5" data-teacher-progress>
      <ol class="grid grid-cols-5" aria-label="Progreso del registro docente">
        ${steps.map((step, index) => `
          <li class="relative min-w-0 text-center" data-teacher-progress-step="${index + 1}">
            ${index < steps.length - 1 ? `<span class="absolute left-1/2 top-4 h-0.5 w-full bg-slate-200" data-teacher-progress-line></span>` : ""}
            <div class="relative z-10 mx-auto grid h-8 w-8 place-items-center rounded-full ${index === 0 ? "bg-school-green text-white ring-4 ring-green-100" : "bg-slate-200 text-slate-500"} text-xs font-semibold transition" data-teacher-progress-circle>${index + 1}</div>
            <p class="mt-2 truncate px-0.5 text-[9px] font-medium ${index === 0 ? "text-school-green" : "text-slate-500"} sm:text-[10px]" data-teacher-progress-title>${step}</p>
            <p class="mt-0.5 hidden text-[9px] ${index === 0 ? "text-school-green" : "text-slate-400"} md:block" data-teacher-progress-status>${index === 0 ? "Paso actual" : "Pendiente"}</p>
          </li>
        `).join("")}
      </ol>
    </div>
  `;
}

function teacherAssignmentFields() {
  return `
    <section class="hidden py-1" data-teacher-step="2">
      <div class="mb-5">
        <p class="text-[10px] font-semibold uppercase tracking-[.14em] text-school-green">Paso 2 de 5</p>
        <h2 class="mt-1 text-xl font-semibold text-slate-900" data-assignment-course-heading>Selecciona los cursos</h2>
        <p class="mt-1 text-xs leading-5 text-slate-500" data-assignment-course-detail>Selecciona cursos de una sola modalidad.</p>
      </div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        ${COURSES.map((course) => `
          <label class="group relative flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-school-green/40 hover:shadow-sm" data-assignment-course-card="${course.id}">
            <input class="peer h-4 w-4 shrink-0 rounded border-slate-300 text-school-green focus:ring-school-green" type="checkbox" data-assignment-course-check value="${course.id}">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-green-50 text-school-green">${icon("school", "h-4 w-4")}</span>
            <span class="min-w-0 text-xs font-medium leading-4 text-slate-700 peer-checked:text-school-green">${course.nombre}<span class="mt-1 block text-[10px] font-normal text-slate-500">${course.modalidadEvaluacion === "cualitativa" ? "Cualitativa" : "Cuantitativa"}</span></span>
            <span class="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-transparent peer-checked:ring-school-green/45"></span>
          </label>
        `).join("")}
      </div>
      <div class="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
        <span class="text-slate-500">Cursos seleccionados</span>
        <strong class="font-medium text-school-green" data-selected-course-total>0 cursos</strong>
      </div>
      <p class="mt-2 text-xs font-medium text-school-green" data-selected-teacher-modality aria-live="polite"></p>
      <div class="mt-5 flex justify-between gap-2">
        <button type="button" class="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50" data-teacher-back="1">${icon("arrow-left", "h-4 w-4")}Atras</button>
        <button type="button" class="inline-flex items-center gap-2 rounded-lg bg-school-green px-4 py-2.5 text-xs font-semibold text-white hover:bg-green-800" data-teacher-next="3">Continuar${icon("arrow-right", "h-4 w-4")}</button>
      </div>
    </section>

    <section class="hidden py-1" data-teacher-step="3" data-teacher-assignment>
      <div class="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[.14em] text-school-green">Paso 3 de 5</p>
          <h2 class="mt-1 text-xl font-semibold text-slate-900" data-assignment-step-title>Selecciona las materias</h2>
          <p class="mt-1 text-xs leading-5 text-slate-500" data-assignment-step-detail>Asigna las materias que impartira en cada curso seleccionado.</p>
        </div>
        <span class="w-fit rounded-full bg-green-50 px-3 py-1 text-[10px] font-medium text-school-green" data-subject-course-total>0 cursos</span>
      </div>

      <div class="hidden border-y border-slate-200 py-4" data-qualitative-assignment-info><p class="text-sm font-semibold text-slate-800">Evaluacion cualitativa</p><div class="mt-3 space-y-2 text-sm text-slate-600" data-qualitative-courses></div></div>
      <div data-primary-assignment-fields>
      <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="tablist" aria-label="Cursos seleccionados">
        ${COURSES.map((course) => `
          <button type="button" role="tab" aria-selected="false" data-assignment-course-tab="${course.id}" class="hidden w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-center text-xs font-medium text-slate-600 transition hover:bg-green-50">
            <span>${course.nombre}</span>
            <span class="hidden min-w-5 rounded-full px-1.5 py-0.5 text-[9px]" data-assignment-course-count="${course.id}">0</span>
          </button>
        `).join("")}
      </div>

      <div class="mt-4">
        ${COURSES.map((course) => `
          <article class="hidden" data-assignment-course="${course.id}" role="tabpanel">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-slate-900">Materias de ${course.nombre}</p>
                <p class="mt-0.5 text-[10px] text-slate-500" data-assignment-panel-count>Sin materias seleccionadas</p>
              </div>
              <div class="flex gap-1.5">
                <button type="button" class="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50" data-assignment-select-all="${course.id}">Seleccionar todas</button>
                <button type="button" class="rounded-md border border-red-100 bg-white px-2.5 py-1.5 text-[10px] font-medium text-red-600 hover:bg-red-50" data-assignment-clear="${course.id}">Limpiar</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              ${SUBJECTS.map((subject) => `
                <label class="group relative flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-medium text-slate-700 transition hover:border-school-green/40 hover:shadow-sm">
                  <input class="peer h-4 w-4 shrink-0 rounded border-slate-300 text-school-green focus:ring-school-green" type="checkbox" data-assignment-subject="${course.id}" value="${subject.id}">
                  <span class="h-2.5 w-2.5 shrink-0 rounded-sm" style="background:${subject.color}"></span>
                  <span class="min-w-0 leading-4 peer-checked:text-school-green">${subject.nombre}</span>
                  <span class="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-transparent peer-checked:ring-school-green/40"></span>
                </label>
              `).join("")}
            </div>
          </article>
        `).join("")}
      </div>
      </div>
      <div class="mt-5 flex justify-between gap-2">
        <button type="button" class="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50" data-teacher-back="2">${icon("arrow-left", "h-4 w-4")}Atras</button>
        <button type="button" class="inline-flex items-center gap-2 rounded-lg bg-school-green px-4 py-2.5 text-xs font-semibold text-white hover:bg-green-800" data-teacher-next="4">Revisar${icon("arrow-right", "h-4 w-4")}</button>
      </div>
    </section>

    <section class="hidden py-1" data-teacher-step="4">
      <div class="mb-5">
        <p class="text-[10px] font-semibold uppercase tracking-[.14em] text-school-green">Paso 4 de 5</p>
        <h2 class="mt-1 text-xl font-semibold text-slate-900">Corrobora toda la informacion</h2>
        <p class="mt-1 text-xs leading-5 text-slate-500">Revisa la cuenta, los cursos y las materias antes de crear al docente.</p>
      </div>
      <div class="space-y-3" data-teacher-confirmation></div>
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <button type="button" class="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50" data-teacher-back="3">${icon("arrow-left", "h-4 w-4")}Corregir</button>
        <button class="inline-flex items-center justify-center gap-2 rounded-lg bg-school-green px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:cursor-wait disabled:opacity-70" type="submit">
          ${icon("user-plus", "h-4 w-4")} Confirmar y crear docente
        </button>
      </div>
    </section>

    <section class="hidden py-8 text-center" data-teacher-step="5">
      <span class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-school-green ring-8 ring-green-50">${icon("check", "h-8 w-8")}</span>
      <p class="mt-5 text-[10px] font-semibold uppercase tracking-[.14em] text-school-green">Paso 5 de 5</p>
      <h2 class="mt-1 text-xl font-semibold text-slate-900">Docente agregado satisfactoriamente</h2>
      <p class="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-500">La cuenta y sus asignaciones ya fueron guardadas en el sistema.</p>
      <div class="mx-auto mt-5 max-w-xl rounded-lg border border-green-100 bg-green-50/60 p-4 text-left" data-teacher-success-details></div>
      <button type="button" class="mt-5 inline-flex items-center gap-2 rounded-lg bg-school-green px-5 py-2.5 text-xs font-semibold text-white hover:bg-green-800" data-teacher-restart>${icon("user-plus", "h-4 w-4")}Registrar otro docente</button>
    </section>
  `;
}

function teacherCreateForm(note) {
  return `
    <form class="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-create-user-form data-role="docente" data-teacher-wizard>
      ${teacherWizardProgress()}
      <section class="py-1" data-teacher-step="1">
        <fieldset class="mb-4 flex flex-wrap gap-4 border-b border-slate-200 pb-4">
          <legend class="sr-only">Tipo de registro</legend>
          <label class="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="tipoRegistro" value="nuevo" checked> Nuevo docente</label>
          <label class="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="tipoRegistro" value="reemplazo"> Reemplazo de docente</label>
        </fieldset>
        <div class="mb-4 hidden grid gap-3 border-b border-slate-200 pb-4 sm:grid-cols-2" data-teacher-replacement-fields>
          <label class="text-xs font-medium text-slate-700">Docente que sera reemplazado<select name="reemplazoDocente" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" disabled required><option value="">Seleccionar docente</option></select></label>
          <label class="text-xs font-medium text-slate-700">El nuevo docente comienza en<select name="reemplazoTrimestre" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" disabled required><option value="">Seleccionar trimestre</option><option value="t2">2do trimestre</option><option value="t3">3er trimestre</option></select></label>
          <p class="sm:col-span-2 text-sm text-slate-600" data-teacher-replacement-summary></p>
        </div>
        <div class="mb-5">
          <p class="text-[10px] font-semibold uppercase tracking-[.14em] text-school-green">Paso 1 de 5</p>
          <h2 class="mt-1 text-xl font-semibold text-slate-900">Datos personales y cuenta</h2>
          <p class="mt-1 max-w-2xl text-xs leading-5 text-slate-500">${note}</p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="text-xs font-medium text-slate-700">Nombre completo
            <input class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="nombre" placeholder="Nombre y apellidos" required>
          </label>
          <label class="text-xs font-medium text-slate-700">Usuario asignado
            <input class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="username" type="text" placeholder="usuario000" required>
          </label>
          <label class="text-xs font-medium text-slate-700">Correo electronico
            <input class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="emailRecuperacion" type="email" autocomplete="email" maxlength="254" placeholder="nombre@correo.com" required>
          </label>
          <label class="text-xs font-medium text-slate-700">Contrasena temporal
            <input class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="password" type="text" minlength="6" placeholder="Minimo 6 caracteres" required>
          </label>
        </div>
        <div class="mt-5 flex justify-end">
          <button type="button" class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-school-green px-5 py-2.5 text-xs font-semibold text-white hover:bg-green-800 sm:w-auto" data-teacher-next="2">Continuar${icon("arrow-right", "h-4 w-4")}</button>
        </div>
      </section>
      ${teacherAssignmentFields()}
      <p class="mt-4 hidden rounded-lg border px-3 py-2.5 text-xs font-medium" data-form-status></p>
    </form>
  `;
}

function standardCreateForm(role, note) {
  return `
    <form class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-create-user-form data-role="${role}">
      <div class="mb-4 border-b border-slate-100 pb-3">
        <p class="text-[10px] font-semibold uppercase tracking-[.14em] text-school-green">Nuevo usuario</p>
        <h2 class="mt-0.5 text-lg font-semibold text-slate-900">Registrar ${role}</h2>
        <p class="mt-1 max-w-xl text-xs leading-5 text-slate-500">${note}</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label class="text-xs font-medium text-slate-700">Nombre completo<input class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="nombre" placeholder="Nombre y apellidos" required></label>
        <label class="text-xs font-medium text-slate-700">Usuario asignado<input class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="username" type="text" placeholder="usuario000" required></label>
        <label class="text-xs font-medium text-slate-700">Correo electronico<input class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="emailRecuperacion" type="email" autocomplete="email" maxlength="254" placeholder="nombre@correo.com" required></label>
        <label class="text-xs font-medium text-slate-700">Contrasena temporal<input class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" name="password" type="text" minlength="6" placeholder="Minimo 6 caracteres" required></label>
      </div>
      <p class="mt-3 hidden rounded-lg border px-3 py-2.5 text-xs font-medium" data-form-status></p>
      <div class="mt-4 flex justify-end"><button class="flex w-full items-center justify-center gap-2 rounded-lg bg-school-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:cursor-wait disabled:opacity-70 sm:w-auto" type="submit">${icon("user-plus", "h-4 w-4")} Crear ${role}</button></div>
    </form>
  `;
}

function userCreatePanel(role, title, note) {
  return `
    <section class="space-y-4">
      ${role === "docente" ? teacherCreateForm(note) : standardCreateForm(role, note)}

      <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <p class="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">Registrados</p>
            <h3 class="mt-0.5 text-sm font-semibold text-slate-900">Lista de ${title.toLowerCase()}</h3>
          </div>
          <button class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-school-green hover:bg-green-50" data-refresh-users="${role}">${icon("refresh-cw", "h-3.5 w-3.5")}Actualizar</button>
        </div>
        <div class="overflow-x-auto">
        <table class="min-w-[680px] w-full text-left text-xs">
          <thead class="bg-[#123d24] text-white"><tr><th class="px-4 py-2.5 font-medium">Nombre</th><th class="px-4 py-2.5 font-medium">Usuario</th><th class="px-4 py-2.5 font-medium">Correo</th><th class="px-4 py-2.5 font-medium">Rol</th><th class="px-4 py-2.5 font-medium">Estado</th></tr></thead>
          <tbody class="divide-y divide-slate-100" data-user-list="${role}">
            <tr><td class="px-4 py-4 text-slate-500" colspan="5">Cargando...</td></tr>
          </tbody>
        </table>
        </div>
      </div>
    </section>
  `;
}

function studentsPanel() {
  return AlumnosAdminPanel();
}

function schedulePanel() {
  return `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-[.14em] text-school-green">Horario por curso</p>
            <h2 class="mt-0.5 truncate text-lg font-semibold text-slate-900" data-schedule-title>Preinicial</h2>
          </div>
          <div class="grid grid-cols-2 gap-2 sm:flex">
            <button type="button" class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-school-green transition hover:bg-green-50" data-action="export-schedule-all">${icon("archive", "h-3.5 w-3.5")}Exportar</button>
            <button type="button" class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-school-green px-3 py-2 text-xs font-medium text-white transition hover:bg-green-800" data-action="import-schedule-open">${icon("upload", "h-3.5 w-3.5")}Importar</button>
            <input class="hidden" type="file" accept="application/json,.json" data-schedule-import-file>
          </div>
        </div>
        <div class="mt-2 text-xs font-medium text-green-700" data-schedule-status></div>
        <div class="mt-4">${courseTabs("schedule-course")}</div>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p class="mb-3 text-xs text-slate-500">Selecciona una materia y luego toca una celda del horario.</p>
        ${subjectsLegend()}
      </div>
      <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm" data-schedule-grid></div>
    </section>
  `;
}

function historicalPanel() {
  const year = gestionActual();
  return `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div class="grid grid-cols-2 gap-1.5 sm:flex">
          <button type="button" data-historical-tab="attendance" class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-school-green px-4 py-2 text-xs font-semibold text-white">${icon("clipboard-check", "h-4 w-4")}Asistencia</button>
          <button type="button" data-historical-tab="grades" class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-school-green hover:bg-green-50">${icon("notebook-tabs", "h-4 w-4")}Notas</button>
        </div>
      </div>

      <div data-historical-section="attendance">
        <form class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-historical-attendance-form>
          <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-[.14em] text-school-green">Carga historica</p>
              <h2 class="mt-0.5 text-lg font-semibold text-slate-900">Asistencias ya registradas</h2>
              <p class="mt-1 text-xs leading-5 text-slate-500">Rellena como tabla: fechas arriba y P/A/L/F en cada alumno.</p>
            </div>
            <div class="grid grid-cols-3 gap-1.5 sm:flex">
              <button class="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-medium text-school-green transition hover:bg-green-50 sm:px-3 sm:text-xs" type="button" data-action="add-historical-date">${icon("plus", "h-3.5 w-3.5")}Fecha</button>
              <button class="inline-flex items-center justify-center gap-1 rounded-lg border border-school-green px-2.5 py-2 text-[11px] font-medium text-school-green transition hover:bg-green-50 sm:px-3 sm:text-xs" type="button" data-action="preview-historical-attendance">${icon("eye", "h-3.5 w-3.5")}Revisar</button>
              <button class="inline-flex items-center justify-center gap-1 rounded-lg bg-school-green px-2.5 py-2 text-[11px] font-medium text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:text-xs" type="button" data-action="import-historical-attendance" disabled>${icon("upload", "h-3.5 w-3.5")}Guardar</button>
            </div>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-[1fr_180px_120px]">
            <label class="text-sm font-black text-slate-700">Curso
              <select class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:rounded-2xl sm:px-4 sm:py-3" name="courseId">${courseOptions()}</select>
            </label>
            <label class="text-sm font-black text-slate-700">Trimestre
              <select class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:rounded-2xl sm:px-4 sm:py-3" name="trimestreId">
                <option value="t1">1er trimestre</option>
                <option value="t2">2do trimestre</option>
                <option value="t3">3er trimestre</option>
              </select>
            </label>
            <label class="text-sm font-black text-slate-700">Gestion
              <input class="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold sm:rounded-2xl sm:px-4 sm:py-3" name="year" type="text" value="${year}" readonly aria-label="Gestion activa">
            </label>
          </div>

          <div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
            Puedes copiar desde Excel y pegar encima de la tabla. Usa P = presente, A = atraso, L = licencia/permiso, F = falta. Celda vacia = no guardar.
          </div>
          <p class="mt-3 hidden rounded-2xl border px-4 py-3 text-sm font-bold" data-historical-status></p>
        </form>

        <div class="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Tabla editable</p>
              <h3 class="text-base font-black text-slate-900">Pega o rellena asistencias</h3>
            </div>
            <span class="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700" data-historical-grid-count>0 alumnos</span>
          </div>
          <div class="max-h-[62vh] overflow-auto" data-historical-grid></div>
        </div>

        <div class="mt-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-historical-preview>
          <div class="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">Previsualiza la tabla antes de guardar.</div>
        </div>
      </div>

      <div class="hidden" data-historical-section="grades">
        <form class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-historical-grades-form>
          <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-[.14em] text-school-green">Carga historica</p>
              <h2 class="mt-0.5 text-lg font-semibold text-slate-900">Notas ya registradas</h2>
              <p class="mt-1 text-xs leading-5 text-slate-500">Solo HACER y SABER. Cada columna es una actividad que luego se refleja en Notas.</p>
            </div>
            <div class="grid grid-cols-3 gap-1.5 sm:flex">
              <button class="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-medium text-school-green transition hover:bg-green-50 sm:px-3 sm:text-xs" type="button" data-action="add-historical-grade-column">${icon("plus", "h-3.5 w-3.5")}Actividad</button>
              <button class="inline-flex items-center justify-center gap-1 rounded-lg border border-school-green px-2.5 py-2 text-[11px] font-medium text-school-green transition hover:bg-green-50 sm:px-3 sm:text-xs" type="button" data-action="preview-historical-grades">${icon("eye", "h-3.5 w-3.5")}Revisar</button>
              <button class="inline-flex items-center justify-center gap-1 rounded-lg bg-school-green px-2.5 py-2 text-[11px] font-medium text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:text-xs" type="button" data-action="import-historical-grades" disabled>${icon("upload", "h-3.5 w-3.5")}Guardar</button>
            </div>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_160px_120px]">
            <label class="text-sm font-black text-slate-700">Curso
              <select class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:rounded-2xl sm:px-4 sm:py-3" name="courseId">${courseOptions(PRIMARY_COURSES)}</select>
            </label>
            <label class="text-sm font-black text-slate-700">Materia
              <select class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:rounded-2xl sm:px-4 sm:py-3" name="materiaId">${subjectOptions()}</select>
            </label>
            <label class="text-sm font-black text-slate-700">Trimestre
              <select class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:rounded-2xl sm:px-4 sm:py-3" name="trimestreId">
                <option value="t1">1er trimestre</option>
                <option value="t2">2do trimestre</option>
                <option value="t3">3er trimestre</option>
              </select>
            </label>
            <label class="text-sm font-black text-slate-700">Tipo
              <select class="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold sm:rounded-2xl sm:px-4 sm:py-3" name="tipo">
                <option value="tarea">HACER</option>
                <option value="examen">SABER</option>
              </select>
            </label>
          </div>
          <p class="mt-3 hidden rounded-2xl border px-4 py-3 text-sm font-bold" data-historical-grades-status></p>
        </form>

        <div class="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Tabla editable</p>
              <h3 class="text-base font-black text-slate-900">Pega o rellena notas</h3>
            </div>
            <span class="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700" data-historical-grades-count>0 alumnos</span>
          </div>
          <div class="max-h-[62vh] overflow-auto" data-historical-grades-grid></div>
        </div>

        <div class="mt-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-historical-grades-preview>
          <div class="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">Previsualiza las notas antes de guardar.</div>
        </div>
      </div>
    </section>
  `;
}
function auditPanel() {
  const today = fechaEscolarIso();
  return `
    <section class="space-y-3">
      <div class="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[170px_170px_1fr_90px]">
        <label class="text-xs font-medium text-slate-700">Fecha
          <input class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" type="date" value="${today}" data-audit-date>
        </label>
        <label class="text-xs font-medium text-slate-700">Tipo
          <select class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" data-audit-type>
            <option value="">Todo</option>
            <option value="alumnos">Alumnos</option>
            <option value="usuarios">Usuarios</option>
            <option value="horarios">Horarios</option>
            <option value="sistema">Sistema</option>
          </select>
        </label>
        <label class="text-xs font-medium text-slate-700 sm:col-span-2 lg:col-span-1">Buscar
          <input class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-school-green focus:ring-4 focus:ring-school-green/10" type="search" placeholder="Usuario, curso, alumno o accion" data-audit-search>
        </label>
        <button class="self-end rounded-lg bg-school-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800" data-action="load-audit">Ver</button>
      </div>
      <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div><p class="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">Historial</p><h3 class="mt-0.5 text-sm font-semibold text-slate-900"><span data-audit-count>0</span> movimientos</h3></div>
          <span class="rounded-full bg-green-50 px-3 py-1 text-[10px] font-medium text-green-700" data-audit-status>Listo</span>
        </div>
        <div class="overflow-x-auto">
        <table class="min-w-[760px] w-full text-left text-xs">
          <thead class="bg-[#123d24] text-white"><tr><th class="px-4 py-2.5 font-medium">Hora</th><th class="px-4 py-2.5 font-medium">Usuario</th><th class="px-4 py-2.5 font-medium">Tipo</th><th class="px-4 py-2.5 font-medium">Accion</th><th class="px-4 py-2.5 font-medium">Detalle</th><th class="px-4 py-2.5"></th></tr></thead>
          <tbody class="divide-y divide-slate-100" data-audit-list><tr><td colspan="6" class="px-4 py-4 text-slate-500">Cargando...</td></tr></tbody>
        </table>
        </div>
      </div>
      <div class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/50 p-4" data-audit-modal>
        <div class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-2xl">
          <div class="flex items-center justify-between border-b border-slate-100 p-4">
            <h3 class="text-lg font-semibold text-slate-900">Detalle de auditoria</h3>
            <button class="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" data-action="close-audit-modal" aria-label="Cerrar">${icon("x", "h-4 w-4")}</button>
          </div>
          <div class="space-y-4 p-4 sm:p-5" data-audit-detail></div>
        </div>
      </div>
    </section>
  `;
}
export function AdminModule(route) {
  const pages = {
    "/admin/alumnos": ["Alumnos", "Registro y accesos", "Alumnos por curso", "", studentsPanel()],
    "/admin/docentes": ["Docentes", "Asignacion docente", "Crear docentes en Firebase Authentication y guardar su perfil docente en Firestore.", "", userCreatePanel("docente", "Docentes", "Luego se les asignara cursos y materias desde este mismo modulo.")],
    "/admin/director": ["Director", "Usuario director", "Crear o actualizar el usuario visualizador del colegio.", "", userCreatePanel("director", "Director", "El director podra ingresar a reportes, asistencias y auditoria.")],
    "/admin/horarios": ["Horarios", "Horario escolar", "Configurar materias por curso con colores fijos por materia.", "", schedulePanel()],
    "/admin/carga-historica": ["Carga Historica", "Importar datos ya registrados", "Cargar asistencias anteriores directamente al registro normal.", "", historicalPanel()],
    "/admin/auditoria": ["Auditoria", "Movimientos", "Historial claro de cambios importantes hechos por admin, docente y director.", "", auditPanel()]
  };
  const page = pages[route] || pages["/admin/alumnos"];
  const statsSection = page[3] ? `<section class="mb-4 grid gap-3 sm:grid-cols-3">${page[3]}</section>` : "";
  return AdminShell(route, `${statsSection}<section data-admin-page>${page[4]}</section>`, {
    title: page[1],
    subtitle: page[2]
  });
}
