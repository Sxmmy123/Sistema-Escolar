import "/src/styles.css";
import "/src/theme.css";
import * as teacher from "/src/modules/docente-inicial/EntradaInicialDocente.js";
import { crearDatosInicial } from "/src/modules/docente-inicial/datosInicial.js";
import { establecerConfiguracion } from "/src/services/rutasFirestore.js";
import { findCourse, DAYS } from "/src/data/catalog.js";
import { initializeTheme, bindThemeButtons } from "/src/ui/theme.js";

// Vista de prueba en memoria: no inicia sesion ni escribe en Firebase.
establecerConfiguracion({ gestionActivaId: "2026", gestionHabilitada: true, versionModelo: 2 });
initializeTheme();
const context = { uid: "prueba-multigrado", gestionId: "2026", courses: [findCourse("preinicial"), findCourse("inicial")], profile: { nombre: "Docente de prueba", trimestreActivo: "t1" } };
const criteria = Object.fromEntries(["ser", "saber", "hacer"].map((dimension) => [dimension, { criterio: `Observacion de ${dimension.toUpperCase()}`, opciones: { logrado: "Comparte y realiza la actividad con autonomia.", en_proceso: "Avanza con orientacion de la docente.", requiere_apoyo: "Necesita acompanamiento durante la actividad.", no_observado: "Todavia no hay evidencia de esta capacidad." } }]));
const students = {
  preinicial: [{ id: "p1", nombre: "ALVAREZ FLORES ANA" }, { id: "p2", nombre: "MAMANI QUISPE BRUNO" }],
  inicial: [{ id: "i1", nombre: "CONDORI VARGAS ELENA" }, { id: "i2", nombre: "ROJAS FLORES DANIEL" }]
};
const schedule = { periodos: [{ id: "p1", label: "1", hora: "08:00 - 08:40" }, { id: "p2", label: "2", hora: "08:40 - 09:20" }], clases: Object.fromEntries(["p1", "p2"].map((id) => [id, Object.fromEntries(DAYS.map((day, index) => [day.id, ["matematica", "lenguaje", "ciencias_naturales", "educacion_fisica", "religion"][index]]))])) };
const activities = [{ id: "actividad-compartida", docenteUid: context.uid, cursoId: "preinicial", trimestreId: "t1", materiaId: "artes_plasticas", titulo: "Construimos un muneco de carton", descripcion: "Compartimos materiales y reconocemos las partes del cuerpo.", estado: "pendiente", prioritaria: true, orden: "1", criterios: criteria }];
const records = Object.entries(students).flatMap(([cursoId, pupils]) => pupils.map((student) => ({ id: `nota_${student.id}`, docenteUid: context.uid, cursoId, trimestreId: "t1", alumnoId: student.id, tipo: "bitacora", descripcion: "Comparte sus materiales y participa de forma espontanea." })));
const data = crearDatosInicial(context, {
  getTeacherStudents: async (id) => students[id], getSchedule: async () => schedule,
  listarActividadesInicial: async (_, id) => activities.filter((item) => item.cursoId === id),
  listarRegistrosInicial: async (_, id, term) => records.filter((item) => item.cursoId === id && item.trimestreId === term),
  listAttendanceForCourseDate: async () => ({}), nuevoIdRegistroInicial: () => `${context.uid}_${crypto.randomUUID()}`,
  guardarRegistroInicial: async (_, input) => { records.push(input); return input; },
  guardarAvanceInicial: async (_, activity, studentId, entries, options) => ({ activity, records: Object.entries(entries).map(([dimension, entry]) => ({ id: `${activity.id}_${studentId}_${dimension}`, cursoId: options.cursoAlumnoId, trimestreId: "t1", docenteUid: context.uid, alumnoId: studentId, actividadId: activity.id, tipo: "actividad", dimension, ...entry })) })
});
teacher.preparar(context, { data, iaAvailable: false, watchCommunications: () => () => {}, saveTerm: async () => {} });
function render() {
  const route = location.hash.slice(1) || "/docente/registro";
  document.querySelector("#app").innerHTML = (teacher.rutas[route] || teacher.rutas["/docente"])();
  teacher.actualizarIconos(); teacher.vincular(route); bindThemeButtons();
}
addEventListener("hashchange", render);
render();
