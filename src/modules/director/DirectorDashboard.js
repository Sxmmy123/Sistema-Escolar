import { icon } from "../../ui/dom.js";
import {
  COURSES,
  activeCoursesWithCounts,
  attendancePercent,
  attendanceTotals,
  calculateCourseGrades,
  listDirectorAttendance,
  listDirectorAudit,
  listDirectorActivities,
  listDirectorGrades,
  listDirectorStudents,
  listDirectorTeachers
} from "../../services/directorData.js";
import { DirectorShell, directorCard, directorStat } from "./DirectorShell.js";

function progressRow(course, percent, tone = "bg-school-green") {
  return `
    <div class="grid grid-cols-[96px_1fr_42px] items-center gap-3 text-sm font-bold">
      <span class="truncate text-slate-700">${course}</span>
      <div class="h-3 overflow-hidden rounded-full bg-slate-100">
        <div class="h-full rounded-full ${tone}" style="width:${Math.max(0, Math.min(100, percent))}%"></div>
      </div>
      <span class="text-right font-black text-slate-900">${percent}%</span>
    </div>
  `;
}

function alertItem(title, detail, time, tone, iconName) {
  return `
    <article class="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0">
      <div class="grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${tone}">${icon(iconName, "h-5 w-5")}</div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-black text-slate-900">${title}</p>
        <p class="truncate text-xs font-semibold text-slate-500">${detail}</p>
      </div>
      <span class="text-xs font-bold text-slate-500">${time}</span>
    </article>
  `;
}

function activityItem(title, time, tone, iconName) {
  return `
    <article class="flex items-center gap-3 py-2">
      <div class="grid h-8 w-8 shrink-0 place-items-center rounded-xl ${tone} text-white">${icon(iconName, "h-4 w-4")}</div>
      <p class="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">${title}</p>
      <span class="text-xs font-semibold text-slate-500">${time}</span>
    </article>
  `;
}

