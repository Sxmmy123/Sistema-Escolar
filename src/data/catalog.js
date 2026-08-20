export const COURSES = [
  { id: "preinicial_inicial", nombre: "Pre Inicial - Inicial", corto: "Inicial", orden: 0 },
  { id: "primero_a", nombre: "Primero A", corto: "1ro", orden: 1 },
  { id: "segundo_a", nombre: "Segundo A", corto: "2do", orden: 2 },
  { id: "tercero_a", nombre: "Tercero A", corto: "3ro", orden: 3 },
  { id: "cuarto_a", nombre: "Cuarto A", corto: "4to", orden: 4 },
  { id: "quinto_a", nombre: "Quinto A", corto: "5to", orden: 5 },
  { id: "sexto_a", nombre: "Sexto A", corto: "6to", orden: 6 }
];

export const SUBJECTS = [
  { id: "matematica", nombre: "Matematica", corto: "Mat", color: "#f8c7c7" },
  { id: "lenguaje", nombre: "Lenguaje", corto: "Leng", color: "#f6d3e6" },
  { id: "ciencias_naturales", nombre: "Ciencias Naturales", corto: "C. Nat", color: "#cfe8c1" },
  { id: "ciencias_sociales", nombre: "Ciencias Sociales", corto: "C. Soc", color: "#c9d8ef" },
  { id: "educacion_fisica", nombre: "Educacion Fisica", corto: "Ed. Fis", color: "#f8dfc2" },
  { id: "religion", nombre: "Religion", corto: "Rel", color: "#eee6bf" },
  { id: "musica", nombre: "Musica", corto: "Mus", color: "#bfe7e3" },
  { id: "artes_plasticas", nombre: "Artes Plasticas", corto: "Artes", color: "#d6cdea" },
  { id: "tecnica_tecnologica", nombre: "Tecnica Tecnologica", corto: "Tec", color: "#d7dbe0" }
];

export const DAYS = [
  { id: "lunes", label: "Lun" },
  { id: "martes", label: "Mar" },
  { id: "miercoles", label: "Mie" },
  { id: "jueves", label: "Jue" },
  { id: "viernes", label: "Vie" }
];

export const PRIMARY_PERIODS = [
  { id: "p1", label: "1", hora: "07:30 - 08:10" },
  { id: "p2", label: "2", hora: "08:10 - 08:50" },
  { id: "r1", label: "R", hora: "08:50 - 09:05", recreo: true },
  { id: "p3", label: "3", hora: "09:05 - 09:45" },
  { id: "p4", label: "4", hora: "09:45 - 10:25" },
  { id: "r2", label: "R", hora: "10:25 - 10:40", recreo: true },
  { id: "p5", label: "5", hora: "10:40 - 11:20" },
  { id: "p6", label: "6", hora: "11:20 - 12:00" }
];

export const INITIAL_PERIODS = [
  { id: "p1", label: "1", hora: "08:00 - 08:40" },
  { id: "p2", label: "2", hora: "08:40 - 09:20" },
  { id: "r1", label: "R", hora: "09:20 - 09:35", recreo: true },
  { id: "p3", label: "3", hora: "09:35 - 10:15" },
  { id: "p4", label: "4", hora: "10:15 - 10:55" },
  { id: "p5", label: "5", hora: "10:55 - 11:35" }
];

export function periodsForCourse(courseId) {
  return courseId === "preinicial_inicial" ? INITIAL_PERIODS : PRIMARY_PERIODS;
}

export function findCourse(courseId) {
  return COURSES.find((course) => course.id === courseId) || COURSES[0];
}

export function findSubject(subjectId) {
  return SUBJECTS.find((subject) => subject.id === subjectId) || null;
}
