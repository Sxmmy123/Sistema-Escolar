import { DAYS, findSubject } from "../../data/catalog.js";
import { materiasInicial } from "../../services/modeloInicial.js";
import { e, paginaInicial, vacioInicial } from "./ComponentesInicial.js";

export function HorarioInicial(state) {
  const schedule = state.data.leer("schedule", state.courseId);
  if (!schedule) return paginaInicial(state, "Horario", vacioInicial("Cargando horario...", "", "calendar-days"));
  const subjects = materiasInicial(schedule);
  const hours = (value) => `<span class="initial-hours">${String(value || "").split(" - ").map((part) => `<span>${e(part)}</span>`).join('<span class="initial-hours-separator"> - </span>')}</span>`;
  const legend = `<div class="initial-subject-legend" aria-label="Materias del horario">${subjects.map((subject) => `<span><i style="background:${subject.color}"></i>${e(subject.nombre)}</span>`).join("")}</div>`;
  const header = `<thead><tr><th>Hora</th>${["Lunes", "Martes", "Miercoles", "Jueves", "Viernes"].map((label, index) => `<th><span class="initial-wide-label">${label}</span><abbr class="initial-compact-label" title="${label}">${DAYS[index].label}</abbr></th>`).join("")}</tr></thead>`;
  const rows = schedule.periodos.map((period) => {
    if (period.recreo) return `<tr class="initial-break"><th>${hours(period.hora)}</th><td colspan="5">Recreo</td></tr>`;
    const cells = DAYS.map((day) => {
      const value = schedule.clases?.[period.id]?.[day.id];
      const subject = findSubject(value);
      return `<td>${value ? `<span class="initial-schedule-subject" style="--initial-subject-color:${subject?.color || "#f1f5f9"}" title="${e(subject?.nombre || value)}"><span class="initial-wide-label">${e(subject?.nombre || value)}</span><span class="initial-compact-label">${e(subject?.corto || value)}</span></span>` : `<span class="initial-muted">—</span>`}</td>`;
    }).join("");
    return `<tr><th>${hours(period.hora)}</th>${cells}</tr>`;
  }).join("");
  return paginaInicial(state, "Horario", `${legend}<div class="initial-table-wrap"><table class="initial-table initial-schedule">${header}<tbody>${rows}</tbody></table></div>`);
}
