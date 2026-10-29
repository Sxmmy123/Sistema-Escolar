import { DirectorDashboard } from "./DirectorDashboard.js";
import { DirectorAttendance } from "./DirectorAttendance.js";
import { DirectorConfig } from "./DirectorConfig.js";
import { DirectorCoursesSchedules } from "./DirectorCoursesSchedules.js";
import { DirectorNotes } from "./DirectorNotes.js";
import { DirectorReports } from "./DirectorReports.js";
import { DirectorStudents, resetDirectorStudents } from "./DirectorStudents.js";
import { DirectorTeachers } from "./DirectorTeachers.js";
import { bindDirectorPages } from "./DirectorBindings.js";
import { bindDirectorAlerts } from "./DirectorAlerts.js";
import { refreshDirectorIcons } from "./DirectorUtils.js";

export const rutas = {
  "/director": DirectorDashboard,
  "/director/estudiantes": DirectorStudents,
  "/director/docentes": DirectorTeachers,
  "/director/cursos-horarios": DirectorCoursesSchedules,
  "/director/asistencia": DirectorAttendance,
  "/director/asistencias": DirectorAttendance,
  "/director/notas": DirectorNotes,
  "/director/reportes": DirectorReports,
  "/director/configuracion": DirectorConfig
};

export const vincular = bindDirectorPages;
export const actualizarIconos = refreshDirectorIcons;
export const desmontar = () => { resetDirectorStudents(); bindDirectorAlerts("/"); };
