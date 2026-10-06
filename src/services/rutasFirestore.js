import { collection, doc, getDoc } from "firebase/firestore";

export const VERSION_MODELO = 2;
const COLECCIONES_GESTION = new Set([
  "matriculas", "asignaciones", "horarios", "actividades", "asistencias", "calificaciones", "comunicados"
]);
let configuracion = { gestionActivaId: String(new Date().getFullYear()), versionModelo: 0 };

export function validarGestion(value) {
  const id = String(value ?? "");
  if (!/^20\d{2}$/.test(id)) throw new Error("La gestion debe ser un ano entre 2000 y 2099.");
  return id;
}

export function gestionActual() {
  return configuracion.gestionActivaId;
}

export function configuracionActual() {
  return { ...configuracion };
}

export function establecerConfiguracion(data = {}) {
  configuracion = {
    ...data,
    gestionActivaId: validarGestion(data.gestionActivaId || new Date().getFullYear()),
    versionModelo: Number(data.versionModelo || 0)
  };
  return configuracionActual();
}

export async function cargarConfiguracion(db) {
  const snapshot = await getDoc(doc(db, "configuracion", "sistema"));
  return establecerConfiguracion(snapshot.exists() ? snapshot.data() : {});
}

export function rutaGestion(nombre, gestionId = gestionActual()) {
  if (!COLECCIONES_GESTION.has(nombre)) throw new Error(`Coleccion academica desconocida: ${nombre}`);
  return ["gestiones", validarGestion(gestionId), nombre];
}

export function coleccionGestion(db, nombre, gestionId) {
  return collection(db, ...rutaGestion(nombre, gestionId));
}

export function documentoGestion(db, nombre, id, gestionId) {
  return doc(coleccionGestion(db, nombre, gestionId), id);
}

export function documentoSeguimiento(db, uid, alumnoId, trimestreId, gestionId = gestionActual()) {
  if (!["t1", "t2", "t3"].includes(trimestreId)) throw new Error("Trimestre no valido.");
  return doc(db, "usuarios", uid, "seguimientos", `${validarGestion(gestionId)}_${trimestreId}_${alumnoId}`);
}

export function claveCache(tipo, uid, ...partes) {
  return ["escolar", `v${VERSION_MODELO}`, gestionActual(), uid, tipo, ...partes].join("_");
}
