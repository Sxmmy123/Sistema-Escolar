import { parseStudentsBulk } from "./parsearAlumnos.js";
import { validateStudentRows } from "./tablaAlumnos.js";

export async function registrarTablaAlumnos(course, rows, { importar, crearAcceso, onProgress = () => {}, isSessionActive = () => true }) {
  const { entries, errors } = validateStudentRows(rows);
  if (errors.size) throw new Error("Corrige las filas marcadas antes de guardar.");
  if (!entries.length) throw new Error("No hay alumnos nuevos para guardar.");
  const checkSession = () => { if (!isSessionActive()) throw new Error("La sesion cambio. Se detuvo el registro."); };
  checkSession();
  const students = await importar(course, entries.map(({ nombre, ci, correo, sexo }) => ({ nombre, ci, correo, ...(sexo ? { sexo } : {}) })));
  const byCi = new Map(students.map((student) => [String(student.ci).toUpperCase(), student]));
  const results = [];
  for (const [index, entry] of entries.entries()) {
    checkSession();
    onProgress(index + 1, entries.length, entry.key);
    const student = byCi.get(entry.ci);
    if (!student) throw new Error("El registro no devolvio la identidad esperada. No se crearon mas accesos.");
    if (student.authUid) {
      results.push({ key: entry.key, student, created: false, success: true, password: "" });
      continue;
    }
    try {
      const access = await crearAcceso(student, course, undefined, { temporaryPassword: entry.password, email: entry.correo });
      results.push({ key: entry.key, student: { ...student, authUid: access.uid, authEmail: access.authEmail }, created: access.created, success: true, password: access.created ? entry.password : "" });
    } catch (error) {
      results.push({ key: entry.key, student, success: false, error: error.message || "No se pudo crear el acceso." });
    }
  }
  return results;
}

export async function registrarAlumnosConAcceso(course, rawText, { importar, crearAcceso, onProgress = () => {} }) {
  const parsed = parseStudentsBulk(rawText, course?.id);
  if (!parsed.length) throw new Error("Ingresa el nombre completo y CI del alumno.");
  for (const student of parsed) {
    if (!student.ci || !/^[a-z0-9._-]+$/i.test(student.ci)) {
      throw new Error(`Ingresa un CI valido para ${student.nombre}.`);
    }
  }

  const students = await importar(course, rawText);
  const resultado = { students, creados: 0, existentes: 0, pendientes: [] };
  // El registro academico se conserva si Authentication falla; el acceso se puede reintentar.
  for (const [index, student] of students.entries()) {
    onProgress(index + 1, students.length);
    if (student.authUid) {
      resultado.existentes += 1;
      continue;
    }
    try {
      const access = await crearAcceso(student, course);
      if (access.created) resultado.creados += 1;
      else resultado.existentes += 1;
    } catch (error) {
      resultado.pendientes.push({ alumnoId: student.id, nombre: student.nombre, error: error.message || "No se pudo crear el acceso." });
    }
  }
  return resultado;
}
