import { COURSES, DAYS, SUBJECTS, listDirectorSchedules, subjectShort } from "../../services/directorData.js";
import { DirectorShell, directorCard, directorStat } from "./DirectorShell.js";

export function DirectorCoursesSchedules() {
  const content = `
    <section class="grid gap-4 md:grid-cols-3">
      ${directorStat("Cursos", COURSES.length, "Pre Inicial - Inicial a Sexto A", "school", "bg-school-green text-white")}
      <div data-director-schedules-total>${directorStat("Horarios", "0", "Cursos con horario", "calendar-days", "bg-school-gold text-white")}</div>
      ${directorStat("Materias", SUBJECTS.length, "Asignables", "book-open", "bg-blue-600 text-white")}
    </section>
    <section class="mt-4 grid gap-4 xl:grid-cols-[1fr_1.3fr]">
      ${directorCard("Cursos", `
        <div class="grid gap-3 sm:grid-cols-2" data-director-courses-list>
          ${COURSES.map((course) => `
            <article class="rounded-2xl border border-slate-200 bg-white p-4">
              <p class="text-xs font-black uppercase text-slate-400">${course.corto}</p>
              <h3 class="mt-1 font-black text-slate-900">${course.nombre}</h3>
              <span class="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500" data-schedule-state="${course.id}">Verificando...</span>
            </article>
          `).join("")}
        </div>
      `)}
      ${directorCard("Vista general del horario", `
        <div class="overflow-x-auto">
          <div class="min-w-[720px] rounded-2xl border border-slate-200">
            <div class="grid grid-cols-5 bg-school-green text-white">
              ${DAYS.map((day) => `<div class="border-r border-white/15 px-4 py-3 text-center font-black last:border-0">${day.label}</div>`).join("")}
            </div>
            <div class="grid grid-cols-5" data-director-schedule-preview>
              ${DAYS.map((day, index) => `
                <div class="min-h-56 border-r border-slate-200 p-3 last:border-0 ${index % 2 ? "bg-white" : "bg-slate-50"}">
                  <div class="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-500">Cargando ${day.label}...</div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `)}
    </section>
  `;
  return DirectorShell("/director/cursos-horarios", content, {
    title: "Cursos y Horarios",
    subtitle: "Cursos, materias, horarios y asignacion docente."
  });
}

function hasClasses(schedule) {
  return Object.values(schedule?.clases || {}).some((days) => Object.values(days || {}).some(Boolean));
}

export async function bindDirectorCoursesSchedules(route) {
  if (route !== "/director/cursos-horarios") return;
  try {
    const schedules = await listDirectorSchedules();
    const loaded = COURSES.filter((course) => hasClasses(schedules[course.id])).length;
    const total = document.querySelector("[data-director-schedules-total]");
    if (total) total.innerHTML = directorStat("Horarios", loaded, "Cursos con horario", "calendar-days", "bg-school-gold text-white");
    COURSES.forEach((course) => {
      const state = document.querySelector(`[data-schedule-state="${course.id}"]`);
      if (!state) return;
      const ok = hasClasses(schedules[course.id]);
      state.className = `mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${ok ? "bg-green-50 text-school-green" : "bg-red-50 text-red-600"}`;
      state.textContent = ok ? "Horario cargado" : "Pendiente";
    });
    const preview = document.querySelector("[data-director-schedule-preview]");
    if (preview) {
      preview.innerHTML = DAYS.map((day, index) => {
        const items = COURSES.flatMap((course) => {
          const classes = schedules[course.id]?.clases || {};
          return Object.entries(classes).filter(([, days]) => days?.[day.id]).slice(0, 2).map(([, days]) => ({ course, subjectId: days[day.id] }));
        }).slice(0, 6);
        return `
          <div class="min-h-56 border-r border-slate-200 p-3 last:border-0 ${index % 2 ? "bg-white" : "bg-slate-50"}">
            ${items.length ? items.map((item) => `<div class="mb-2 rounded-xl bg-green-50 px-3 py-2 text-xs font-black text-school-green">${item.course.corto} - ${subjectShort(item.subjectId)}</div>`).join("") : `<div class="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-500">Sin datos</div>`}
          </div>
        `;
      }).join("");
    }
  } catch {
    // Mantiene la vista base si Firestore no responde.
  }
}
