import { bindDirectorAttendance } from "./DirectorAttendance.js";
import { bindDirectorCoursesSchedules } from "./DirectorCoursesSchedules.js";
import { bindDirectorDashboard } from "./DirectorDashboard.js";
import { bindDirectorNotes } from "./DirectorNotes.js";
import { bindDirectorStudents } from "./DirectorStudents.js";
import { bindDirectorTeachers } from "./DirectorTeachers.js";

export function bindDirectorPages(route) {
  bindDirectorDashboard(route);
  bindDirectorStudents(route);
  bindDirectorTeachers(route);
  bindDirectorCoursesSchedules(route);
  bindDirectorAttendance(route);
  bindDirectorNotes(route);
}
