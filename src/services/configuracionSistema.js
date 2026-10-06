import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";
import { COURSES, SUBJECTS } from "../data/catalog.js";
import { establecerConfiguracion, validarGestion, VERSION_MODELO } from "./rutasFirestore.js";

export async function prepararGestion(gestionId, clients = { auth, firestore }) {
  const gestion = validarGestion(gestionId);
  const uid = clients.auth.currentUser?.uid;
  if (!uid) throw new Error("Ingresa como administrador.");
  const db = clients.firestore;
  const [sistema, institucion, catalogo, anual, perfil] = await Promise.all([
    getDoc(doc(db, "configuracion", "sistema")), getDoc(doc(db, "configuracion", "institucion")),
    getDoc(doc(db, "catalogos", "escolar")), getDoc(doc(db, "gestiones", gestion)), getDoc(doc(db, "usuarios", uid))
  ]);
  const batch = writeBatch(db);
  const datos = { limiteFaltasDirector: 4, ...(sistema.exists() ? sistema.data() : {}), gestionActivaId: gestion, versionModelo: VERSION_MODELO };
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
  if (!anual.exists()) batch.set(doc(db, "gestiones", gestion), { ano: Number(gestion), createdAt: serverTimestamp(), createdBy: uid });
  if (!catalogo.exists()) {
    batch.set(doc(db, "catalogos", "escolar"), { version: 1, createdAt: serverTimestamp() });
    for (const curso of COURSES) batch.set(doc(db, "catalogos", "escolar", "cursos", curso.id), { ...curso, activo: true });
    for (const [orden, materia] of SUBJECTS.entries()) batch.set(doc(db, "catalogos", "escolar", "materias", materia.id), { ...materia, orden, activo: true });
  }
  if (clients.auth.currentUser?.uid !== uid) throw new Error("La sesion cambio. Vuelve a ingresar.");
  await batch.commit();
  establecerConfiguracion(datos);
  return datos;
}
