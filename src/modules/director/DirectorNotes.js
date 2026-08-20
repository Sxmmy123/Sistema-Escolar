import {
  COURSES,
  SUBJECTS,
  calculateCourseGrades,
  listDirectorActivities,
  listDirectorGrades,
  listDirectorStudents,
  subjectName
} from "../../services/directorData.js";
import { DirectorShell, directorCard, directorStat } from "./DirectorShell.js";

function courseRow(summary) {
  return `
    <tr class="border-b border-slate-100 last:border-0">
      <td class="py-2 pr-3 font-black text-slate-900">${COURSES.find((course) => course.id === summary.courseId)?.nombre || summary.courseId}</td>
      <td class="py-2 pr-3 text-center font-black ${summary.average < 51 ? "text-red-600" : "text-school-green"}">${summary.average || "-"}</td>
      <td class="py-2 pr-3 text-center font-bold text-school-green">${summary.approved}</td>
      <td class="py-2 pr-3 text-center font-bold text-red-600">${summary.risk}</td>
      <td class="py-2 text-center font-bold text-amber-700">${summary.pending}</td>
    </tr>
  `;
}

export function DirectorNotes() {
  const content = `
    <section class="grid gap-4 md:grid-cols-4">
      <div data-director-note-stat="promedio">${directorStat("Promedio general", "0", "Sobre 100", "trending-up", "bg-school-green text-white")}</div>
      <div data-director-note-stat="aprobados">${directorStat("Aprobados", "0", "Mayor a 51", "user-check", "bg-emerald-600 text-white")}</div>
      <div data-director-note-stat="riesgo">${directorStat("En riesgo", "0", "Menor a 51", "badge-alert", "bg-school-gold text-white")}</div>
      <div data-director-note-stat="pendientes">${directorStat("Pendientes", "0", "Sin revisar = 35", "clipboard-list", "bg-red-500 text-white")}</div>
    </section>
    <section class="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      ${directorCard("Rendimiento por curso", `
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead><tr class="border-b border-slate-100 text-xs font-black uppercase text-slate-500"><th class="py-2 pr-3">Curso</th><th class="pr-3 text-center">Prom.</th><th class="pr-3 text-center">Aprob.</th><th class="pr-3 text-center">Riesgo</th><th class="text-center">Pend.</th></tr></thead>
            <tbody data-director-notes-course-table>
              <tr><td colspan="5" class="py-4 font-bold text-slate-500">Cargando calificaciones...</td></tr>
            </tbody>
          </table>
        </div>
      `)}
      ${directorCard("Materias con calificacion", `
        <div class="grid gap-2" data-director-notes-subjects>
          ${SUBJECTS.map((subject) => `<div class="rounded-2xl px-3 py-2 text-sm font-black text-slate-800" style="background:${subject.color}">${subject.nombre}</div>`).join("")}
        </div>
        <p class="mt-4 text-sm font-semibold leading-6 text-slate-500">Las actividades sin nota registrada se consideran 35 para reflejar pendientes, ausentes o no presentados.</p>
      `)}
    </section>
  `;
  return DirectorShell("/director/notas", content, {
    title: "Notas",
    subtitle: "Calificaciones, promedios, trimestres y rendimiento."
  });
}

export async function bindDirectorNotes(route) {
  if (route !== "/director/notas") return;
  try {
    const [students, activities, grades] = await Promise.all([
      listDirectorStudents(),
      listDirectorActivities(),
      listDirectorGrades()
    ]);
    const summaries = COURSES.map((course) => calculateCourseGrades({ students, activities, grades, courseId: course.id }));
    const activeSummaries = summaries.filter((summary) => summary.totalCells > 0);
    const totalAverage = activeSummaries.length
      ? Math.round(activeSummaries.reduce((sum, item) => sum + item.average, 0) / activeSummaries.length)
      : 0;
    const approved = activeSummaries.reduce((sum, item) => sum + item.approved, 0);
    const risk = activeSummaries.reduce((sum, item) => sum + item.risk, 0);
    const pending = activeSummaries.reduce((sum, item) => sum + item.pending, 0);
    const statData = {
      promedio: ["Promedio general", totalAverage, "Sobre 100", "trending-up", "bg-school-green text-white"],
      aprobados: ["Aprobados", approved, "Mayor a 51", "user-check", "bg-emerald-600 text-white"],
      riesgo: ["En riesgo", risk, "Menor a 51", "badge-alert", "bg-school-gold text-white"],
      pendientes: ["Pendientes", pending, "Sin revisar = 35", "clipboard-list", "bg-red-500 text-white"]
    };
    Object.entries(statData).forEach(([key, args]) => {
      const node = document.querySelector(`[data-director-note-stat="${key}"]`);
      if (node) node.innerHTML = directorStat(...args);
    });
    const tbody = document.querySelector("[data-director-notes-course-table]");
    if (tbody) tbody.innerHTML = activeSummaries.length ? activeSummaries.map(courseRow).join("") : `<tr><td colspan="5" class="py-4 font-bold text-slate-500">Todavia no hay actividades calificables.</td></tr>`;
    const subjectBox = document.querySelector("[data-director-notes-subjects]");
    if (subjectBox) {
      const subjectIds = [...new Set(activities.map((activity) => activity.materiaId))];
      subjectBox.innerHTML = subjectIds.length
        ? subjectIds.map((subjectId) => `<div class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800">${subjectName(subjectId)}</div>`).join("")
        : `<div class="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-500">Sin actividades registradas.</div>`;
    }
  } catch {
    const tbody = document.querySelector("[data-director-notes-course-table]");
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="py-4 font-bold text-red-600">No se pudo cargar notas.</td></tr>`;
  }
}
