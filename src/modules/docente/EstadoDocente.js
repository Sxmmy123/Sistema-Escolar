import { TRIMESTERS, saveTeacherTrimesterPreference, todayIso } from "../../services/teacherData.js";
import { claveCache } from "../../services/rutasFirestore.js";
import { exigirTrimestreDocente, puedeRegistrarTrimestre, trimestresDeAsignacion } from "../../services/relevoDocente.js";

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
  gradeIgnoreAttendance: sessionStorage.getItem("docenteCalificarIgnorarAsistencia") === "1",
  gradeModalClosed: true,
  notesCriterionId: "",
  notesCriterionOpen: false,
  notesGradeActivityId: "",
  notesGradeStudentId: "",
  notesGradeKind: "",
  notesGradeGuided: false,
  notesEditMode: false,
  notesEditDrafts: {},
  notesEditConfirmation: "",
  notesEditMessage: "",
  regularizationSearch: "",
  regularizationGradeActivityId: "",
  regularizationGradeStudentId: "",
  regularizationReportStudentId: "",
  regularizationSubject: { studentId: "", id: "all" },
  notificationFocus: null
};

export function selectedTrimester() {
  return TRIMESTERS.find((item) => item.id === teacherState.trimesterId) || TRIMESTERS[0];
}

export function validTrimesterId(trimesterId) {
  return TRIMESTERS.some((item) => item.id === trimesterId) ? trimesterId : "t1";
}

function trimesterStorageKey(context = teacherState.context) {
  const uid = context?.uid || "docente";
  return claveCache("trimestre", uid);
}

export function loadSavedTrimester(context = teacherState.context) {
  const saved = context?.profile?.trimestreActivo || localStorage.getItem(trimesterStorageKey(context)) || sessionStorage.getItem("docenteTrimestreId");
  teacherState.trimesterId = puedeRegistrarTrimestre(context, saved) ? validTrimesterId(saved) : trimestresDeAsignacion(context)[0] || "t1";
  sessionStorage.setItem("docenteTrimestreId", teacherState.trimesterId);
  localStorage.setItem(trimesterStorageKey(context), teacherState.trimesterId);
}

export function saveActiveTrimester(context = teacherState.context) {
  try {
    sessionStorage.setItem("docenteTrimestreId", teacherState.trimesterId);
    localStorage.setItem(trimesterStorageKey(context), teacherState.trimesterId);
  } catch {
    // Firebase conserva la preferencia aunque el navegador bloquee la copia local.
  }
}

export function setActiveTrimester(trimesterId, options = {}) {
  teacherState.trimesterId = validTrimesterId(trimesterId);
  teacherState.pendingTrimesterId = "";
  teacherState.selectedActivityId = "";
  teacherState.gradeModalActivityId = "";
  teacherState.notesCriterionId = "";
  teacherState.notesGradeActivityId = "";
  teacherState.notesEditMode = false;
  teacherState.notesEditDrafts = {};
  teacherState.notesEditConfirmation = "";
  teacherState.notesEditMessage = "";
  teacherState.regularizationGradeActivityId = "";
  teacherState.regularizationReportStudentId = "";
  teacherState.regularizationSubject = { studentId: "", id: "all" };
  saveActiveTrimester(options.context || teacherState.context);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("teacher-trimester-changed"));
}

export async function persistActiveTrimester(context = teacherState.context, trimesterId = teacherState.trimesterId, guardar = saveTeacherTrimesterPreference) {
  if (!TRIMESTERS.some((item) => item.id === trimesterId)) throw new Error("Trimestre no valido.");
  exigirTrimestreDocente(context, trimesterId);
  await guardar(context?.uid, trimesterId);
  if (context?.profile) context.profile.trimestreActivo = trimesterId;
  setActiveTrimester(trimesterId, { context });
}
