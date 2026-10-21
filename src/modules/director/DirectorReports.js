import { icon } from "../../ui/dom.js";
import { DirectorShell } from "./DirectorShell.js";

function reportLink(title, href, iconName) {
  return `
    <a href="${href}" class="flex min-h-16 items-center gap-3 py-4 text-sm font-medium text-slate-900 hover:text-school-green">${icon(iconName, "h-5 w-5 text-school-green")}<span class="flex-1">${title}</span>${icon("arrow-right", "h-4 w-4")}</a>
  `;
}

export function DirectorReports() {
  const content = `
    <section class="border-b border-slate-200 pb-5">
      <h2 class="text-lg font-semibold text-slate-900">Consultas disponibles</h2>
      <p class="mt-2 text-sm text-slate-600">La exportacion de informes para direccion aun no esta habilitada.</p>
    </section>
    <nav class="divide-y divide-slate-200" aria-label="Consultas para informes">
      ${reportLink("Notas por curso y materia", "#/director/notas", "notebook-tabs")}
      ${reportLink("Asistencia y seguimiento", "#/director/asistencia", "clipboard-check")}
      ${reportLink("Resumen individual del estudiante", "#/director/estudiantes", "users")}
    </nav>
  `;
  return DirectorShell("/director/reportes", content, {
    title: "Reportes",
    subtitle: "Consultas del sistema."
  });
}
