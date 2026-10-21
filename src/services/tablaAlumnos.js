import Papa from "papaparse";
import { initialStudentPassword, normalizeStudentAccessKey, normalizeStudentSex } from "./identidadAlumno.js";

export const STUDENT_TABLE_FIELDS = ["nombre", "ci", "password", "correo", "sexo"];
export const MAX_STUDENT_ROWS = 200;
let rowSequence = 0;

export function newStudentRow(mode = "ci") {
  return { key: `alumno-${++rowSequence}`, nombre: "", ci: "", password: initialStudentPassword("", mode), correo: "", sexo: "", autoPassword: true, status: "", saved: false };
}

export function hasStudentData(row) {
  return Boolean(String(row.nombre || "").trim() || String(row.ci || "").trim() || String(row.correo || "").trim() || String(row.sexo || "").trim() || !row.autoPassword);
}

const headerKey = (text) => String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const headerFields = { nombre: "nombre", nombrecompleto: "nombre", alumno: "nombre", apellidosynombres: "nombre", ci: "ci", carnet: "ci", carnetdeidentidad: "ci", contrasena: "password", password: "password", correo: "correo", correoopcional: "correo", email: "correo", sexo: "sexo", genero: "sexo" };

export function pasteStudentCells(rows, text, startRow, startColumn, mode = "ci") {
  const parsed = Papa.parse(String(text), { delimiter: "\t", dynamicTyping: false, skipEmptyLines: false });
  if (parsed.errors.length) throw new Error("La tabla pegada tiene comillas o celdas incompletas.");
  const matrix = parsed.data;
  while (matrix.length && matrix.at(-1).every((value) => !String(value).trim())) matrix.pop();
  const headings = startColumn === 0 ? matrix[0]?.map((value) => headerFields[headerKey(value)]) : null;
  const withHeaders = headings?.includes("nombre") && headings.includes("ci");
  if (withHeaders) matrix.shift();
  if (startRow + matrix.length > MAX_STUDENT_ROWS) throw new Error("La tabla admite hasta 200 filas por curso.");
  if (!withHeaders && matrix.some((cells) => startColumn + cells.length > STUDENT_TABLE_FIELDS.length)) throw new Error("La tabla tiene mas columnas que el espacio seleccionado.");
  const result = rows.map((row) => ({ ...row }));
  for (const [offset, cells] of matrix.entries()) {
    const index = startRow + offset;
    while (result.length <= index) result.push(newStudentRow(mode));
    if (result[index].saved) throw new Error("Esa fila ya fue guardada. Pega los alumnos en filas nuevas.");
    const row = result[index];
    for (const [column, value] of cells.entries()) {
      const field = withHeaders ? headings[column] : STUDENT_TABLE_FIELDS[startColumn + column];
      if (!field) continue;
      row[field] = field === "sexo" ? normalizeStudentSex(value) : field === "password" ? String(value) : String(value).trim();
      if (field === "password") row.autoPassword = !value;
    }
    if (row.autoPassword && (mode !== "random" || !row.password)) row.password = initialStudentPassword(row.ci, mode);
    row.status = "";
    row.error = false;
  }
  return result;
}

export function validateStudentRows(rows) {
  const entries = [], errors = new Map(), identities = new Map(), emails = new Map();
  const fail = (key, message) => errors.set(key, [...(errors.get(key) || []), message]);
  for (const row of rows) {
    if (!hasStudentData(row)) continue;
    const nombre = String(row.nombre || "").trim().replace(/\s+/g, " ").toUpperCase();
    const ci = String(row.ci || "").trim().replace(/\s+/g, "").toUpperCase();
    const correo = String(row.correo || "").trim().toLowerCase();
    const sexo = normalizeStudentSex(row.sexo);
    if (ci) {
      const identity = normalizeStudentAccessKey(ci);
      if (identities.has(identity)) {
        fail(row.key, "CI repetido en la tabla.");
        fail(identities.get(identity), "CI repetido en la tabla.");
      } else identities.set(identity, row.key);
    }
    if (row.saved) continue;
    if (!nombre) fail(row.key, "Falta el nombre completo.");
    if (!ci || !/^[a-z0-9._-]+$/i.test(ci)) fail(row.key, "Ingresa un CI valido.");
    if (typeof row.password !== "string" || row.password.length < 6) fail(row.key, "La contrasena debe tener al menos 6 caracteres.");
    if (correo && (correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))) fail(row.key, "El correo no tiene formato valido.");
    if (sexo && !["M", "F"].includes(sexo)) fail(row.key, "Selecciona Masculino o Femenino en Sexo.");
    if (correo) {
      if (emails.has(correo)) {
        fail(row.key, "El correo ya esta usado en otra fila.");
        fail(emails.get(correo), "El correo ya esta usado en otra fila.");
      } else emails.set(correo, row.key);
    }
    entries.push({ key: row.key, nombre, ci, password: row.password, correo, ...(sexo ? { sexo } : {}) });
  }
  if (entries.length > MAX_STUDENT_ROWS) throw new Error("Guarda hasta 200 alumnos por carga.");
  return { entries, errors };
}

export function sortStudentsByName(students) {
  const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
  return [...students].sort((a, b) => collator.compare(a.nombre || "", b.nombre || "") || collator.compare(a.ci || "", b.ci || ""));
}
