import { COURSES, SUBJECTS } from "../data/catalog.js";

export function modalidadDeCursos(courseIds = []) {
  const courses = courseIds.map((id) => COURSES.find((course) => course.id === id));
  if (courses.some((course) => !course)) throw new Error("La asignacion incluye un curso anterior o desconocido. Administracion debe revisarla.");
  const levels = new Set(courses.map((course) => course.nivel));
  if (levels.size > 1) throw new Error("Un docente no puede combinar Inicial o Preinicial con Primaria.");
  const nivelDocente = courses[0]?.nivel || "";
  return { nivelDocente, modalidadEvaluacion: nivelDocente === "inicial" ? "cualitativa" : nivelDocente === "primaria" ? "cuantitativa" : "" };
}

export function validarAsignacionesDocente(assignments) {
  if (!assignments || typeof assignments !== "object" || Array.isArray(assignments) || !Object.keys(assignments).length) {
    throw new Error("Selecciona al menos un curso para el docente.");
  }
  const mode = modalidadDeCursos(Object.keys(assignments));
  for (const value of Object.values(assignments)) {
    const subjects = value?.materias;
    if (!Array.isArray(subjects) || (mode.nivelDocente === "primaria" && !subjects.length)) {
      throw new Error("Cada curso de Primaria necesita al menos una materia.");
    }
    if (mode.nivelDocente === "inicial" && subjects.length) throw new Error("Inicial y Preinicial no usan las materias de calificacion numerica de Primaria.");
    if (subjects.some((id) => !SUBJECTS.some((subject) => subject.id === id))) throw new Error("La asignacion contiene una materia no valida.");
  }
  return mode;
}

export function modalidadDeContexto(context) {
  const mode = modalidadDeCursos((context.courses || []).map((course) => course.id));
  const declared = context.profile?.nivelDocente;
  if (declared && !["inicial", "primaria"].includes(declared)) throw new Error("El nivel de la cuenta no es valido. Administracion debe revisarlo.");
  if (mode.nivelDocente && declared && declared !== mode.nivelDocente) throw new Error("El nivel de la cuenta no coincide con sus cursos. Administracion debe revisarlo.");
  const result = mode.nivelDocente ? mode : { nivelDocente: declared || "primaria", modalidadEvaluacion: declared === "inicial" ? "cualitativa" : "cuantitativa" };
  if (context.profile?.modalidadEvaluacion && context.profile.modalidadEvaluacion !== result.modalidadEvaluacion) throw new Error("La modalidad de la cuenta no coincide con sus cursos. Administracion debe revisarla.");
  return result;
}
