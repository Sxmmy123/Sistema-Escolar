import { SUBJECTS, assignmentText, listDirectorTeachers } from "../../services/directorData.js";
import { DirectorShell, directorCard, directorStat } from "./DirectorShell.js";

export function DirectorTeachers() {
  const content = `
    <section class="grid gap-4 md:grid-cols-3">
      <div data-director-teachers-total>${directorStat("Docentes activos", "0", "Con cuenta habilitada", "graduation-cap", "bg-school-green text-white")}</div>
      ${directorStat("Materias", SUBJECTS.length, "Catalogo escolar", "book-open", "bg-school-gold text-white")}
      <div data-director-teachers-assigned>${directorStat("Asignaciones", "0", "Cursos y materias", "network", "bg-blue-600 text-white")}</div>
    </section>
    <section class="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      ${directorCard("Docentes y asignaciones", `
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead><tr class="border-b border-slate-100 text-xs font-black uppercase text-slate-500"><th class="py-3">Docente</th><th>Usuario</th><th>Asignacion</th><th>Estado</th></tr></thead>
            <tbody data-director-teachers-list>
              <tr><td colspan="4" class="py-4 font-bold text-slate-500">Cargando docentes...</td></tr>
            </tbody>
          </table>
        </div>
      `)}
      ${directorCard("Materias disponibles", `
        <div class="flex flex-wrap gap-2">
          ${SUBJECTS.map((subject) => `<span class="rounded-full px-3 py-1.5 text-xs font-black text-slate-800" style="background:${subject.color}">${subject.nombre}</span>`).join("")}
        </div>
      `)}
    </section>
  `;
  return DirectorShell("/director/docentes", content, {
    title: "Docentes",
    subtitle: "Docentes, materias y asignaciones."
  });
}

export async function bindDirectorTeachers(route) {
  if (route !== "/director/docentes") return;
  const tbody = document.querySelector("[data-director-teachers-list]");
  try {
    const teachers = await listDirectorTeachers();
    const assignedCount = teachers.filter((teacher) => Object.keys(teacher.asignaciones || {}).length).length;
    document.querySelector("[data-director-teachers-total]").innerHTML = directorStat("Docentes activos", teachers.length, "Con cuenta habilitada", "graduation-cap", "bg-school-green text-white");
    document.querySelector("[data-director-teachers-assigned]").innerHTML = directorStat("Asignaciones", assignedCount, "Cursos y materias", "network", "bg-blue-600 text-white");
    if (!tbody) return;
    tbody.innerHTML = teachers.length ? teachers.map((teacher) => `
      <tr class="border-b border-slate-100 last:border-0">
        <td class="py-3 font-black text-slate-900">${teacher.nombre || "Sin nombre"}</td>
        <td class="py-3 font-semibold text-slate-500">${teacher.usuario || "-"}</td>
        <td class="py-3 font-semibold text-slate-600">${assignmentText(teacher.asignaciones)}</td>
        <td class="py-3"><span class="rounded-full bg-green-50 px-2.5 py-1 text-xs font-black text-school-green">Activo</span></td>
      </tr>
    `).join("") : `<tr><td colspan="4" class="py-4 font-bold text-slate-500">No hay docentes registrados.</td></tr>`;
  } catch (error) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="py-4 font-bold text-red-600">No se pudo cargar docentes.</td></tr>`;
  }
}
