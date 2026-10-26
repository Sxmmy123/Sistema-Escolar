export const STUDENT_TRIMESTERS = [
  { id: "t1", label: "1er trimestre" },
  { id: "t2", label: "2do trimestre" },
  { id: "t3", label: "3er trimestre" }
];

export const normalizarTrimestreAlumno = (value) => STUDENT_TRIMESTERS.some((item) => item.id === value) ? value : "";
export const etiquetaTrimestreAlumno = (value) => STUDENT_TRIMESTERS.find((item) => item.id === value)?.label || STUDENT_TRIMESTERS[0].label;

const fechaDeGestion = (value, today) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && value.slice(0, 4) === today.slice(0, 4);
const fechaVigente = (value, today) => fechaDeGestion(value, today) && value <= today;

export function trimestreAutomaticoAlumno({ periods = [], activities = [], attendance = [], today }) {
  const activityTerms = new Set(activities.filter((item) => item.activo !== false && !item.interno && fechaDeGestion(item.fecha, today)).map((item) => item.trimestreId));
  const attendanceTerms = new Set(attendance.filter((item) => fechaVigente(item.fecha, today)).map((item) => item.trimestreId));
  // La senal compartida evita consultar las asistencias privadas de los companeros.
  const enabled = new Set(periods.filter((item) => fechaDeGestion(item.actividadFecha, today) && fechaVigente(item.asistenciaFecha, today)).map((item) => item.id));
  for (const term of activityTerms) if (attendanceTerms.has(term)) enabled.add(term);
  return STUDENT_TRIMESTERS.filter((item) => enabled.has(item.id)).at(-1)?.id || "t1";
}

export function resolverVistaTrimestreAlumno({ profile = {}, year, courseId, automatic }) {
  const preference = profile.preferencias?.vistasAlumnoPorGestion?.[year];
  const selected = normalizarTrimestreAlumno(preference?.trimestreId);
  const anchor = normalizarTrimestreAlumno(preference?.automatico);
  const valid = preference?.cursoId === courseId && selected && anchor;
  return valid && automatic <= anchor ? selected : automatic;
}
