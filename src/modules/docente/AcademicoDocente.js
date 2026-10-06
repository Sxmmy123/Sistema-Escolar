import { gradeNumber, normalizarEstadoAsistencia } from "../../services/calculoAcademico.js";
export * from "../../services/calculoAcademico.js";

export const attendanceStates = [
  { id: "presente", label: "Presente", short: "P", tone: "bg-green-100 text-green-800 border-green-200" },
  { id: "atraso", label: "Atraso", short: "A", tone: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  { id: "permiso", label: "Permiso", short: "L", tone: "bg-purple-100 text-purple-800 border-purple-200" },
  { id: "falta", label: "Falta", short: "F", tone: "bg-red-100 text-red-800 border-red-200" }
];

export function attendanceTone(stateId) {
  return attendanceStates.find((item) => item.id === normalizarEstadoAsistencia(stateId))?.tone || "bg-slate-100 text-slate-500 border-slate-200";
}

export function attendanceLabel(stateId) {
  return attendanceStates.find((item) => item.id === normalizarEstadoAsistencia(stateId))?.label || "Falta";
}

export function attendanceShort(stateId) {
  return attendanceStates.find((item) => item.id === normalizarEstadoAsistencia(stateId))?.short || "F";
}

export function gradeTone(value) {
  return gradeNumber(value) <= 50 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-800";
}


