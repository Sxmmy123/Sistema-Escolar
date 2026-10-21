import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";
import { COURSES, SUBJECTS } from "../data/catalog.js";
import { establecerConfiguracion, validarGestion, VERSION_MODELO } from "./rutasFirestore.js";
import { gestionDelCalendario } from "./fechaEscolar.js";

let cacheGestiones = null;

export async function listarGestiones(clients = { auth, firestore }) {
  const uid = clients.auth.currentUser?.uid;
  if (!uid) throw new Error("Ingresa como administrador.");
  const calendario = gestionDelCalendario(clients.now?.() ?? new Date());
  if (cacheGestiones?.uid === uid && cacheGestiones.db === clients.firestore && cacheGestiones.calendario === calendario) {
    return [...await cacheGestiones.promise];
  }
  const entrada = { uid, db: clients.firestore, calendario };
  entrada.promise = getDocs(collection(clients.firestore, "gestiones")).then((snapshot) => {
    if (clients.auth.currentUser?.uid !== uid) throw new Error("La sesion cambio. Vuelve a ingresar.");
    return snapshot.docs.map((item) => item.id).filter((id) => /^20\d{2}$/.test(id) && id <= calendario).sort().reverse();
  }).catch((error) => {
    if (cacheGestiones === entrada) cacheGestiones = null;
    throw error;
  });
  cacheGestiones = entrada;
  return [...await entrada.promise];
}

export async function prepararGestion(gestionId, clients = { auth, firestore }) {
  const gestion = validarGestion(gestionId);
  const calendario = gestionDelCalendario(clients.now?.() ?? new Date());
  if (gestion > calendario) throw new Error(`El ano actual es ${calendario}. No se pueden iniciar gestiones futuras.`);
  const uid = clients.auth.currentUser?.uid;
  if (!uid) throw new Error("Ingresa como administrador.");
  const db = clients.firestore;
  const [sistema, institucion, catalogo, anual, perfil] = await Promise.all([
    getDoc(doc(db, "configuracion", "sistema")), getDoc(doc(db, "configuracion", "institucion")),
    getDoc(doc(db, "catalogos", "escolar")), getDoc(doc(db, "gestiones", gestion)), getDoc(doc(db, "usuarios", uid))
  ]);
  const batch = writeBatch(db);
  const datos = { limiteFaltasDirector: 4, ...(sistema.exists() ? sistema.data() : {}), gestionActivaId: gestion, versionModelo: VERSION_MODELO };
  if (gestion < calendario && !anual.exists()) throw new Error("Solo puedes seleccionar gestiones anteriores que ya estan registradas.");
  if (sistema.exists() && sistema.data().gestionActivaId === gestion && sistema.data().versionModelo === VERSION_MODELO &&
      institucion.exists() && catalogo.exists() && anual.exists() && anual.data().ano === Number(gestion) && perfil.exists()) {
    if (clients.auth.currentUser?.uid !== uid) throw new Error("La sesion cambio. Vuelve a ingresar.");
    return establecerConfiguracion({ ...datos, gestionHabilitada: true });
  }
  if (!perfil.exists()) batch.set(doc(db, "usuarios", uid), {
    nombre: clients.auth.currentUser.displayName || "Administrador", rol: "admin", activo: true,
    authEmail: clients.auth.currentUser.email, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  batch.set(doc(db, "configuracion", "sistema"), {
    gestionActivaId: gestion, versionModelo: VERSION_MODELO,
    ...(!sistema.exists() ? { limiteFaltasDirector: 4 } : {}), updatedAt: serverTimestamp()
  }, { merge: true });
  if (!institucion.exists()) batch.set(doc(db, "configuracion", "institucion"), {
    nombre: "Unidad Educativa Ecologica Nueva Bolivia", distrito: "Caranavi", turno: "Manana",
    nivel: "Primaria Comunitaria Vocacional", updatedAt: serverTimestamp()
  });
  if (!anual.exists() || anual.data().ano !== Number(gestion)) batch.set(doc(db, "gestiones", gestion), { ano: Number(gestion), ...(!anual.exists() ? { createdAt: serverTimestamp(), createdBy: uid } : {}) }, { merge: true });
  if (!catalogo.exists()) {
    batch.set(doc(db, "catalogos", "escolar"), { version: 1, createdAt: serverTimestamp() });
    for (const curso of COURSES) batch.set(doc(db, "catalogos", "escolar", "cursos", curso.id), { ...curso, activo: true });
    for (const [orden, materia] of SUBJECTS.entries()) batch.set(doc(db, "catalogos", "escolar", "materias", materia.id), { ...materia, orden, activo: true });
  }
  if (clients.auth.currentUser?.uid !== uid) throw new Error("La sesion cambio. Vuelve a ingresar.");
  await batch.commit();
  cacheGestiones = null;
  return establecerConfiguracion({ ...datos, gestionHabilitada: true });
}