function riskRows(rows = []) {
  if (!rows.length) {
    return `<div class="rounded-2xl border border-dashed border-green-200 bg-green-50 p-5 text-sm font-bold text-green-800">Sin estudiantes en riesgo con las calificaciones actuales.</div>`;
  }
  return `
    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead><tr class="border-b border-slate-100 text-xs font-black uppercase text-slate-500"><th class="py-3">Estudiante</th><th>Curso</th><th>Prom.</th><th>Situacion</th></tr></thead>
        <tbody>
          ${rows.map(([name, course, score, status]) => `
            <tr class="border-b border-slate-100 last:border-0">
              <td class="py-3 font-bold text-slate-800">${name}</td>
              <td class="font-semibold text-slate-600">${course}</td>
              <td class="font-black text-slate-900">${score}</td>
              <td class="${status === "Critico" ? "text-red-600" : "text-amber-600"} font-black">${status}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function DirectorDashboard() {
  const content = `
    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div data-director-stat-card="estudiantes">${directorStat("Estudiantes", "0", "Activos", "users", "bg-blue-600 text-white")}</div>
      <div data-director-stat-card="docentes">${directorStat("Docentes", "0", "Activos", "graduation-cap", "bg-school-green text-white")}</div>
      <div data-director-stat-card="asistencia">${directorStat("Asistencia hoy", "0%", "0 registros", "circle-check-big", "bg-school-gold text-white")}</div>
      <div data-director-stat-card="alertas">${directorStat("Alertas", "0", "Requieren atencion", "triangle-alert", "bg-red-500 text-white")}</div>
    </section>

    <section class="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
      ${directorCard("Asistencia de los ultimos 7 dias", `
        <div class="h-52 rounded-2xl bg-gradient-to-b from-green-50 to-white p-4">
          <div class="flex h-full items-end justify-between gap-3 border-b border-l border-slate-200 px-2 pb-4">
            ${[92, 94, 90, 93, 91, 89, 91].map((value, index) => `
              <div class="flex flex-1 flex-col items-center gap-2">
                <span class="text-xs font-black text-slate-700">${value}%</span>
                <div class="w-full rounded-t-xl bg-school-green/80" style="height:${value - 45}%"></div>
                <span class="text-xs font-bold text-slate-500">${["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"][index]}</span>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="mt-4 grid grid-cols-4 divide-x divide-slate-100 text-center text-sm font-bold">
          <span>Presentes<br><b data-director-presentes>0</b></span>
          <span>Atrasos<br><b data-director-atrasos>0</b></span>
          <span>Licencias<br><b data-director-permisos>0</b></span>
          <span>Faltas<br><b data-director-faltas>0</b></span>
        </div>
      `)}
      ${directorCard("Asistencia por curso (hoy)", `
        <div class="grid gap-4" data-director-course-progress>
          ${COURSES.map((course, index) => progressRow(course.nombre, [96, 93, 89, 84, 92, 90, 94][index] || 90, index === 3 ? "bg-school-gold" : "bg-school-green")).join("")}
        </div>
        <a href="#/director/asistencia" class="mt-5 inline-flex w-full items-center justify-center gap-2 text-sm font-black text-school-green">Ver todos los cursos ${icon("arrow-right", "h-4 w-4")}</a>
      `)}
      ${directorCard("Alertas recientes", `
        <div data-director-alert-list>
          ${alertItem("Cargando alertas reales...", "Analizando asistencia y notas", "", "bg-slate-100 text-slate-500", "activity")}
        </div>
        <a href="#/director/reportes" class="mt-3 inline-flex w-full items-center justify-center gap-2 text-sm font-black text-school-green">Ver alertas ${icon("arrow-right", "h-4 w-4")}</a>
      `)}
    </section>

    <section class="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      ${directorCard("Estudiantes en riesgo academico", `<div data-director-risk-table>${riskRows()}</div><a href="#/director/notas" class="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm font-black text-school-green">Ver rendimiento ${icon("arrow-right", "h-4 w-4")}</a>`)}
      ${directorCard("Actividad reciente", `
        <div data-director-activity-list>
          ${activityItem("Cargando actividad del sistema...", "", "bg-school-green", "activity")}
        </div>
      `)}
    </section>
  `;

  return DirectorShell("/director", content);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function replaceStat(key, html) {
  const element = document.querySelector(`[data-director-stat-card="${key}"]`);
  if (element) element.innerHTML = html;
}

export async function bindDirectorDashboard(route) {
  if (route !== "/director") return;
  try {
    const [students, teachers, attendanceRows, auditRows, activities, grades] = await Promise.all([
      listDirectorStudents(),
      listDirectorTeachers(),
      listDirectorAttendance(),
      listDirectorAudit(8),
      listDirectorActivities(),
      listDirectorGrades()
    ]);
    const totals = attendanceTotals(attendanceRows);
    const valid = (totals.presente || 0) + (totals.atraso || 0) + (totals.permiso || 0);
    const percent = attendancePercent(attendanceRows);
    const byCourse = Object.groupBy ? Object.groupBy(attendanceRows, (item) => item.cursoId || "") : attendanceRows.reduce((acc, item) => {
      const key = item.cursoId || "";
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});
    const courseSummaries = activeCoursesWithCounts(students).map((course) => ({
      ...course,
      ...calculateCourseGrades({ students, activities, grades, courseId: course.id })
    }));
    const coursesWithoutAttendance = courseSummaries.filter((course) => course.total > 0 && !(byCourse[course.id] || []).length).length;
    const pendingGrades = courseSummaries.reduce((sum, item) => sum + Number(item.pending || 0), 0);
    const riskTotal = courseSummaries.reduce((sum, item) => sum + Number(item.risk || 0), 0);
    const alerts = (totals.falta || 0) + coursesWithoutAttendance + riskTotal + pendingGrades;
    replaceStat("estudiantes", directorStat("Estudiantes", students.length, "Activos", "users", "bg-blue-600 text-white"));
    replaceStat("docentes", directorStat("Docentes", teachers.length, "Activos", "graduation-cap", "bg-school-green text-white"));
    replaceStat("asistencia", directorStat("Asistencia hoy", `${percent}%`, `${attendanceRows.length} registros`, "circle-check-big", "bg-school-gold text-white"));
    replaceStat("alertas", directorStat("Alertas", alerts, "Requieren atencion", "triangle-alert", "bg-red-500 text-white"));
    setText("[data-director-presentes]", totals.presente || 0);
    setText("[data-director-atrasos]", totals.atraso || 0);
    setText("[data-director-permisos]", totals.permiso || 0);
    setText("[data-director-faltas]", totals.falta || 0);
    const courseProgress = document.querySelector("[data-director-course-progress]");
    if (courseProgress) {
      courseProgress.innerHTML = activeCoursesWithCounts(students).map((course) => {
        const records = byCourse[course.id] || [];
        const value = attendancePercent(records);
        return progressRow(course.nombre, value, value < 85 ? "bg-school-gold" : "bg-school-green");
      }).join("");
    }
    const alertList = document.querySelector("[data-director-alert-list]");
    if (alertList) {
      const items = [];
      if (totals.falta) items.push(alertItem(`${totals.falta} falta(s) registradas`, "Revisar asistencia de hoy", "Hoy", "bg-red-50 text-red-600", "flame"));
      if (coursesWithoutAttendance) items.push(alertItem(`${coursesWithoutAttendance} curso(s) sin asistencia`, "Pendiente de registro", "Hoy", "bg-amber-50 text-amber-600", "clock-alert"));
      if (riskTotal) items.push(alertItem(`${riskTotal} estudiante(s) en riesgo`, "Promedio menor a 51", "Notas", "bg-orange-50 text-orange-600", "badge-alert"));
      if (pendingGrades) items.push(alertItem(`${pendingGrades} nota(s) pendientes`, "Actividades sin revisar cuentan como 35", "Notas", "bg-blue-50 text-blue-600", "notebook-tabs"));
      alertList.innerHTML = items.length ? items.slice(0, 4).join("") : alertItem("Sin alertas importantes", "El sistema no detecto pendientes", "Hoy", "bg-green-50 text-green-600", "circle-check-big");
    }
    const riskTable = document.querySelector("[data-director-risk-table]");
    if (riskTable) {
      const gradeByKey = new Map(grades.map((grade) => [`${grade.actividadId}|${grade.alumnoId}`, grade]));
      const rows = students.map((student) => {
        const studentActivities = activities.filter((activity) => activity.cursoId === student.cursoId);
        if (!studentActivities.length) return null;
        const total = studentActivities.reduce((sum, activity) => {
          const grade = gradeByKey.get(`${activity.id}|${student.id}`);
          const note = Math.max(35, Number(grade?.nota || 35));
          return sum + note;
        }, 0);
        const average = Math.round(total / studentActivities.length);
        if (average >= 51) return null;
        const course = courseSummaries.find((item) => item.id === student.cursoId);
        return [student.nombre || "-", course?.nombre || student.cursoId || "-", average, average < 46 ? "Critico" : "En riesgo"];
      }).filter(Boolean).sort((a, b) => a[2] - b[2]).slice(0, 8);
      riskTable.innerHTML = riskRows(rows);
    }
    const activityList = document.querySelector("[data-director-activity-list]");
    if (activityList) {
      activityList.innerHTML = auditRows.length
        ? auditRows.map((item) => activityItem(item.detalle || `${item.tipo || "sistema"} ${item.accion || ""}`, item.hora || "", item.tipo === "asistencia" ? "bg-school-green" : item.tipo === "calificaciones" ? "bg-blue-500" : "bg-orange-500", item.tipo === "asistencia" ? "clipboard-check" : item.tipo === "calificaciones" ? "notebook-tabs" : "activity")).join("")
        : activityItem("Sin movimientos recientes", "", "bg-slate-400", "activity");
    }
  } catch (error) {
    console.warn("No se pudo cargar el dashboard del director", error);
  }
}
