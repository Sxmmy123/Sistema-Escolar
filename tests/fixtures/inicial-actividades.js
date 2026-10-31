import "/src/styles.css";
import "/src/modules/docente-inicial/inicial.css";
import "/src/theme.css";
import { bindThemeButtons, initializeTheme } from "/src/ui/theme.js";
import { crearControladorInicial } from "/src/modules/docente-inicial/ControladorInicial.js";
import { actualizarIconos } from "/src/modules/docente-inicial/EntradaInicialDocente.js";
import { ActividadesInicial } from "/src/modules/docente-inicial/ActividadesInicial.js";
import { RegistroInicial } from "/src/modules/docente-inicial/RegistroInicial.js";
import { BitacoraInicial } from "/src/modules/docente-inicial/BitacoraInicial.js";
import { AsistenciaInicial } from "/src/modules/docente-inicial/AsistenciaInicial.js";
import { InformeInicial } from "/src/modules/docente-inicial/InformeInicial.js";
import { ResumenesInicial } from "/src/modules/docente-inicial/ResumenesInicial.js";
import { documentoInformesCursoInicial } from "/src/modules/docente-inicial/ImpresionInformesInicial.js";
import { firmaRegistrosInicial, validarEdicionBitacoraInicial } from "/src/services/modeloInicial.js";
import { findCourse } from "/src/data/catalog.js";
import { establecerConfiguracion } from "/src/services/rutasFirestore.js";
import { validarCriteriosActividad } from "/src/services/modeloActividadesInicial.js";

