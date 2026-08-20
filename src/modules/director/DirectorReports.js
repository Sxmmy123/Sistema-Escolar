import { icon } from "../../ui/dom.js";
import { DirectorShell, directorCard, directorStat } from "./DirectorShell.js";

function reportButton(title, detail, iconName) {
  return `
    <button class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-school-green hover:bg-green-50">
      <span class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-school-sky text-school-green">${icon(iconName, "h-6 w-6")}</span>
      <span>
        <span class="block font-black text-slate-900">${title}</span>
        <span class="text-sm font-semibold text-slate-500">${detail}</span>
      </span>
    </button>
  `;
}

export function DirectorReports() {
  const content = `
    <section class="grid gap-4 md:grid-cols-3">
      ${directorStat("PDF", "Listo", "Informes imprimibles", "file-text", "bg-red-500 text-white")}
      ${directorStat("Excel", "Listo", "Exportacion", "file-spreadsheet", "bg-school-green text-white")}
      ${directorStat("Impresion", "Directa", "Reportes escolares", "printer", "bg-school-gold text-white")}
    </section>
    <section class="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
      ${directorCard("Informes academicos", `
        <div class="grid gap-3">
          ${reportButton("Clasificacion academica", "Rendimiento por curso y materia.", "trophy")}
          ${reportButton("Regularizacion", "Alumnos con pendientes o baja nota.", "badge-alert")}
          ${reportButton("Boleta por alumno", "Resumen individual para seguimiento.", "graduation-cap")}
        </div>
      `)}
      ${directorCard("Informes de asistencia", `
        <div class="grid gap-3">
          ${reportButton("Resumen mensual", "Presentes, atrasos, licencias y faltas.", "clipboard-check")}
          ${reportButton("Asistencia trimestral", "Consolidado por curso.", "calendar-range")}
          ${reportButton("Cursos sin registro", "Control diario de asistencia.", "clock-alert")}
        </div>
      `)}
    </section>
  `;
  return DirectorShell("/director/reportes", content, {
    title: "Reportes",
    subtitle: "Informes, PDF, Excel e impresion."
  });
}
