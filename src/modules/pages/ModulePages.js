export { AdminModule } from "../admin/PaginasAdmin.js";
export { DocenteModule } from "../docente/PaginasDocente.js";

import { appShell, statCard } from "../../ui/shell.js";
import { SUBJECTS } from "../../data/catalog.js";

function hero(kicker, title, text) {
  return `
    <section class="rounded-2xl bg-white p-4 shadow-soft sm:p-5">
      <p class="text-[11px] font-black uppercase tracking-[.16em] text-school-navy sm:text-sm">${kicker}</p>
      <h1 class="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">${title}</h1>
      <p class="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 sm:text-base sm:leading-7">${text}</p>
    </section>
  `;
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

export function DirectorModule(route) {
  const pages = {
    "/director/asistencias": ["Asistencias", "Vista general", "Resumen por curso y trimestre para supervision.", `<div class="grid gap-4 sm:grid-cols-4">${statCard("Asistencia", "0%", "check-circle")} ${statCard("Atrasos", "0%", "clock")} ${statCard("Permisos", "0%", "file-check")} ${statCard("Faltas", "0%", "x-circle")}</div>`, simpleTable(["Curso", "Asistencia", "Atraso", "Permiso", "Falta"], [["Primero A", "0%", "0%", "0%", "0%"]])],
    "/director/reportes": ["Reportes", "Clasificacion academica", "Estadisticas por curso y materia para detectar avance y riesgo academico.", `<div class="flex gap-2 overflow-x-auto pb-2">${SUBJECTS.map((s, i) => `<button class="shrink-0 rounded-2xl border px-4 py-2 text-sm font-black ${i === 0 ? "border-school-navy bg-school-navy text-white" : "border-slate-200 bg-white text-slate-600"}">${s.nombre}</button>`).join("")}</div>`, simpleTable(["Curso", "Notas altas", "Notas bajas", "Promedio"], [["Primero A", "0%", "0%", "-"]])],
    "/director/auditoria": ["Auditoria", "Historial", "Revision de movimientos del sistema con detalle visual y tecnico.", `<div class="grid gap-3 sm:grid-cols-3"><input class="rounded-2xl border border-slate-200 px-4 py-3 font-semibold" type="date"><select class="rounded-2xl border border-slate-200 px-4 py-3 font-semibold"><option>Todo</option></select><button class="rounded-2xl bg-school-navy px-4 py-3 font-black text-white">Ver</button></div>`, simpleTable(["Hora", "Usuario", "Tipo", "Accion"], [["--:--", "docente", "asistencia", "actualizado"]])]
  };
  const page = pages[route] || pages["/director/asistencias"];
  return appShell("director", route, `${hero("Director", page[0], page[2])}<section class="mt-6">${page[3]}</section><section class="mt-6">${page[4]}</section>`);
}











