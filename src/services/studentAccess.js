import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firestore } from "../firebase/client.js";

export function normalizeStudentAccessKey(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function studentPassword(username) {
  return String(username || "");
}

export async function ensureStudentLocalAccess(student, course = null) {
  const usuario = normalizeStudentAccessKey(student?.ci || student?.usuario || student?.id);
  if (!usuario || !student?.id) {
    return { created: false, skipped: true, reason: "Alumno sin usuario o id." };
  }

  const ref = doc(firestore, "accesos_alumnos", usuario);
  const snap = await getDoc(ref);
  const base = {
    alumnoId: student.id,
    usuario,
    ci: String(student.ci || usuario),
    cursoId: student.cursoId || course?.id || "",
    activo: student.activo !== false,
    password: studentPassword(usuario),
    updatedAt: serverTimestamp()
  };

  if (snap.exists()) {
    await setDoc(ref, base, { merge: true });
    return { created: false, skipped: false, usuario, password: studentPassword(usuario) };
  }

  await setDoc(ref, {
    ...base,
    createdAt: serverTimestamp()
  });

  return { created: true, skipped: false, usuario, password: studentPassword(usuario) };
}

export async function setStudentAccessActive(student, active) {
  const usuario = normalizeStudentAccessKey(student?.ci || student?.usuario || student?.id);
  if (!usuario) return;
  await setDoc(doc(firestore, "accesos_alumnos", usuario), {
    alumnoId: student.id,
    usuario,
    ci: String(student.ci || usuario),
    cursoId: student.cursoId || "",
    activo: Boolean(active),
    password: studentPassword(usuario),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function loginStudentAccess(login, password) {
  const usuario = normalizeStudentAccessKey(login);
  if (!usuario) throw new Error("Escribe el usuario o CI del alumno.");

  const snap = await getDoc(doc(firestore, "accesos_alumnos", usuario));
  if (!snap.exists()) {
    throw new Error("No existe acceso de alumno con ese usuario.");
  }

  const access = snap.data() || {};
  if (access.activo === false) {
    throw new Error("El acceso del alumno esta deshabilitado.");
  }

  if (normalizeStudentAccessKey(access.password) !== normalizeStudentAccessKey(password)) {
    throw new Error("La contrasena del alumno no es correcta.");
  }

  if (!access.alumnoId) {
    throw new Error("El acceso del alumno no tiene alumno vinculado.");
  }

  return {
    usuario,
    alumnoId: access.alumnoId,
    cursoId: access.cursoId || "",
    ci: access.ci || usuario
  };
}
