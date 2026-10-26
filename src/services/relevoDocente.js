import { validarAsignacionesDocente } from "./modalidadDocente.js";

export const TRIMESTRES_DOCENTE = ["t1", "t2", "t3"];

export function trimestresDeAsignacion(assignment = {}) {
  if (!Object.hasOwn(assignment, "trimestres")) return [...TRIMESTRES_DOCENTE];
  if (!Array.isArray(assignment.trimestres) || assignment.trimestres.some((id) => !TRIMESTRES_DOCENTE.includes(id))) return [];
  return TRIMESTRES_DOCENTE.filter((id) => assignment.trimestres.includes(id));
}

export function puedeRegistrarTrimestre(context, term) {
  return trimestresDeAsignacion(context || {}).includes(term);
}

export function exigirTrimestreDocente(context, term) {
  if (!puedeRegistrarTrimestre(context, term)) throw new Error("Este trimestre es de consulta. Solo puedes registrar en los trimestres asignados por administracion.");
}

export function planificarRelevo(assignment, term) {
  if (!["t2", "t3"].includes(term)) throw new Error("Selecciona el segundo o tercer trimestre de inicio del reemplazo.");
  if (!assignment || assignment.reemplazadoPorUid) throw new Error("Este docente ya tiene un reemplazo en esta gestion.");
  const cursos = assignment.cursos || assignment.asignaciones;
  const modality = validarAsignacionesDocente(cursos);
  const terms = trimestresDeAsignacion(assignment);
  const anteriores = terms.filter((id) => id < term);
  const siguientes = terms.filter((id) => id >= term);
  if (!terms.includes(term) || !anteriores.length || !siguientes.length) throw new Error("El trimestre de inicio no permite separar el trabajo de ambos docentes.");
  return { cursos, modality, anteriores, siguientes };
}
