import { COURSES, SUBJECTS, listDirectorTeachers } from "../../services/directorData.js";
import { cancelCommunication, createCommunication, listActiveCommunications, localDateIso } from "../../services/comunicadosDocentes.js";
import { icon } from "../../ui/dom.js";
import { DirectorShell } from "./DirectorShell.js";
import { escapeDirectorHtml, refreshDirectorIcons } from "./DirectorUtils.js";

let teachersBindingsController = null;
let activeNotices = [];

function communicationDate(item) {
  const date = new Date(`${item.fechaEvento}T${item.horaEvento || "00:00"}:00`);
  return Number.isNaN(date.getTime())
    ? `${item.fechaEvento || ""} ${item.horaEvento || ""}`
    : date.toLocaleString("es-BO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function renderCommunications(items) {
  activeNotices = items;
  const holder = document.querySelector("[data-director-communications-list]");
  if (!holder) return;
  holder.innerHTML = items.length ? items.map((item) => `
    <div class="flex items-start gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-green-50 text-school-green">${icon("megaphone", "h-4 w-4")}</span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-slate-900">${escapeDirectorHtml(item.titulo)}</p>
        <p class="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-600">${escapeDirectorHtml(item.motivo)}</p>
        <p class="mt-1 text-[11px] font-medium text-school-green">${escapeDirectorHtml(communicationDate(item))}</p>
      </div>
      <button type="button" data-cancel-communication="${escapeDirectorHtml(item.id)}" class="shrink-0 rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700" title="Cancelar comunicado">Cancelar</button>
    </div>
  `).join("") : `<p class="py-3 text-sm text-slate-500">No hay comunicados vigentes.</p>`;
  refreshDirectorIcons();
}

function noticeStatus(message, error = false) {
  const status = document.querySelector("[data-director-communication-status]");
  if (!status) return;
  status.textContent = message;
  status.className = `mt-3 text-xs ${error ? "text-red-700" : "text-school-green"}`;
}

async function refreshCommunications() {
  try {
    renderCommunications(await listActiveCommunications());
  } catch (error) {
    const holder = document.querySelector("[data-director-communications-list]");
    if (holder) holder.innerHTML = `<p class="py-3 text-xs text-red-700">No se pudieron cargar los comunicados. Revisa los permisos de Firestore.</p>`;
  }
}

function subjectById(subjectId) {
  return SUBJECTS.find((subject) => subject.id === subjectId) || null;
}

function subjectIds(value) {
  const source = value?.materias || value?.subjects || value;
  if (Array.isArray(source)) return source.map(String).filter(Boolean);
  if (source && typeof source === "object") {
    return Object.keys(source).filter((subjectId) => Boolean(source[subjectId]));
  }
  return [];
}

function assignmentGroups(teacher) {
  const assignments = teacher?.asignaciones || {};
  return COURSES.map((course) => ({
    course,
    subjects: subjectIds(assignments[course.id])
  })).filter(({ course, subjects }) => (
    subjects.length || Object.prototype.hasOwnProperty.call(assignments, course.id)
  ));
}

function groupedAssignments(teacher) {
  const grouped = new Map();
  assignmentGroups(teacher).forEach(({ course, subjects }) => {
    const key = [...subjects].sort().join("|") || "sin-materias";
    const current = grouped.get(key) || { courses: [], subjects };
    current.courses.push(course);
    grouped.set(key, current);
  });
  return [...grouped.values()];
}

function teacherInitials(name) {
  const words = String(name || "Docente").trim().split(/\s+/).filter(Boolean);
  return `${words[0]?.[0] || "D"}${words.length > 1 ? words[words.length - 1][0] : ""}`.toUpperCase();
}

function subjectBadge(subjectId) {
  const subject = subjectById(subjectId);
  return `
    <span class="inline-flex min-h-5 items-center rounded-md border border-slate-200/70 bg-slate-100 px-1.5 py-0.5 text-[8px] font-medium leading-none text-slate-600 sm:min-h-6 sm:px-2 sm:py-1 sm:text-[10px]" title="${escapeDirectorHtml(subject?.nombre || subjectId)}">
      <span class="sm:hidden">${escapeDirectorHtml(subject?.corto || subject?.nombre || subjectId)}</span>
      <span class="hidden sm:inline">${escapeDirectorHtml(subject?.nombre || subjectId)}</span>
    </span>
  `;
}

function teacherCard(teacher) {
  const groups = assignmentGroups(teacher);
  const compactGroups = groupedAssignments(teacher);
  const assignedSubjects = [...new Set(groups.flatMap((group) => group.subjects))];
  return `
    <article class="min-w-0 overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition hover:border-green-200 hover:shadow-[0_5px_14px_rgba(15,23,42,0.09)]">
      <div class="flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
        <div class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-green-50 text-[10px] font-semibold text-school-green ring-1 ring-green-100 sm:h-10 sm:w-10 sm:text-xs">
          ${escapeDirectorHtml(teacherInitials(teacher.nombre))}
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-[10px] font-semibold text-slate-950 sm:text-sm" title="${escapeDirectorHtml(teacher.nombre || "Sin nombre")}">${escapeDirectorHtml(teacher.nombre || "Sin nombre")}</h3>
          <div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] text-slate-500 sm:gap-x-3 sm:text-[10px]">
            <span class="inline-flex items-center gap-1">${icon("school", "h-2.5 w-2.5 text-school-green sm:h-3.5 sm:w-3.5")} ${groups.length} curso${groups.length === 1 ? "" : "s"}</span>
            <span class="inline-flex items-center gap-1">${icon("book-open", "h-2.5 w-2.5 text-amber-500 sm:h-3.5 sm:w-3.5")} ${assignedSubjects.length} materia${assignedSubjects.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>
      <div class="border-t border-slate-100 px-2.5 sm:px-3">
        ${compactGroups.length ? compactGroups.map(({ courses, subjects }) => `
          <div class="border-b border-slate-100 py-2 last:border-0 sm:py-2.5">
            <div class="flex min-w-0 flex-wrap gap-1">
              ${courses.map((course) => `
                <span class="inline-flex min-h-5 items-center gap-1 rounded-md bg-green-50 px-1.5 py-0.5 text-[8px] font-medium text-school-green sm:min-h-6 sm:px-2 sm:py-1 sm:text-[10px]">
                  ${icon("users-round", "h-2.5 w-2.5 sm:h-3 sm:w-3")}
                  <span class="sm:hidden">${escapeDirectorHtml(course.corto)}</span>
                  <span class="hidden sm:inline">${escapeDirectorHtml(course.nombre)}</span>
                </span>
              `).join("")}
            </div>
            <div class="mt-1.5 flex min-w-0 flex-wrap gap-1 sm:mt-2 sm:gap-1.5">
              ${subjects.length ? subjects.map(subjectBadge).join("") : `<span class="py-1 text-[10px] text-slate-400 sm:text-[11px]">Sin materias asignadas</span>`}
            </div>
          </div>
        `).join("") : `
          <div class="flex items-center gap-2 py-3 text-[11px] text-amber-700">
            ${icon("circle-alert", "h-4 w-4")} Sin cursos asignados
          </div>
        `}
      </div>
    </article>
  `;
}

function renderTeacherList(teachers) {
  const list = document.querySelector("[data-director-teachers-list]");
  if (!list) return;
  list.innerHTML = teachers.length
    ? teachers.map(teacherCard).join("")
    : `
      <div class="col-span-full rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
        ${icon("users", "mx-auto h-6 w-6 text-slate-300")}
        <p class="mt-2 text-sm font-medium text-slate-700">No hay docentes registrados</p>
      </div>
    `;
  refreshDirectorIcons();
}

export function DirectorTeachers() {
  const content = `
    <section class="mb-5 border-b border-slate-200 pb-4" data-director-communications>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-slate-950">Comunicados al plantel</h2>
          <p class="mt-0.5 text-xs text-slate-600">Aparecen primero en la campana de todos los docentes hasta el final del dia indicado.</p>
        </div>
        <button type="button" data-open-communication class="inline-flex items-center gap-2 rounded-md bg-school-green px-3 py-2 text-sm font-medium text-white hover:bg-green-800">${icon("megaphone", "h-4 w-4")} Nuevo comunicado</button>
      </div>
      <div class="mt-3 divide-y divide-slate-100" data-director-communications-list>
        <p class="py-3 text-sm text-slate-500">Cargando comunicados...</p>
      </div>
    </section>
    <section class="grid grid-cols-2 items-start gap-2 sm:gap-3 lg:grid-cols-3" data-director-teachers-list>
      <div class="col-span-full rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">Cargando docentes...</div>
    </section>
    <div class="fixed inset-0 z-[60] hidden items-center justify-center bg-slate-950/55 p-3 sm:p-5" data-communication-modal>
      <section class="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="communication-title">
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 id="communication-title" class="text-base font-semibold text-slate-950">Nuevo comunicado</h2>
          <button type="button" data-close-communication class="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Cerrar">${icon("x", "h-4 w-4")}</button>
        </div>
        <form data-communication-form class="space-y-4 p-4 sm:p-5">
          <label class="block text-sm text-slate-700">Asunto
            <input name="titulo" maxlength="100" required placeholder="Reunion de docentes" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-school-green">
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="block text-sm text-slate-700">Fecha
              <input name="fechaEvento" type="date" min="${localDateIso()}" required class="mt-1 block w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-school-green">
            </label>
            <label class="block text-sm text-slate-700">Hora
              <input name="horaEvento" type="time" required class="mt-1 block w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-school-green">
            </label>
          </div>
          <label class="block text-sm text-slate-700">Motivo y detalles
            <textarea name="motivo" maxlength="500" rows="4" required placeholder="Temas a tratar y lugar de reunion" class="mt-1 block w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-school-green"></textarea>
          </label>
          <p class="text-xs text-slate-600">Se enviara a todos los docentes. No se necesita seleccionar destinatarios.</p>
          <p data-director-communication-status class="hidden"></p>
          <div class="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" data-close-communication class="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">Cancelar</button>
            <button type="submit" class="rounded-md bg-school-green px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Publicar</button>
          </div>
        </form>
      </section>
    </div>
  `;
  return DirectorShell("/director/docentes", content, {
    title: "Docentes",
    subtitle: "Cursos y materias asignadas al plantel docente."
  });
}

export async function bindDirectorTeachers(route) {
  teachersBindingsController?.abort();
  if (route !== "/director/docentes") return;
  teachersBindingsController = new AbortController();
  const { signal } = teachersBindingsController;
  const list = document.querySelector("[data-director-teachers-list]");
  const modal = document.querySelector("[data-communication-modal]");
  const form = document.querySelector("[data-communication-form]");
  const openModal = () => {
    if (!modal) return;
    form?.reset();
    const date = form?.querySelector('[name="fechaEvento"]');
    if (date) date.min = localDateIso();
    if (date) date.value = localDateIso();
    noticeStatus("");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    form?.querySelector('[name="titulo"]')?.focus();
  };
  const closeModal = () => {
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
  };
  document.querySelector("[data-open-communication]")?.addEventListener("click", openModal, { signal });
  modal?.querySelectorAll("[data-close-communication]").forEach((button) => button.addEventListener("click", closeModal, { signal }));
  modal?.addEventListener("click", (event) => { if (event.target === modal) closeModal(); }, { signal });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); }, { signal });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    const values = new FormData(form);
    button.disabled = true;
    noticeStatus("Publicando...");
    try {
      await createCommunication(Object.fromEntries(values.entries()));
      closeModal();
      await refreshCommunications();
    } catch (error) {
      noticeStatus(error?.code === "permission-denied" ? "Sin permiso para publicar. Actualiza las reglas de Firestore." : (error.message || "No se pudo publicar."), true);
    } finally {
      button.disabled = false;
    }
  }, { signal });
  document.querySelector("[data-director-communications]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-cancel-communication]");
    if (!button) return;
    const item = activeNotices.find((notice) => notice.id === button.dataset.cancelCommunication);
    if (!item || !confirm(`Cancelar el comunicado "${item.titulo}" para todos los docentes?`)) return;
    button.disabled = true;
    try {
      await cancelCommunication(item);
      await refreshCommunications();
    } catch (error) {
      button.disabled = false;
      alert(error?.code === "permission-denied" ? "Sin permiso para cancelar. Actualiza las reglas de Firestore." : (error.message || "No se pudo cancelar."));
    }
  }, { signal });
  refreshCommunications();
  try {
    const teachers = await listDirectorTeachers();
    renderTeacherList(teachers);
  } catch (error) {
    if (list) {
      list.innerHTML = `<div class="col-span-full rounded-lg border border-red-100 bg-red-50 px-4 py-8 text-center text-sm text-red-700">No se pudo cargar la informacion de docentes.</div>`;
    }
  }
}
