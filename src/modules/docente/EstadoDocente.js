import { TRIMESTERS, saveTeacherTrimesterPreference, todayIso } from "../../services/teacherData.js";

export const teacherState = {
  context: null,
  selectedCourseId: sessionStorage.getItem("docenteCursoId") || "",
  trimesterId: sessionStorage.getItem("docenteTrimestreId") || "t1",
  pendingTrimesterId: "",
  attendanceDate: todayIso(),
  attendanceMode: sessionStorage.getItem("docenteAsistenciaModo") || "lista",
  selectedAttendanceStudentId: "",
  attendanceModalStudentId: "",
  attendanceCoursePickerOpen: false,
  attendanceModalTop: 96,
  guidedModalTop: 120,
  guidedIndex: 0,
  taskMonth: todayIso().slice(0, 7),
  taskModalDate: "",
  taskDraftCourseId: "",
  taskDraftMateriaId: "",
  taskDraftTipo: "",
  taskEditActivityId: "",
  activities: [],
  selectedActivityId: "",
  selectedSubjectId: sessionStorage.getItem("docenteMateriaId") || "",
  gradeDate: sessionStorage.getItem("docenteCalificarFecha") || todayIso(),
  gradeScope: sessionStorage.getItem("docenteCalificarVista") || "dia",
  gradeModalActivityId: "",
  gradeStudentId: "",
  gradeIndex: 0,
  gradeMode: sessionStorage.getItem("docenteCalificarModo") || "guiado",
  gradeModalClosed: true,
  notesCriterionId: "",
  notesCriterionOpen: false,
  notesGradeActivityId: "",
  notesGradeStudentId: "",
  notesGradeKind: "",
  notesGradeGuided: false,
  regularizationShowLow: sessionStorage.getItem("docenteRegularizacionBajas") === "1",
  regularizationLowLimit: Number(sessionStorage.getItem("docenteRegularizacionLimite") || 50),
  regularizationSearch: "",
  regularizationFilter: sessionStorage.getItem("docenteRegularizacionFiltro") || "todos",
  regularizationGradeActivityId: "",
  regularizationGradeStudentId: ""
};

export function selectedTrimester() {
  return TRIMESTERS.find((item) => item.id === teacherState.trimesterId) || TRIMESTERS[0];
}

export function validTrimesterId(trimesterId) {
  return TRIMESTERS.some((item) => item.id === trimesterId) ? trimesterId : "t1";
}

function trimesterStorageKey(context = teacherState.context) {
  const uid = context?.uid || "docente";
  return `docente_trimestre_activo_${uid}`;
}

export function loadSavedTrimester(context = teacherState.context) {
  const saved = context?.profile?.trimestreActivo || localStorage.getItem(trimesterStorageKey(context)) || sessionStorage.getItem("docenteTrimestreId");
  teacherState.trimesterId = validTrimesterId(saved);
  sessionStorage.setItem("docenteTrimestreId", teacherState.trimesterId);
  localStorage.setItem(trimesterStorageKey(context), teacherState.trimesterId);
}

export function saveActiveTrimester(context = teacherState.context) {
  sessionStorage.setItem("docenteTrimestreId", teacherState.trimesterId);
  localStorage.setItem(trimesterStorageKey(context), teacherState.trimesterId);
}

export function setActiveTrimester(trimesterId, options = {}) {
  teacherState.trimesterId = validTrimesterId(trimesterId);
  teacherState.pendingTrimesterId = "";
  teacherState.selectedActivityId = "";
  teacherState.gradeModalActivityId = "";
  teacherState.notesCriterionId = "";
  teacherState.notesGradeActivityId = "";
  teacherState.regularizationGradeActivityId = "";
  saveActiveTrimester(options.context || teacherState.context);
}

export async function persistActiveTrimester(context = teacherState.context) {
  try {
    await saveTeacherTrimesterPreference(context?.uid, teacherState.trimesterId);
    if (context?.profile) context.profile.trimestreActivo = teacherState.trimesterId;
  } catch (error) {
    console.warn("No se pudo guardar el trimestre activo en Firebase", error);
  }
}
