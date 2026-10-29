import "/src/styles.css";
import "/src/modules/admin/AlumnosAdmin.css";
import "/src/modules/docente-inicial/inicial.css";
import "/src/theme.css";
import { createIcons, icons } from "lucide";
import { AdminShell } from "/src/modules/admin/AdminShell.js";
import { AlumnosAdminPanel } from "/src/modules/admin/AlumnosAdmin.js";
import { DirectorShell } from "/src/modules/director/DirectorShell.js";
import { ActividadesInicial } from "/src/modules/docente-inicial/ActividadesInicial.js";
import { DocenteDashboard } from "/src/modules/docente/DocenteDashboard.js";
import { teacherState } from "/src/modules/docente/EstadoDocente.js";
import { courseSubjectsBadges, scheduleList } from "/src/modules/docente/UtilidadesDocente.js";
import { appShell } from "/src/ui/shell.js";
import { bindThemeButtons, initializeTheme } from "/src/ui/theme.js";
import { establecerConfiguracion } from "/src/services/rutasFirestore.js";
import { findCourse, SUBJECTS, PRIMARY_PERIODS } from "/src/data/catalog.js";

// Visual-only fixture. No authentication, network subscriptions or data writes.
establecerConfiguracion({ gestionActivaId: "2026", gestionHabilitada: true, versionModelo: 2 });
initializeTheme();
const role = new URLSearchParams(location.search).get("rol") || "admin";
const content = `<section class="teacher-module-surface p-4 bg-white rounded-lg border border-slate-200">
  <h1 class="teacher-module-title text-slate-900">Seguimiento del curso</h1>
  <div class="mt-4 flex gap-3 flex-wrap"><label class="text-sm text-slate-600">Curso<select class="block border border-slate-200 bg-white rounded-md p-2"><option>Cuarto A</option></select></label>
  <label class="text-sm text-slate-600">Buscar alumno<input class="block border border-slate-200 bg-white rounded-md p-2" placeholder="Nombre del alumno"></label></div>
  <table class="mt-4 w-full text-sm text-left"><thead class="bg-slate-50 text-slate-600"><tr><th class="p-3">Alumno</th><th class="p-3">Asistencia</th><th class="p-3">Estado</th></tr></thead><tbody class="divide-y divide-slate-200">
  <tr><td class="p-3">ALVAREZ FLORES ANA</td><td class="p-3 text-green-700">Presente</td><td class="p-3"><span class="bg-green-50 text-green-800 rounded-md px-2 py-1">Registrado</span></td></tr>
  <tr><td class="p-3">CONDORI VEGA DANIEL</td><td class="p-3 text-red-700">Falta</td><td class="p-3"><span class="bg-amber-50 text-amber-800 rounded-md px-2 py-1">Pendiente</span></td></tr>
  <tr><td class="p-3">FLORES MAMANI ELENA</td><td class="p-3 text-purple-700">Licencia</td><td class="p-3"><span class="bg-blue-50 text-blue-800 rounded-md px-2 py-1">Revisar</span></td></tr></tbody></table></section>`;
let page;
if (role === "admin") page = AdminShell("/admin/alumnos", AlumnosAdminPanel(), { title: "Alumnos", subtitle: "Registro y accesos escolares" });
else if (role === "director") page = DirectorShell("/director/estudiantes", content);
else if (role === "docente") page = DocenteDashboard();
else if (role === "inicial") {
  const activities = [
    { id: "uno", titulo: "Las vocales de mi nombre", materiaId: "lenguaje" },
    { id: "dos", titulo: "Figuras de nuestro entorno", materiaId: "matematica" },
    { id: "tres", titulo: "Muneco de carton", materiaId: "artes_plasticas" }
  ].map((activity, index) => ({ ...activity, descripcion: "Participacion y uso compartido de materiales.", orden: String(index), estado: "pendiente", prioritaria: true, criterios: { ser: {}, saber: {}, hacer: {} } }));
  page = ActividadesInicial({ context: { uid: "prueba-local", courses: [findCourse("inicial")], gestionId: "2026" }, route: "/docente/actividades", courseId: "inicial", termId: "t1", activityView: "board", data: { leer: () => activities } });
} else page = appShell("docente", "/docente/resumen", content);
document.querySelector("#app").innerHTML = page;
if (role === "docente") {
  const course={...findCourse("cuarto_a"),materias:SUBJECTS.map(subject=>subject.id)};
  teacherState.context={courses:[course]};
  document.querySelectorAll("[data-teacher-count]").forEach(node=>{node.textContent={courses:1,subjects:9,students:5,tasks:0,activities:77,classesToday:6}[node.dataset.teacherCount];});
  document.querySelector("[data-teacher-header-courses]").textContent=course.nombre;
  document.querySelector("[data-teacher-welcome]").textContent="Docente de prueba";
  document.querySelector("[data-teacher-status]").textContent="Datos cargados";
  document.querySelector("[data-teacher-dashboard-trimesters]").innerHTML='<button class="bg-school-green text-white rounded-lg px-3 py-2 text-xs">1er trimestre</button>';
  const rows=PRIMARY_PERIODS.filter(period=>!period.recreo).map((period,index)=>({periodo:period.label,hora:period.hora,cursoId:course.id,materiaId:SUBJECTS[index].id,materia:SUBJECTS[index].nombre,color:SUBJECTS[index].color}));
  document.querySelector("[data-teacher-today]").innerHTML=scheduleList(rows,"");
  document.querySelector("[data-teacher-tomorrow]").innerHTML=scheduleList([...rows].reverse(),"");
  document.querySelector("[data-teacher-courses]").innerHTML=`<p class="text-sm text-slate-600">Cuarto A</p><div class="flex flex-wrap gap-2">${courseSubjectsBadges(course)}</div>`;
}
if (role === "admin") document.querySelector("[data-students-sheet-rows]").innerHTML = Array.from({ length: 4 }, (_, index) => `<tr><td>${index + 1}</td><td><input aria-label="Nombre ${index + 1}" placeholder="Nombre completo"></td><td><input aria-label="CI ${index + 1}" placeholder="CI"></td><td><input aria-label="Clave ${index + 1}" placeholder="Contrasena"></td><td><input aria-label="Correo ${index + 1}" placeholder="Correo opcional"></td><td><select aria-label="Sexo ${index + 1}"><option>F</option><option>M</option></select></td><td></td></tr>`).join("");
bindThemeButtons();
createIcons({ icons });
document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  const menu = document.querySelector("[data-sidebar]");
  if (action === "toggle-sidebar-collapse") document.documentElement.classList.toggle("teacher-sidebar-collapsed");
  if (action === "open-menu" || action === "close-menu") {
    const open = action === "open-menu";
    menu.classList.toggle("-translate-x-full", !open);
    menu.setAttribute("aria-hidden", String(!open));
    document.querySelector("[data-sidebar-backdrop]").classList.toggle("hidden", !open);
  }
});
