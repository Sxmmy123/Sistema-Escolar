export function claveActividad(activity = {}) {
  return JSON.stringify([
    activity.cursoId || "",
    activity.materiaId || "",
    activity.trimestreId || "t1",
    activity.fecha || "",
    String(activity.tipo || "tarea").toLowerCase(),
    String(activity.titulo || "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es")
  ]);
}

export function idAutoevaluacion(courseId, subjectId, trimesterId) {
  return `auto_${trimesterId}_${courseId}_${subjectId}_autoevaluacion`;
}
