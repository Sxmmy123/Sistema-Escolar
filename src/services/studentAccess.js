import { createUserWithEmailAndPassword, deleteUser, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, deleteField, doc, getDoc, getDocs, increment, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { auth, creatorAuth, firestore } from "../firebase/client.js";
import { usernameToAuthEmail } from "./users.js";
import { studentPasswordForNewAccess, normalizeStudentAccessKey } from "./identidadAlumno.js";
import { documentoGestion } from "./rutasFirestore.js";

export { normalizeStudentAccessKey } from "./identidadAlumno.js";

const defaultClients = { auth, creatorAuth, firestore };

export async function createStudentAuthAccess(student, course = null, clients = defaultClients, options = {}) {
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
  let created = false;
  let recoveredProfileMissing = false;
  let uid = existingUid;
  const requestedEmail = String(options.email || "").trim().toLowerCase();
  if (requestedEmail && (requestedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail))) throw new Error("El correo no tiene formato valido.");
  let authEmail = registeredStudent.authEmail || requestedEmail || registeredStudent.correo || usernameToAuthEmail(usuario);
  let temporary = null;

  try {
    if (uid) {
      const profile = await getDoc(doc(clients.firestore, "usuarios", uid));
      if (!profile.exists() || profile.data().rol !== "alumno" || profile.data().alumnoId !== student.id) {
        throw new Error("El usuario ya pertenece a otra cuenta. No se modifico esa cuenta.");
      }
      authEmail = profile.data().authEmail || authEmail;
    } else {
      temporary = studentPasswordForNewAccess(options.temporaryPassword ?? "");
      try {
        credential = await createUserWithEmailAndPassword(clients.creatorAuth, authEmail, temporary);
        created = true;
      } catch (error) {
        if (error.code !== "auth/email-already-in-use" || options.linkExisting !== true) throw error;
        if (authEmail !== usernameToAuthEmail(usuario)) throw new Error("El correo registrado no coincide con el usuario del alumno. Revisa la cuenta antes de vincularla.");
        try {
          credential = await signInWithEmailAndPassword(clients.creatorAuth, authEmail, temporary);
        } catch (loginError) {
          if (["auth/invalid-credential", "auth/wrong-password", "auth/invalid-login-credentials"].includes(loginError.code)) {
            throw new Error("La cuenta ya existe, pero no acepta la contrasena indicada. No se cambio su clave ni ningun registro. Es necesario recuperar la contrasena de esa cuenta.");
          }
          throw loginError;
        }
        const existingProfile = await getDoc(doc(clients.firestore, "usuarios", credential.user.uid));
        recoveredProfileMissing = !existingProfile.exists();
        if (existingProfile.exists() && (existingProfile.data().rol !== "alumno" || existingProfile.data().alumnoId !== student.id || existingProfile.data().activo === false)) {
          throw new Error("La cuenta existente pertenece a otro perfil o esta retirada. No se modifico esa cuenta.");
        }
        const [linkedStudents, teacherAssignment] = await Promise.all([
          getDocs(query(collection(clients.firestore, "alumnos"), where("authUid", "==", credential.user.uid))),
          getDoc(documentoGestion(clients.firestore, "asignaciones", credential.user.uid))
        ]);
        if (linkedStudents.docs.some((item) => item.id !== student.id) || teacherAssignment.exists()) {
          throw new Error("La cuenta existente ya esta asignada a otra persona o a un docente. No se modifico esa cuenta.");
        }
      }
      uid = credential.user.uid;
    }

    const batch = writeBatch(clients.firestore);
    batch.set(doc(clients.firestore, "usuarios", uid), {
      nombre: registeredStudent.nombre || usuario, usuario, authEmail, rol: "alumno",
      alumnoId: student.id, activo: active,
      ...(created || recoveredProfileMissing ? { createdAt: serverTimestamp(), createdBy: adminUid, correoRecuperacion: requestedEmail || registeredStudent.correo || null } : {}),
      updatedAt: serverTimestamp()
    }, { merge: true });
    batch.set(studentRef, { authUid: uid, authEmail, password: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
    batch.set(usernameRef, { uid, authEmail });
    if (clients.auth.currentUser?.uid !== adminUid) throw new Error("La sesion cambio antes de guardar el acceso. Vuelve a ingresar como administrador.");
    await batch.commit();
    return { created, usuario, uid, authEmail, alumnoId: student.id, nombre: registeredStudent.nombre || usuario, password: created ? temporary : "" };
  } catch (error) {
    if (created) {
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
