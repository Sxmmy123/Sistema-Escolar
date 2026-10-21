const importadoresPorRol = {
  admin: () => import("./admin/EntradaAdmin.js"),
  docente: () => import("./docente/EntradaDocente.js"),
  director: () => import("./director/EntradaDirector.js"),
  alumno: () => import("./alumno/EntradaAlumno.js")
};

export function crearCargaPorRol(importadores = importadoresPorRol) {
  const pendientes = new Map();
  const disponibles = new Map();

  return {
    obtener: (rol) => disponibles.get(rol),
    cargar(rol) {
      if (!Object.hasOwn(importadores, rol)) return Promise.reject(new Error("Rol no disponible"));
      if (!pendientes.has(rol)) {
        const carga = Promise.resolve().then(() => importadores[rol]()).then((modulo) => {
          disponibles.set(rol, modulo);
          return modulo;
        }).catch((error) => {
          pendientes.delete(rol);
          throw error;
        });
        pendientes.set(rol, carga);
      }
      return pendientes.get(rol);
    }
  };
}
