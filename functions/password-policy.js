export function validateInitialPassword(value, identifier = "") {
  if (typeof value !== "string" || value.trim().length < 12 || value.length > 128) {
    throw new Error("La clave temporal debe tener entre 12 y 128 caracteres.");
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === String(identifier).trim().toLowerCase() || /^\d+$/.test(normalized) || /^(.)\1+$/.test(normalized) || ["password1234", "password12345", "contrasena123", "qwertyuiop12"].includes(normalized)) {
    throw new Error("Usa una clave temporal diferente del CI y que no sea una secuencia comun.");
  }
  return value;
}

export function passwordChangeBlocksAccess(profile, config = {}) {
  return profile?.passwordChangeRequired === true && config?.modoDemostracion !== true;
}
