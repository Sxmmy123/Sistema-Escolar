import "/src/styles.css";
import "/src/modules/alumno/alumno.css";
import { AlumnoDashboard, bindAlumnoPage } from "/src/modules/alumno/AlumnoDashboard.js";
import { buildStudentDashboardData } from "/src/services/studentData.js";
import { findCourse } from "/src/data/catalog.js";
import { establecerConfiguracion } from "/src/services/rutasFirestore.js";

// Prueba aislada: no se autentica ni escribe en Firebase.
establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: true });
const context = { uid: "prueba-alumno", gestionId: "2026", student: { id: "prueba", nombre: "ESTUDIANTE DE DEMOSTRACION", cursoId: "cuarto_a" }, course: findCourse("cuarto_a"), profile: { usuario: "demo" } };
const rows = {
  periods: [{ id: "t2", actividadFecha: "2026-05-04", asistenciaFecha: "2026-05-04" }],
  activities: [
    { id: "a1", cursoId: "cuarto_a", trimestreId: "t1", materiaId: "matematica", titulo: "Tarea 1", fecha: "2026-03-10", tipo: "tarea", maximo: 100 },
    { id: "a2", cursoId: "cuarto_a", trimestreId: "t2", materiaId: "ciencias_naturales", titulo: "La celula", fecha: "2026-05-04", tipo: "tarea", maximo: 100 }
  ],
  grades: [{ actividadId: "a1", alumnoId: "prueba", trimestreId: "t1", valor: 75, nota: 75, maximo: 100 }, { actividadId: "a2", alumnoId: "prueba", trimestreId: "t2", valor: 85, nota: 85, maximo: 100 }],
  attendance: [
    { alumnoId: "prueba", trimestreId: "t1", fecha: "2026-03-10", estado: "atraso", observacion: "Llego tarde a las 9am, muy tarde.", registradoPor: "Aracely" },
    { alumnoId: "prueba", trimestreId: "t1", fecha: "2026-03-11", estado: "presente" },
    { alumnoId: "prueba", trimestreId: "t1", fecha: "2026-03-12", estado: "licencia", observacion: "Permiso familiar comunicado a la docente.", registradoPor: "Aracely" },
    { alumnoId: "prueba", trimestreId: "t1", fecha: "2026-03-13", estado: "presente", observacion: "Participa en la actividad y requiere acompanamiento para organizar sus materiales. ".repeat(15), registradoPor: "Aracely" },
    { alumnoId: "prueba", trimestreId: "t2", fecha: "2026-05-04", estado: "presente", observacion: "Participo con entusiasmo en la actividad.", registradoPor: "Aracely" }
  ]
};
let onChange = null;
const emit = () => onChange?.(buildStudentDashboardData(context, rows, "2026-10-24"));
const observe = async (callback) => {
  onChange = callback; emit();
  return { stop() { if (onChange === callback) onChange = null; }, async seleccionarTrimestre(trimestreId) {
    const data = buildStudentDashboardData(context, rows, "2026-10-24");
    context.profile.preferencias = { vistasAlumnoPorGestion: { 2026: { cursoId: "cuarto_a", trimestreId, automatico: data.automaticTrimesterId } } };
    emit();
  } };
};
async function render() {
  const route = location.hash.slice(1) || "/alumno";
  document.querySelector("#app").innerHTML = AlumnoDashboard(route);
  await bindAlumnoPage(route, { observe });
  const controls = document.createElement("footer");
  controls.className = "p-4 text-center";
  controls.innerHTML = '<button type="button" data-simulate-term class="rounded border px-3 py-2 text-sm">Simular avance del curso a tercero</button>';
  controls.querySelector("button").addEventListener("click", () => { rows.periods.push({ id: "t3", actividadFecha: "2026-09-01", asistenciaFecha: "2026-09-01" }); emit(); });
  document.querySelector("#app").append(controls);
}
window.addEventListener("hashchange", render); render();
document.addEventListener("click", (event) => { const link = event.target.closest('a[href*="#/alumno"]'); if (link) { event.preventDefault(); location.hash = link.hash; } });
