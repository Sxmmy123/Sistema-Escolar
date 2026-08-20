import { COURSES, listDirectorStudents } from "../../services/directorData.js";
import { DirectorShell, directorCard, directorStat } from "./DirectorShell.js";

let selectedCourseId = sessionStorage.getItem("directorCursoEstudiantes") || COURSES[0].id;

function courseTabs() {
  return `
    <div class="flex gap-2 overflow-x-auto pb-2">
      ${COURSES.map((course) => `
        <button data-director-student-course="${course.id}" class="shrink-0 rounded-2xl border px-4 py-2 text-sm font-black transition ${course.id === selectedCourseId ? "border-school-green bg-school-green text-white shadow-soft" : "border-slate-200 bg-white text-slate-600 hover:bg-green-50"}">${course.corto}</button>
      `).join("")}
    </div>
  `;
}

function studentsTable() {
  return `
    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead><tr class="border-b border-slate-100 text-xs font-black uppercase text-slate-500"><th class="py-3">N°</th><th>Alumno</th><th>CI</th><th>Estado</th></tr></thead>
        <tbody data-director-students-list>
          <tr><td colspan="4" class="py-4 font-bold text-slate-500">Cargando alumnos...</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

export function DirectorStudents() {
  const course = COURSES.find((item) => item.id === selectedCourseId) || COURSES[0];
  const content = `
    <section class="grid gap-4 md:grid-cols-3">
      <div data-director-students-total>${directorStat("Alumnos del curso", "0", course.nombre, "users", "bg-school-green text-white")}</div>
      ${directorStat("Tutores", "Pendiente", "Datos familiares", "contact-round", "bg-school-gold text-white")}
      ${directorStat("Historial", "Activo", "Seguimiento individual", "history", "bg-blue-600 text-white")}
    </section>
    <section class="mt-4">
      ${directorCard("Seleccionar curso", courseTabs())}
    </section>
    <section class="mt-4">
      ${directorCard(`<span data-director-students-title>${course.nombre}</span>`, studentsTable())}
    </section>
  `;
  return DirectorShell("/director/estudiantes", content, {
    title: "Estudiantes",
    subtitle: "Alumnos, tutores, estados e historial."
  });
}

function renderRows(students) {
  const tbody = document.querySelector("[data-director-students-list]");
  if (!tbody) return;
  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-4 font-bold text-slate-500">No hay alumnos registrados en este curso.</td></tr>`;
    return;
  }
  tbody.innerHTML = students.map((student) => `
    <tr class="border-b border-slate-100 last:border-0">
      <td class="py-2 font-black text-school-green">${student.numeroLista || "-"}</td>
      <td class="py-2 font-semibold text-slate-900">${student.nombre || "-"}</td>
      <td class="py-2 font-semibold text-slate-500">${student.ci || "-"}</td>
      <td class="py-2"><span class="rounded-full bg-green-50 px-2.5 py-1 text-xs font-black text-school-green">Activo</span></td>
    </tr>
  `).join("");
}

async function refreshStudents() {
  const course = COURSES.find((item) => item.id === selectedCourseId) || COURSES[0];
  const title = document.querySelector("[data-director-students-title]");
  const total = document.querySelector("[data-director-students-total]");
  const tbody = document.querySelector("[data-director-students-list]");
  if (title) title.textContent = course.nombre;
  if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="py-4 font-bold text-slate-500">Cargando alumnos...</td></tr>`;
  const students = await listDirectorStudents(course.id);
  renderRows(students);
  if (total) total.innerHTML = directorStat("Alumnos del curso", students.length, course.nombre, "users", "bg-school-green text-white");
}

export function bindDirectorStudents(route) {
  if (route !== "/director/estudiantes") return;
  document.querySelectorAll("[data-director-student-course]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCourseId = button.dataset.directorStudentCourse;
      sessionStorage.setItem("directorCursoEstudiantes", selectedCourseId);
      document.querySelectorAll("[data-director-student-course]").forEach((item) => {
        const active = item.dataset.directorStudentCourse === selectedCourseId;
        item.className = `shrink-0 rounded-2xl border px-4 py-2 text-sm font-black transition ${active ? "border-school-green bg-school-green text-white shadow-soft" : "border-slate-200 bg-white text-slate-600 hover:bg-green-50"}`;
      });
      refreshStudents().catch(() => {});
    });
  });
  refreshStudents().catch(() => {});
}
