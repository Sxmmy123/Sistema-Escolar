import { isQualitativeCourse, SUBJECTS } from "../data/catalog.js";
import { validarFechaGestion } from "./registroEscolar.js";
import { exigirTrimestreDocente } from "./relevoDocente.js";
import { firmaFuentes } from "../../functions/informe-core.js";
export { evidenciasParaInforme as evidenciasInformeInicial } from "../../functions/informe-core.js";

export const navegacionInicial = [
  ["Panel", "#/docente", "layout-dashboard"],
  ["Asistencia", "#/docente/asistencia", "clipboard-check"],
  ["Actividades", "#/docente/actividades", "columns-3"],
  ["Registro", "#/docente/registro", "notebook-pen"],
  ["Bitacora", "#/docente/bitacora", "book-open-text"],
  ["Horario", "#/docente/horario", "calendar-days"],
  ["Seguimiento", "#/docente/resumenes", "chart-no-axes-combined"],
  ["Informe trimestral", "#/docente/informe", "file-text"]
];
export const dimensionesInicial = [
  { id: "ser", label: "SER", icon: "users" },
  { id: "saber", label: "SABER", icon: "book-open-text" },
  { id: "hacer", label: "HACER", icon: "hand-helping" }
];
export const valoracionesInicial = [
  { id: "logrado", label: "Lo logra", icon: "check" },
  { id: "en_proceso", label: "En proceso", icon: "minus" },
  { id: "requiere_apoyo", label: "Requiere apoyo", icon: "hand-helping" }
];
const criteriosPorMateria = {
  matematica: { saber: ["Reconoce figuras geometricas", "Relaciona cantidades y numeros"], hacer: ["Clasifica objetos por su forma", "Resuelve secuencias con material concreto"] },
  lenguaje: { saber: ["Identifica las vocales", "Reconoce las letras de su nombre"], hacer: ["Realiza trazos con precision", "Expresa sus ideas al conversar"] },
  ciencias_naturales: { saber: ["Reconoce seres vivos de su entorno", "Identifica habitos de higiene"], hacer: ["Practica el cuidado de la naturaleza", "Realiza su aseo personal con autonomia"] },
  ciencias_sociales: { saber: ["Reconoce a su familia y comunidad", "Identifica normas de convivencia"], hacer: ["Participa en actividades de su comunidad", "Colabora con sus companeros"] },
  educacion_fisica: { saber: ["Reconoce las partes de su cuerpo", "Comprende las reglas del juego"], hacer: ["Coordina sus movimientos", "Corre, salta y mantiene el equilibrio"] },
  religion: { saber: ["Reconoce acciones de respeto", "Identifica valores de convivencia"], hacer: ["Ayuda a sus companeros", "Participa respetando su turno"] },
  musica: { saber: ["Distingue sonidos de su entorno", "Reconoce ritmos y melodias"], hacer: ["Sigue el ritmo con su cuerpo", "Participa en canciones y rondas"] },
  artes_plasticas: { saber: ["Distingue los colores", "Reconoce formas y texturas"], hacer: ["Recorta con tijera", "Utiliza la pinza fina al realizar sus trabajos"] },
  tecnica_tecnologica: { saber: ["Identifica materiales y sus usos", "Reconoce herramientas de trabajo"], hacer: ["Utiliza la pinza fina en el laberinto", "Construye con materiales de su entorno"] }
};
export function criteriosInicial(dimension, materiaId) {
  if (dimension === "ser") return ["Respeta a sus companeros", "Valora su nombre e identidad", "Comparte sus utiles y materiales"];
  return criteriosPorMateria[materiaId]?.[dimension] || [];
}
export function materiasInicial(schedule) {
  const ids = new Set(Object.values(schedule?.clases || {}).flatMap((row) => Object.values(row)));
  return SUBJECTS.filter((subject) => !ids.size || ids.has(subject.id));
}
export function registrosAlumnoInicial(records, alumnoId) {
  return records.filter((item) => item.alumnoId === alumnoId && item.tipo !== "informe").sort((a, b) => {
    const time = (item) => item.createdAt?.toMillis?.() ?? item.createdAt?.seconds * 1000 ?? 0;
    return (time(b) || 0) - (time(a) || 0) || String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(a.id).localeCompare(String(b.id));
  });
}
export function firmaRegistrosInicial(records, alumnoId) {
  return firmaFuentes(registrosAlumnoInicial(records, alumnoId));
}
export function validarSeguimientoInicial(context, input) {
  cursoInicial(context, input.cursoId);
  exigirTrimestreDocente(context, input.trimestreId);
  if (!trimestresInicial.some((item) => item.id === input.trimestreId)) throw new Error("Selecciona un trimestre valido.");
  if (!String(input.alumnoId || "").trim()) throw new Error("Selecciona un estudiante.");
  if (!["observacion", "bitacora", "informe"].includes(input.tipo)) throw new Error("El tipo de registro no es valido.");
  const descripcion = String(input.descripcion || "").trim();
  const base = { cursoId: input.cursoId, trimestreId: input.trimestreId, alumnoId: input.alumnoId, tipo: input.tipo, descripcion };
  if (input.tipo === "informe") {
    if (!descripcion || descripcion.length > 200) throw new Error("El informe debe tener entre 1 y 200 caracteres.");
    if (typeof input.aprobado !== "boolean" || !["docente", "ia"].includes(input.origen) || !/^[0-9]+-[a-f0-9]+$/.test(input.fuentesFirma || "")) throw new Error("Revisa el estado y las fuentes del informe.");
    return { ...base, aprobado: input.aprobado, origen: input.origen, fuentesFirma: input.fuentesFirma };
  }
  const materiaId = String(input.materiaId || "");
  if ((input.tipo === "observacion" || materiaId) && !SUBJECTS.some((subject) => subject.id === materiaId)) throw new Error("Selecciona una materia valida.");
  if (input.tipo === "bitacora") {
    if (!descripcion || descripcion.length > 5000) throw new Error("La bitacora admite entre 1 y 5000 caracteres.");
    return { ...base, materiaId };
  }
  const criterio = String(input.criterio || "").trim();
  if (!dimensionesInicial.some((item) => item.id === input.dimension) || !valoracionesInicial.some((item) => item.id === input.valoracion) || !criterio || criterio.length > 200 || descripcion.length > 1000) throw new Error("Revisa el criterio, la valoracion y la observacion.");
  return { ...base, materiaId, dimension: input.dimension, criterio, valoracion: input.valoracion };
}
export function validarEdicionBitacoraInicial(context, input, previous) {
  if (!previous || previous.tipo !== "bitacora" || previous.docenteUid !== context.uid ||
    previous.cursoId !== input.cursoId || previous.trimestreId !== input.trimestreId || previous.alumnoId !== input.alumnoId) throw new Error("La observacion no pertenece a este alumno y docente.");
  if (previous.descripcion !== input.descripcionAnterior) throw new Error("La observacion cambio. Cierra el editor y actualiza el seguimiento antes de volver a editar.");
  return validarSeguimientoInicial(context, { ...previous, descripcion: input.descripcion });
}
export const observacionesDiarias = [
  { id: "realiza", label: "Realiza la actividad", short: "Realiza", icon: "check" },
  { id: "apoyo", label: "Necesita apoyo", short: "Con apoyo", icon: "hand-helping" },
  { id: "no_realiza", label: "No realiza la actividad", short: "No realiza", icon: "minus" },
  { id: "distraido", label: "Se distrae", short: "Se distrae", icon: "focus" }
];
export const trimestresInicial = [
  { id: "t1", label: "1er trimestre" }, { id: "t2", label: "2do trimestre" }, { id: "t3", label: "3er trimestre" }
];
export const estadosAsistenciaInicial = [
  { id: "presente", short: "P", label: "Presente" },
  { id: "falta", short: "F", label: "Falta" },
  { id: "atraso", short: "A", label: "Atraso" },
  { id: "licencia", short: "L", label: "Licencia" }
];
export const escaparInicial = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
export function cursoInicial(context, id) {
  const course = context?.courses?.find((item) => item.id === id);
  if (context?.errorModalidad || context?.courses?.some((item) => !isQualitativeCourse(item.id)) || !course || !isQualitativeCourse(course.id)) {
    throw new Error("El curso no pertenece a la asignacion cualitativa del docente.");
  }
  return course;
}
export function validarRegistroInicial(context, input) {
  cursoInicial(context, input.cursoId);
  exigirTrimestreDocente(context, input.trimestreId);
  const descripcion = String(input.descripcion || "").trim();
  if (descripcion.length > 1500) throw new Error("La descripcion admite hasta 1500 caracteres.");
  if (!trimestresInicial.some((item) => item.id === input.trimestreId)) throw new Error("Selecciona un trimestre valido.");
  if (!["diario", "semanal"].includes(input.tipo)) throw new Error("El tipo de registro no es valido.");
  const alumnoId = String(input.alumnoId || "");
  const estado = input.tipo === "diario" ? String(input.estado || "") : "";
  if (input.tipo === "diario" && (!alumnoId || !observacionesDiarias.some((item) => item.id === estado))) throw new Error("Selecciona el alumno y una observacion diaria.");
  if (input.tipo === "semanal" && !descripcion) throw new Error("Escribe una observacion para la bitacora.");
  const date = validarFechaGestion(input.fecha, context.gestionId);
  return { cursoId: input.cursoId, trimestreId: input.trimestreId, tipo: input.tipo, alumnoId, estado, descripcion, fecha: input.tipo === "semanal" ? inicioSemanaInicial(date) : date };
}
export function inicioSemanaInicial(value) {
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const monday = date.toISOString().slice(0, 10);
  return monday.slice(0, 4) === value.slice(0, 4) ? monday : `${value.slice(0, 4)}-01-01`;
}
export function claveRegistroInicial(item) { return JSON.stringify([item.tipo, item.fecha, item.alumnoId || ""]); }
export function idRegistroInicial(uid, item) { return [uid, item.tipo, item.fecha, item.cursoId, item.alumnoId || "curso"].join("_"); }
export function resumirAsistenciaInicial(students, records = {}, drafts = {}) {
  const totals = { presente: 0, falta: 0, atraso: 0, licencia: 0, sinRegistro: 0 };
  for (const student of students) {
    const state = drafts[student.id] || records[student.id]?.estado;
    const key = state === "permiso" ? "licencia" : state;
    if (Object.hasOwn(totals, key)) totals[key]++;
    else totals.sinRegistro++;
  }
  return totals;
}