// Isolated visual fixture: all mutations stay in memory, with no Firebase writes or AI calls.
establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: true });
initializeTheme({ storage: null });
const context = { uid: "prueba-local", gestionId: "2026", courses: [findCourse("inicial")], profile: { nombre: "Docente de prueba", trimestreActivo: "t1" } };
const criteria = validarCriteriosActividad(Object.fromEntries(["ser", "saber", "hacer"].map((id) => [id, { criterio: { ser: "Comparte materiales y respeta turnos", saber: "Reconoce formas y materiales del muneco", hacer: "Recorta y ensambla piezas de carton" }[id], opciones: { logrado: "Lo realiza con autonomia y seguridad.", en_proceso: "Lo realiza con algunas indicaciones de la docente.", requiere_apoyo: "Requiere acompanamiento para realizar la actividad.", no_observado: "Aun no se observo este aspecto durante la actividad." } }])));
const titles = ["Muneco de carton", "Las vocales de mi nombre", "Figuras de nuestro entorno", "Los colores de mi comunidad", "Cuidamos las plantas", "Compartimos juguetes", "Sonidos y ritmos"];
let activities = titles.map((titulo, index) => ({ id: `prueba-local_${index}`, cursoId: "inicial", trimestreId: "t1", docenteUid: context.uid, titulo, descripcion: index === 0 ? "Construccion con carton reciclado y materiales compartidos." : "", materiaId: ["artes_plasticas", "lenguaje", "matematica", "artes_plasticas", "ciencias_naturales", "ciencias_sociales", "musica"][index], orden: String(index), prioritaria: true, estado: "pendiente", criterios: index < 6 ? criteria : {}, tieneRegistros: false }));
let records = [], sequence = 0;
const attendance = new Map();
const students = [{ id: "a", nombre: "ALUMNO DE PRUEBA A" }, { id: "b", nombre: "ALUMNO DE PRUEBA B" }];
const reportStudents = ["ALVAREZ LOPEZ ANA", "ARCE PEREZ BRUNO", "CALLE RIOS CAMILA", "CONDORI VEGA DANIEL", "FLORES MAMANI ELENA", "GARCIA RAMOS FABIAN", "GUTIERREZ ROJAS GABRIELA", "LOPEZ RIVERA HUGO", "MAMANI QUISPE ISABEL", "PEREZ SALAS JOSE", "RAMOS VARGAS LUCIA", "ROJAS VILLCA MARIA FERNANDA"].map((nombre, index) => ({ id: `informe-${index}`, nombre }));
for (const [termIndex, trimestreId] of ["t1", "t2", "t3"].entries()) {
  for (const student of reportStudents) {
    const common = { alumnoId: student.id, docenteUid: context.uid, cursoId: "inicial", trimestreId, createdAt: { seconds: 1772445600 + termIndex * 8000000 } };
    for (const dimension of ["ser", "saber", "hacer"]) records.push({ ...common, id: `prueba-local_${student.id}_${trimestreId}_${dimension}`, tipo: "actividad", actividadTitulo: "Muneco de carton", materiaId: "artes_plasticas", dimension, criterio: criteria[dimension].criterio, valoracion: "logrado", opinion: criteria[dimension].opciones.logrado, descripcion: "Participa con entusiasmo en la actividad." });
    records.push({ ...common, id: `prueba-local_bitacora_${student.id}_${trimestreId}`, tipo: "bitacora", materiaId: "", descripcion: "Comparte sus materiales y ayuda a sus companeros. Muestra avances al organizar y terminar sus trabajos." });
    records.push({ ...common, id: `prueba-local_informe_${student.id}_${trimestreId}`, tipo: "informe", aprobado: true, origen: "ia", fuentesFirma: firmaRegistrosInicial(records.filter((item) => item.trimestreId === trimestreId), student.id), descripcion: ["Comparte materiales y respeta turnos. Reconoce formas y colores. Recorta y ensambla piezas con apoyo de la docente.", "Participa con autonomia, reconoce figuras y organiza sus materiales. Progresa al recortar y construir con carton.", "Colabora con sus companeros, reconoce formas y explica sus ideas. Recorta y construye con mayor autonomia y seguridad."][termIndex] });
  }
}
if (location.hash === "#/docente/resumenes") {
  const student = reportStudents[0], common = { alumnoId: student.id, docenteUid: context.uid, cursoId: "inicial", trimestreId: "t1", tipo: "actividad", dimension: "ser" };
  for (let index = 0; index < 8; index++) {
    const activity = activities[index % 3];
    records.push({ ...common, id: `resumen-${index}`, actividadId: activity.id, actividadTitulo: activity.titulo, materiaId: activity.materiaId, criterio: criteria.ser.criterio, valoracion: index % 3 === 0 ? "en_proceso" : "logrado", opinion: index % 3 === 0 ? criteria.ser.opciones.en_proceso : criteria.ser.opciones.logrado, descripcion: "Organiza sus materiales y participa en el trabajo compartido.", createdAt: { seconds: 1772445600 + (index + 1) * 86400 } });
  }
  const note = records.find((item) => item.tipo === "bitacora" && item.alumnoId === student.id && item.trimestreId === "t1");
  note.descripcion = "Comparte sus materiales y ayuda a sus companeros. Muestra avances al organizar y terminar sus trabajos. Durante las actividades de recorte necesita acompanamiento para sostener la tijera y seguir las lineas, pero participa con interes y acepta las indicaciones de la docente. Se comunica con mayor seguridad y respeta los turnos.";
  for (const [index, dimension] of ["saber", "saber", "hacer"].entries()) records.push({ ...common, id: `mapa-${dimension}-${index}`, dimension, actividadId: "figuras", actividadTitulo: "Figuras de nuestro entorno", materiaId: "matematica", criterio: dimension === "saber" ? "Relaciona cantidades y numeros" : "Clasifica objetos por su forma", valoracion: index === 1 ? "requiere_apoyo" : "en_proceso", opinion: index === 1 ? "Requiere apoyo al reconocer cantidades mayores a cinco." : "Reconoce y agrupa figuras con algunas indicaciones.", descripcion: "Participa con interes en los juegos de clasificacion.", createdAt: { seconds: 1772704800 + index * 86400 } });
  for (const [index, seconds] of [1770631200, 1775383200].entries()) records.push({ ...common, id: `mapa-bitacora-${index}`, tipo: "bitacora", materiaId: "", descripcion: index ? "Expresa sus ideas con mayor seguridad. Comparte materiales y comienza a resolver desacuerdos mediante el dialogo." : "Al iniciar el trimestre participa con timidez y necesita apoyo para integrarse al trabajo grupal.", createdAt: { seconds } });
  records.find((item) => item.tipo === "informe" && item.alumnoId === student.id && item.trimestreId === "t1").fuentesFirma = firmaRegistrosInicial(records.filter((item) => item.trimestreId === "t1"), student.id);
  records.find((item) => item.tipo === "informe" && item.alumnoId === reportStudents[1].id && item.trimestreId === "t1").fuentesFirma = "0-0000";
  records.find((item) => item.tipo === "informe" && item.alumnoId === reportStudents[2].id && item.trimestreId === "t1").aprobado = false;
  records = records.filter((item) => !(item.tipo === "informe" && item.alumnoId === reportStudents[3].id && item.trimestreId === "t1"));
}
if (location.hash === "#/docente/informe") {
  const student = reportStudents[0], common = { alumnoId: student.id, docenteUid: context.uid, cursoId: "inicial", trimestreId: "t1", tipo: "actividad", materiaId: "artes_plasticas", actividadTitulo: "Muneco de carton", valoracion: "logrado" };
  for (const [dimension, count] of Object.entries({ ser: 2, saber: 7, hacer: 9 })) {
    for (let index = 0; index < count; index++) records.push({ ...common, id: `fuente-${dimension}-${index}`, dimension, criterio: criteria[dimension].criterio, opinion: criteria[dimension].opciones.logrado, descripcion: "Participa con interes y muestra avances en la actividad.", createdAt: { seconds: 1772445600 + index * 86400 } });
  }
  records.push({ ...common, id: "fuente-bitacora", tipo: "bitacora", materiaId: "", descripcion: "Organiza sus materiales y respeta los turnos de sus companeros." });
  records.find((item) => item.tipo === "informe" && item.alumnoId === student.id && item.trimestreId === "t1").fuentesFirma = firmaRegistrosInicial(records.filter((item) => item.trimestreId === "t1"), student.id);
}
const data = {
  nuevoId: () => `prueba-${++sequence}`, leer: (type, ...scope) => type === "attendance" ? attendance.get(JSON.stringify(scope)) || {} : type === "records" ? records.filter((item) => !item.trimestreId || item.trimestreId === scope[1]) : type === "students" && ["#/docente/informe", "#/docente/bitacora", "#/docente/resumenes"].includes(location.hash) ? reportStudents : ({ activities, students })[type] || [], cargar: async (type, ...scope) => data.leer(type, ...scope.slice(0, 3)), desmontar() {},
  async guardarAsistencia(course, student, date, term, status, note) { const key = JSON.stringify([course, term, date]); attendance.set(key, { ...(attendance.get(key) || {}), [student.id]: { estado: status, observacion: note } }); },
  async guardarActividad(input) { let row = activities.find((item) => item.id === input.id); if (!row) { row = { ...input, id: input.id || data.nuevoId(), orden: String(activities.length), criterios: input.criterios || {}, estado: "pendiente" }; activities.push(row); } if (input.accion === "criterios") row.criterios = input.criterios; if (input.accion === "prioridad") row.prioritaria = !row.prioritaria; if (["eliminar", "finalizar", "restaurar", "reabrir"].includes(input.accion)) { row.estado = { eliminar: "eliminada", finalizar: "finalizada", restaurar: "pendiente", reabrir: "pendiente" }[input.accion]; row.prioritaria = false; } return row; },
  async moverActividad(a, b) { [a.orden, b.orden] = [b.orden, a.orden]; },
  async guardarAvance(activity, studentId, entries) { Object.entries(entries).forEach(([dimension, entry]) => { const id = `${activity.id}_${studentId}_${dimension}`; records = records.filter((row) => row.id !== id); records.push({ id, tipo: "actividad", actividadId: activity.id, alumnoId: studentId, dimension, ...entry }); }); },
  async guardarRegistro(input) { const id = input.tipo === "informe" ? `prueba-local_informe_${input.alumnoId}_${input.trimestreId}` : input.id || data.nuevoId(); records = [...records.filter((item) => item.id !== id), { ...input, id, docenteUid: context.uid }]; },
  async editarBitacora(input) { const previous = records.find((item) => item.id === input.id), valid = validarEdicionBitacoraInicial(context, input, previous); previous.descripcion = valid.descripcion; return previous; }
};
const views = { "/docente/actividades": ActividadesInicial, "/docente/registro": RegistroInicial, "/docente/bitacora": BitacoraInicial, "/docente/asistencia": AsistenciaInicial, "/docente/informe": InformeInicial, "/docente/resumenes": ResumenesInicial, "/docente": ActividadesInicial };
const controller = crearControladorInicial(context, views, { data, iaAvailable: true, refreshIcons: actualizarIconos, watchCommunications: () => () => {}, generateCriteria: async () => ({ criterios: structuredClone(criteria) }), generateReport: async (_, input) => ({ texto: "Comparte sus materiales, respeta turnos y participa con entusiasmo. Reconoce formas y construye con apoyo de la docente.", fuentesFirma: firmaRegistrosInicial(records.filter((item) => item.trimestreId === input.trimestreId), input.alumnoId) }), printReports: (payload) => { document.querySelector('[data-initial-print-preview]')?.remove(); const frame = document.createElement('iframe'); frame.dataset.initialPrintPreview = ''; frame.title = 'Vista previa de informes del curso'; frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100dvh;z-index:1000;border:0;background:white'; frame.srcdoc = documentoInformesCursoInicial(payload); document.querySelector('#app').append(frame); } });
let unbindTheme;
function render() { unbindTheme?.(); const route = location.hash.slice(1) || "/docente/actividades"; document.querySelector("#app").innerHTML = controller.vista(route); controller.vincular(route); unbindTheme = bindThemeButtons({ storage: null, events: null }); actualizarIconos(); }
window.addEventListener("hashchange", render); render();
document.addEventListener("click", (event) => { const link = event.target.closest('a[href*="#/docente"]'); if (link) { event.preventDefault(); location.hash = link.hash; } });
