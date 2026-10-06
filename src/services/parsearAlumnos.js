export function parseStudentsBulk(text, courseId) {
  const alumnos = String(text || "").split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const columnas = line.trim().split(/\t/).map((part) => part.trim());
    let nombre = columnas[0];
    let ci = columnas[1] || "";
    if (columnas.length === 1) {
      const match = nombre.match(/^(.+?)\s+(\d[\dA-Za-z._-]{3,})$/);
      if (match) [, nombre, ci] = match;
    }
    nombre = nombre.replace(/\s+/g, " ").toUpperCase();
    ci = ci.replace(/\s+/g, "").toUpperCase();
    if (!nombre || columnas.length > 2) throw new Error("Usa una fila por alumno: nombre completo y carnet opcional, separados con tabulador.");
    return { nombre, ci, cursoId: courseId };
  });
  const carnets = new Set();
  const nombresSinCi = new Set();
  for (const alumno of alumnos) {
    const conjunto = alumno.ci ? carnets : nombresSinCi;
    const clave = alumno.ci || alumno.nombre;
    if (conjunto.has(clave)) throw new Error(`Alumno repetido en la carga: ${alumno.nombre}.`);
    conjunto.add(clave);
  }
  return alumnos;
}
