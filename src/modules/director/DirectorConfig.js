import { DirectorShell, directorCard, directorStat } from "./DirectorShell.js";

export function DirectorConfig() {
  const content = `
    <section class="grid gap-4 md:grid-cols-3">
      ${directorStat("Gestion", "2026", "Gestion escolar", "calendar-days", "bg-school-green text-white")}
      ${directorStat("Trimestre", "Actual", "Configurado por sistema", "panel-top", "bg-school-gold text-white")}
      ${directorStat("Seguridad", "Activa", "Usuarios protegidos", "shield-check", "bg-blue-600 text-white")}
    </section>
    <section class="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
      ${directorCard("Gestion general", `
        <div class="grid gap-3">
          <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-xs font-black uppercase text-slate-400">Unidad educativa</p>
            <h3 class="mt-1 font-black text-slate-900">Ecologica Nueva Bolivia</h3>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-xs font-black uppercase text-slate-400">Modo de trabajo</p>
            <h3 class="mt-1 font-black text-slate-900">Online con Firebase Authentication y Firestore</h3>
          </div>
        </div>
      `)}
      ${directorCard("Permisos del director", `
        <ul class="grid gap-2 text-sm font-semibold text-slate-600">
          <li class="rounded-xl bg-green-50 px-3 py-2 text-school-green">Puede visualizar asistencia, notas, reportes y auditoria.</li>
          <li class="rounded-xl bg-amber-50 px-3 py-2 text-amber-700">No modifica notas ni asistencia del docente.</li>
          <li class="rounded-xl bg-blue-50 px-3 py-2 text-blue-700">Puede revisar estado general del sistema.</li>
        </ul>
      `)}
    </section>
  `;
  return DirectorShell("/director/configuracion", content, {
    title: "Configuracion",
    subtitle: "Gestion general del sistema."
  });
}
