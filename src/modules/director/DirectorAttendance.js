import {
  COURSES,
  attendancePercent,
  attendanceTotals,
  listDirectorAttendance
} from "../../services/directorData.js";
import { DirectorShell, directorCard, directorStat } from "./DirectorShell.js";

function compactBar(totals, total) {
  const parts = [
    ["presente", "bg-school-green"],
    ["atraso", "bg-school-gold"],
    ["permiso", "bg-blue-500"],
    ["falta", "bg-red-500"]
  ];
  return `
    <div class="flex h-5 overflow-hidden rounded-full bg-slate-100">
      ${parts.map(([key, color]) => {
        const value = total ? Math.round(((totals[key] || 0) / total) * 100) : 0;
        return value ? `<div class="${color}" style="width:${value}%"></div>` : "";
      }).join("")}
    </div>
  `;
}

function tableRows(records = []) {
  const byCourse = records.reduce((acc, item) => {
    acc[item.cursoId] = acc[item.cursoId] || [];
    acc[item.cursoId].push(item);
    return acc;
  }, {});
  return COURSES.map((course) => {
    const rows = byCourse[course.id] || [];
    const totals = attendanceTotals(rows);
    return `
      <tr class="border-b border-slate-100 last:border-0">
        <td class="py-2 pr-3 font-black text-slate-900">${course.nombre}</td>
        <td class="py-2 pr-3 text-center font-black text-school-green">${totals.presente || 0}</td>
        <td class="py-2 pr-3 text-center font-black text-amber-600">${totals.atraso || 0}</td>
        <td class="py-2 pr-3 text-center font-black text-blue-600">${totals.permiso || 0}</td>
        <td class="py-2 pr-3 text-center font-black text-red-600">${totals.falta || 0}</td>
        <td class="py-2 pr-3 min-w-40">${compactBar(totals, rows.length)}</td>
        <td class="py-2 text-right font-black text-slate-900">${attendancePercent(rows)}%</td>
      </tr>
    `;
  }).join("");
}

export function DirectorAttendance() {
  const content = `
    <section class="grid gap-3 md:grid-cols-4">
      <div data-director-att-stat="presente">${directorStat("Presentes", "0", "Hoy", "check-circle-2", "bg-school-green text-white")}</div>
      <div data-director-att-stat="atraso">${directorStat("Atrasos", "0", "Hoy", "clock", "bg-school-gold text-white")}</div>
      <div data-director-att-stat="permiso">${directorStat("Licencias", "0", "Hoy", "file-check", "bg-blue-600 text-white")}</div>
      <div data-director-att-stat="falta">${directorStat("Faltas", "0", "Hoy", "x-circle", "bg-red-500 text-white")}</div>
    </section>
    <section class="mt-4">
      ${directorCard("Asistencia de hoy por curso", `
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-100 text-xs font-black uppercase text-slate-500">
                <th class="py-2 pr-3">Curso</th><th class="pr-3 text-center">P</th><th class="pr-3 text-center">A</th><th class="pr-3 text-center">L</th><th class="pr-3 text-center">F</th><th class="pr-3">Distribucion</th><th class="text-right">%</th>
              </tr>
            </thead>
            <tbody data-director-attendance-table>
              <tr><td colspan="7" class="py-4 font-bold text-slate-500">Cargando asistencia...</td></tr>
            </tbody>
          </table>
        </div>
        <div class="mt-4 flex flex-wrap gap-2 text-xs font-black">
          <span class="rounded-full bg-green-50 px-3 py-1.5 text-school-green">P Presente</span>
          <span class="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">A Atraso</span>
          <span class="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">L Licencia</span>
          <span class="rounded-full bg-red-50 px-3 py-1.5 text-red-700">F Falta</span>
        </div>
      `)}
    </section>
  `;
  return DirectorShell("/director/asistencia", content, {
    title: "Asistencia",
    subtitle: "Presente, falta, atraso, licencia y estadisticas."
  });
}

export async function bindDirectorAttendance(route) {
  if (route !== "/director/asistencia" && route !== "/director/asistencias") return;
  try {
    const records = await listDirectorAttendance();
    const totals = attendanceTotals(records);
    const map = {
      presente: ["Presentes", "check-circle-2", "bg-school-green text-white"],
      atraso: ["Atrasos", "clock", "bg-school-gold text-white"],
      permiso: ["Licencias", "file-check", "bg-blue-600 text-white"],
      falta: ["Faltas", "x-circle", "bg-red-500 text-white"]
    };
    Object.entries(map).forEach(([key, [label, iconName, tone]]) => {
      const node = document.querySelector(`[data-director-att-stat="${key}"]`);
      if (node) node.innerHTML = directorStat(label, totals[key] || 0, "Hoy", iconName, tone);
    });
    const tbody = document.querySelector("[data-director-attendance-table]");
    if (tbody) tbody.innerHTML = tableRows(records);
  } catch {
    const tbody = document.querySelector("[data-director-attendance-table]");
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-4 font-bold text-red-600">No se pudo cargar asistencia.</td></tr>`;
  }
}
