export const GRUPO_INICIAL = "multigrado";
export function cursosGrupoInicial(context) {
  const courses = context.courses || [];
  if (courses.some((course) => !["inicial", "preinicial"].includes(course.id))) return [];
  return ["preinicial", "inicial"].filter((id) => courses.some((course) => course.id === id));
}
export const esMultigradoInicial = (context) => cursosGrupoInicial(context).length === 2;
export const separaCursosInicial = (route) => ["/docente/resumenes", "/docente/informe"].includes(route);
export function cursoTrabajoInicial(state) {
  return state.courseId === GRUPO_INICIAL && esMultigradoInicial(state.context)
    ? { id: GRUPO_INICIAL, nombre: "Inicial y Preinicial", multigrado: true }
    : state.context.courses.find((course) => course.id === state.courseId);
}
export function cursoActividadInicial(state, activity) {
  return activity?.cursoId || (state.courseId === GRUPO_INICIAL ? cursosGrupoInicial(state.context)[0] : state.courseId);
}
