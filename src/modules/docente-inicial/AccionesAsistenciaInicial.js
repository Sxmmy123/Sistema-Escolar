import { alumnosInicial } from "./SeguimientoInicial.js";
import { guiaAsistenciaInicial, opcionesAsistenciaInicial } from "./AsistenciaInicial.js";

export function crearAccionesAsistenciaInicial({ state, data, dialog, draw, run, assertWritable }) {
  const students = () => alumnosInicial(state);
  const reset = () => { state.attendanceMode = "lista"; state.attendanceStudentId = ""; state.attendanceGuidedIndex = 0; };
  return {
    reset,
    renderGuide() {
      if (state.route !== "/docente/asistencia" || state.attendanceMode !== "guia" || !students().length) return;
      dialog("Modo guia", guiaAsistenciaInicial(state), () => { state.attendanceMode = "lista"; draw(); });
    },
    input(target) {
      const id = target.dataset?.initialAttendanceNote;
      if (!id || !students().some((item) => item.id === id)) return false;
      state.attendanceNote(id).observacion = target.value.slice(0, 1500); return true;
    },
    click(button) {
      if (state.route !== "/docente/asistencia") return false;
      if (state.busy) return true;
      const id = button.dataset.initialAttendanceOpen;
      if (id && students().some((item) => item.id === id)) { state.attendanceStudentId = state.attendanceStudentId === id ? "" : id; state.message = ""; state.error = false; draw(); return true; }
      if (["lista", "guia"].includes(button.dataset.initialAttendanceMode)) { state.attendanceMode = button.dataset.initialAttendanceMode; state.attendanceStudentId = ""; state.message = ""; state.error = false; draw(); return true; }
      if (button.hasAttribute("data-initial-attendance-prev") || button.hasAttribute("data-initial-attendance-next")) {
        const step = button.hasAttribute("data-initial-attendance-next") ? 1 : -1;
        state.attendanceGuidedIndex = Math.max(0, Math.min(students().length - 1, state.attendanceGuidedIndex + step)); draw(); return true;
      }
      const status = button.dataset.initialAttendance, student = students().find((item) => item.id === button.dataset.student);
      if (!status || !opcionesAsistenciaInicial.some((item) => item.id === status) || !student) return false;
      const { courseId, date, termId } = state, guide = state.attendanceMode === "guia", note = state.attendanceNote(student.id).observacion;
      state.attendanceSavingId = student.id; state.autoSaving = true;
      run(async (current) => {
        try {
          assertWritable(); await data.guardarAsistencia(courseId, student, date, termId, status, note);
          if (!current()) return;
          state.attendanceStudentId = "";
          if (guide) {
            if (state.attendanceGuidedIndex >= students().length - 1) { state.attendanceGuidedIndex = 0; state.attendanceMode = "lista"; }
            else state.attendanceGuidedIndex++;
          }
        } finally { state.attendanceSavingId = ""; state.autoSaving = false; }
      });
      return true;
    }
  };
}
