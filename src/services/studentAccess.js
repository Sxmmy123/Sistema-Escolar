import { createUserWithEmailAndPassword, deleteUser, signOut } from "firebase/auth";
import { deleteField, doc, getDoc, increment, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, creatorAuth, firestore } from "../firebase/client.js";
import { usernameToAuthEmail } from "./users.js";
import { generateStudentPassword, normalizeStudentAccessKey } from "./identidadAlumno.js";
import { documentoGestion } from "./rutasFirestore.js";

export { normalizeStudentAccessKey } from "./identidadAlumno.js";

const defaultClients = { auth, creatorAuth, firestore };

export async function createStudentAuthAccess(student, course = null, clients = defaultClients) {
  const adminUid = clients.auth.currentUser?.uid;
  if (!adminUid) throw new Error("Ingresa como administrador para preparar los accesos.");
  const usuario = normalizeStudentAccessKey(student?.ci || student?.usuario || student?.id);
  if (!student?.id || !/^[a-z0-9._-]+$/i.test(usuario)) throw new Error("El alumno no tiene un usuario valido.");
  const studentRef = doc(clients.firestore, "alumnos", student.id);
  const matriculaRef = documentoGestion(clients.firestore, "matriculas", student.id);
  const usernameRef = doc(clients.firestore, "indice_accesos", usuario);
  const [studentSnap, matriculaSnap, usernameSnap] = await Promise.all([getDoc(studentRef), getDoc(matriculaRef), getDoc(usernameRef)]);
  if (!studentSnap.exists()) throw new Error("El alumno ya no esta registrado. Actualiza la lista antes de crear su acceso.");
  const registeredStudent = studentSnap.data();
  if (normalizeStudentAccessKey(registeredStudent.ci || registeredStudent.usuario || student.id) !== usuario) {
    throw new Error("El usuario del alumno cambio. Actualiza la lista antes de crear su acceso.");
  }
  const courseId = matriculaSnap.exists() ? matriculaSnap.data().cursoId : "";
  if (!courseId || (course?.id && courseId !== course.id)) {
    throw new Error("El curso del alumno cambio o no esta asignado. Actualiza la lista antes de crear su acceso.");
  }
  const existingUid = registeredStudent.authUid || (usernameSnap.exists() ? usernameSnap.data().uid : "");
  if (usernameSnap.exists() && existingUid && usernameSnap.data().uid !== existingUid) {
    throw new Error("Ese usuario ya esta vinculado a otra cuenta. No se modifico ningun acceso.");
  }
  const active = registeredStudent.activo !== false && matriculaSnap.data().estado === "activo";
  let credential = null;
  let uid = existingUid;
  let authEmail = registeredStudent.authEmail || usernameToAuthEmail(usuario);
  let temporary = null;

  try {
    if (uid) {
      const profile = await getDoc(doc(clients.firestore, "usuarios", uid));
      if (!profile.exists() || profile.data().rol !== "alumno" || profile.data().alumnoId !== student.id) {
        throw new Error("El usuario ya pertenece a otra cuenta. No se modifico esa cuenta.");
      }
      authEmail = profile.data().authEmail || authEmail;
    } else {
      temporary = generateStudentPassword();
      credential = await createUserWithEmailAndPassword(clients.creatorAuth, authEmail, temporary);
      uid = credential.user.uid;
    }

    const batch = writeBatch(clients.firestore);
    batch.set(doc(clients.firestore, "usuarios", uid), {
      nombre: registeredStudent.nombre || usuario, usuario, authEmail, rol: "alumno",
      alumnoId: student.id, activo: active,
      ...(credential ? { createdAt: serverTimestamp(), createdBy: adminUid } : {}),
      updatedAt: serverTimestamp()
    }, { merge: true });
    batch.set(studentRef, { authUid: uid, authEmail, password: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
    batch.set(usernameRef, { uid, authEmail });
    if (clients.auth.currentUser?.uid !== adminUid) throw new Error("La sesion cambio antes de guardar el acceso. Vuelve a ingresar como administrador.");
    await batch.commit();
    return { created: Boolean(credential), usuario, uid, alumnoId: student.id, nombre: registeredStudent.nombre || usuario, password: temporary || "" };
  } catch (error) {
    if (credential) {
      try {
        await deleteUser(credential.user);
      } catch {
        throw new Error("No se guardo el perfil y no se pudo revertir la cuenta creada. Administracion debe revisar Firebase Authentication antes de reintentar.");
      }
    }
    if (error.code === "auth/email-already-in-use") {
      throw new Error("Ya existe una cuenta en Authentication para este usuario, pero falta vincularla. Administracion debe revisar esa cuenta; no se cambio su contrasena.");
    }
    throw error;
  } finally {
    if (credential) await signOut(clients.creatorAuth).catch(() => {});
  }
}

export async function setStudentAccessActive(student, active, clients = defaultClients) {
  if (!student?.id) throw new Error("No se encontro el alumno.");
  const ref = doc(clients.firestore, "alumnos", student.id);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error("El alumno ya no esta registrado.");
  const uid = snapshot.data().authUid || "";
  const batch = writeBatch(clients.firestore);
  batch.update(doc(clients.firestore, "alumnos", student.id), {
    activo: Boolean(active),
    updatedAt: serverTimestamp()
  });
  batch.update(documentoGestion(clients.firestore, "matriculas", student.id), {
    estado: active ? "activo" : "retirado", updatedAt: serverTimestamp()
  });
  if (uid) batch.update(doc(clients.firestore, "usuarios", uid), { activo: Boolean(active), updatedAt: serverTimestamp() });
  batch.update(doc(clients.firestore, "configuracion", "sistema"), { revisionAlumnos: increment(1), updatedAt: serverTimestamp() });
  await batch.commit();
}
