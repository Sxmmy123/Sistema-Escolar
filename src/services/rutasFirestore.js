import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { gestionDelCalendario } from "./fechaEscolar.js";
import { estadoRegistroEscolar } from "./registroEscolar.js";

export const VERSION_MODELO = 2;
const COLECCIONES_GESTION = new Set([
  "matriculas", "asignaciones", "horarios", "actividades", "asistencias", "calificaciones", "comunicados", "registros_inicial", "actividades_inicial", "cursos"
]);
let configuracion = { gestionActivaId: gestionDelCalendario(), versionModelo: 0 };

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
    gestionActivaId: validarGestion(data.gestionActivaId || gestionDelCalendario()),
    versionModelo: Number(data.versionModelo || 0)
  };
  return configuracionActual();
}

export async function cargarConfiguracion(db) {
  const snapshot = await getDoc(doc(db, "configuracion", "sistema"));
  const data = snapshot.exists() ? snapshot.data() : {};
  const anual = data.versionModelo === VERSION_MODELO && /^20\d{2}$/.test(data.gestionActivaId)
    ? await getDoc(doc(db, "gestiones", data.gestionActivaId)) : null;
  return establecerConfiguracion({ ...data, gestionHabilitada: anual?.exists() === true && anual.data().ano === Number(data.gestionActivaId) });
}

export function observarConfiguracion(db, onChange, onError) {
  let stopYear = null;
  let selectedYear = "";
  let system = {};
  let annual = null;
  let disposed = false;
  const emit = () => {
    if (!disposed) onChange({ ...system, gestionHabilitada: annual?.exists() === true && annual.data().ano === Number(system.gestionActivaId) });
  };
  const stopSystem = onSnapshot(doc(db, "configuracion", "sistema"), (snapshot) => {
    system = snapshot.exists() ? snapshot.data() : {};
    const year = system.versionModelo === VERSION_MODELO && /^20\d{2}$/.test(system.gestionActivaId) ? system.gestionActivaId : "";
    if (year !== selectedYear) {
      stopYear?.();
      selectedYear = year;
      annual = null;
      if (year) {
        stopYear = onSnapshot(doc(db, "gestiones", year), (value) => {
          if (disposed || selectedYear !== year) return;
          annual = value;
          emit();
        }, onError);
        return;
      }
    }
    if (!year || annual) emit();
  }, onError);
  return () => { disposed = true; stopSystem(); stopYear?.(); };
}

export function asegurarRegistroDocente(date = new Date()) {
  const estado = estadoRegistroEscolar(configuracionActual(), date);
  if (!estado.habilitada) {
    const error = new Error(estado.mensaje);
    error.code = "gestion/no-habilitada";
    throw error;
  }
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
