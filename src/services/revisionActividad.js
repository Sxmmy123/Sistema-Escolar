export function revisionDisponibleParaRegularizar(activity = {}, today = "") {
  if (activity.estadoRevision !== "cerrada") return false;
  const availableFrom = String(activity.regularizacionDesde || "").slice(0, 10);
  const closedDate = String(activity.revisionFinalizadaFecha || "").slice(0, 10);
  return availableFrom ? availableFrom <= today : (!closedDate || closedDate < today);
}

export function actividadPendienteRegularizacion(activity = {}, grade = null, today = "") {
  if (!revisionDisponibleParaRegularizar(activity, today) || String(activity.fecha || "") > today) return false;
  return !grade || Number(grade.valor || 0) <= 0;
}
