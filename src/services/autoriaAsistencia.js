export function nombreDocenteAsistencia(value) {
  const name = String(value || "").trim().replace(/^(?:(?:prof(?:a)?\.?|profesor(?:a)?|lic\.?)\s+)+/i, "").replace(/\s+/g, " ");
  if (!name || /[@\d]/.test(name) || /^(docente|admin|administrador)$/i.test(name)) return "";
  return name;
}

export function identificarAutoresAsistencia(records = []) {
  const names = new Map();
  for (const record of records) {
    const name = nombreDocenteAsistencia(record.registradoPor);
    if (record.registradoPorUid && name) names.set(record.registradoPorUid, name);
  }
  return records.map((record) => ({ ...record, registradoPor: nombreDocenteAsistencia(record.registradoPor) || names.get(record.registradoPorUid) || "" }));
}
