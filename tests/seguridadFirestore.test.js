import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocs, getFirestore, query, runTransaction, serverTimestamp, setDoc, setLogLevel, terminate, updateDoc, where, writeBatch } from "firebase/firestore";
import { createStudentAuthAccess, setStudentAccessActive } from "../src/services/studentAccess.js";
import { getStudentContext, getStudentDashboardData } from "../src/services/studentData.js";
import { coleccionGestion, documentoGestion, documentoSeguimiento, establecerConfiguracion, observarConfiguracion } from "../src/services/rutasFirestore.js";
import { importStudents } from "../src/services/adminData.js";
import { registrarTablaAlumnos } from "../src/services/registroAlumnos.js";
import { newStudentRow, pasteStudentCells } from "../src/services/tablaAlumnos.js";
import { createSystemUser } from "../src/services/users.js";
import { listarGestiones, prepararGestion } from "../src/services/configuracionSistema.js";
import { actualizarActividadProtegida, eliminarActividadProtegida } from "../src/services/proteccionActividad.js";
import { finalizeActivityReview, saveGrade } from "../src/services/teacherData.js";
import { usernameToAuthEmail } from "../src/services/users.js";

const projectId = "demo-sistema-seguridad";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "";
if (process.env.GCLOUD_PROJECT !== projectId || !/^127\.0\.0\.1:\d+$/.test(firestoreHost) || !/^127\.0\.0\.1:\d+$/.test(authHost)) {
  throw new Error("Estas pruebas solo se ejecutan con los emuladores del proyecto demo-sistema-seguridad.");
}
setLogLevel("silent");
const apps = [];
const databases = [];
function client(name, uid = "", email = "") {
  const app = initializeApp({ projectId, apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com` }, name);
  const database = getFirestore(app);
  connectFirestoreEmulator(database, "127.0.0.1", Number(firestoreHost.split(":")[1]), uid ? { mockUserToken: { sub: uid, email } } : undefined);
  apps.push(app); databases.push(database);
  return { app, firestore: database };
}
function authClient(name) {
  const result = client(name);
  result.auth = getAuth(result.app);
  connectAuthEmulator(result.auth, `http://${authHost}`, { disableWarnings: true });
  return result;
}
const admin = client("admin", "admin-prueba", "smichmev@gmail.com");
const teacher = client("docente", "docente-a");
const teacherB = client("otro-docente", "docente-b");
const legacyTeacher = client("docente-formato-anterior", "docente-anterior");
const director = client("director", "director-a");
const student = client("alumno", "alumno-auth-a");
const anonymous = client("anonimo");
const creator = authClient("creador-emulado");
const migratedStudent = authClient("alumno-migrado");
const anual = new Set(["matriculas", "asignaciones", "horarios", "actividades", "asistencias", "calificaciones", "comunicados"]);
const col = (actor, group) => anual.has(group) ? coleccionGestion(actor.firestore, group) : collection(actor.firestore, group);
const ref = (actor, group, id) => doc(col(actor, group), id);
const get = (actor, group, id) => getDocFromServer(ref(actor, group, id));
const denied = (operation) => assert.rejects(operation, (error) => error.code === "permission-denied");
const activity = (changes = {}) => ({ cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t2", creadoPorUid: "docente-a", maximo: 100, titulo: "Ejercicios", fecha: "2026-09-22", tipo: "tarea", activo: true, estadoRevision: "sin_iniciar", ...changes });
const grade = (changes = {}) => ({ actividadId: "tarea-a", alumnoId: "alumno-a", cursoId: "cuarto_a", materiaId: "matematica", trimestreId: "t2", calificadoPorUid: "docente-a", valor: 80, nota: 80, maximo: 100, estadoEntrega: "a_tiempo", fechaEntrega: "2026-09-22", ...changes });
const attendance = (changes = {}) => ({ cursoId: "cuarto_a", alumnoId: "alumno-a", fecha: "2026-09-22", trimestreId: "t2", estado: "presente", registradoPorUid: "docente-a", ...changes });
async function guardarNota(actor, id, data) {
  const batch = writeBatch(actor.firestore);
  batch.set(ref(actor, "calificaciones", id), data, { merge: true });
  batch.update(ref(actor, "actividades", data.actividadId), { tieneCalificaciones: true, updatedAt: serverTimestamp() });
  await batch.commit();
}
async function registrarAlumno(pupil) {
  const batch = writeBatch(admin.firestore);
  batch.set(ref(admin, "alumnos", pupil.id), { nombre: pupil.nombre || pupil.id, ci: pupil.ci || "", activo: pupil.activo !== false });
  batch.set(ref(admin, "matriculas", pupil.id), { alumnoId: pupil.id, cursoId: pupil.cursoId, estado: "activo", numeroAgregacion: 100 });
  await batch.commit();
}

before(async () => {
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2, gestionHabilitada: true });
  const batch = writeBatch(admin.firestore);
  const prepararDocumento = (group, id, data) => batch.set(ref(admin, group, id), data);
  prepararDocumento("configuracion", "sistema", { gestionActivaId: "2026", versionModelo: 2 });
  batch.set(doc(admin.firestore, "gestiones", "2026"), { ano: 2026, createdBy: "admin-prueba" });
  prepararDocumento("usuarios", "docente-a", { rol: "docente", activo: true });
  prepararDocumento("usuarios", "docente-b", { rol: "docente", activo: true });
  prepararDocumento("usuarios", "docente-anterior", { rol: "docente", activo: true });
  prepararDocumento("usuarios", "director-a", { rol: "director", activo: true });
  prepararDocumento("usuarios", "alumno-auth-a", { rol: "alumno", activo: true, alumnoId: "alumno-a" });
  prepararDocumento("asignaciones", "docente-a", { cursos: { cuarto_a: { materias: ["matematica"] } } });
  prepararDocumento("asignaciones", "docente-b", { cursos: { quinto_a: { materias: ["matematica"] } } });
  prepararDocumento("alumnos", "alumno-a", { nombre: "Alumno A", activo: true });
  prepararDocumento("alumnos", "alumno-b", { nombre: "Alumno B", activo: true });
  prepararDocumento("alumnos", "companero", { nombre: "Otro alumno", activo: true });
  prepararDocumento("matriculas", "alumno-a", { alumnoId: "alumno-a", cursoId: "cuarto_a", estado: "activo", numeroAgregacion: 1 });
  prepararDocumento("matriculas", "alumno-b", { alumnoId: "alumno-b", cursoId: "quinto_a", estado: "activo", numeroAgregacion: 1 });
  prepararDocumento("matriculas", "companero", { alumnoId: "companero", cursoId: "cuarto_a", estado: "activo", numeroAgregacion: 2 });
  prepararDocumento("actividades", "tarea-a", activity());
  prepararDocumento("actividades", "tarea-sociales", activity({ materiaId: "sociales" }));
  prepararDocumento("actividades", "tarea-b", activity({ cursoId: "quinto_a", creadoPorUid: "docente-b" }));
  const { creadoPorUid, ...legacy } = activity();
  prepararDocumento("actividades", "actividad-anterior", legacy);
  prepararDocumento("calificaciones", "nota-a", grade());
  prepararDocumento("calificaciones", "nota-b", grade({ alumnoId: "alumno-b", actividadId: "tarea-b", cursoId: "quinto_a", calificadoPorUid: "docente-b" }));
  prepararDocumento("calificaciones", "nota-companero", grade({ alumnoId: "companero" }));
  prepararDocumento("asistencias", "asistencia-a", attendance());
  prepararDocumento("asistencias", "asistencia-b", attendance({ cursoId: "quinto_a", alumnoId: "alumno-b", registradoPorUid: "docente-b" }));
  prepararDocumento("indice_accesos", "docente-a", { uid: "docente-a", authEmail: "docente-a@demo.test" });
  for (let i = 0; i < 25; i += 1) {
    prepararDocumento("alumnos", `grupo-${i}`, { nombre: `Alumno ${i}`, activo: true });
    prepararDocumento("matriculas", `grupo-${i}`, { alumnoId: `grupo-${i}`, cursoId: "cuarto_a", estado: "activo", numeroAgregacion: i + 3 });
  }
  await batch.commit();
});

after(async () => {
  await signOut(creator.auth);
  await signOut(migratedStudent.auth);
  for (const database of databases) await terminate(database);
  for (const app of apps) await deleteApp(app);
});

test("sin autenticacion no se leen contrasenas, alumnos, asistencias, actividades ni notas", async () => {
  for (const [group, id] of [["accesos_alumnos", "acceso-antiguo"], ["alumnos", "alumno-a"], ["asistencias", "asistencia-a"], ["actividades", "tarea-a"], ["calificaciones", "nota-a"]]) await denied(get(anonymous, group, id));
  assert.equal((await get(anonymous, "indice_accesos", "docente-a")).data().authEmail, "docente-a@demo.test");
  await denied(getDocs(col(anonymous, "indice_accesos")));
});

test("el alumno solo lee su registro, sus notas y asistencias y las actividades de su curso", async () => {
  assert.equal((await get(student, "alumnos", "alumno-a")).exists(), true);
  assert.equal((await get(student, "actividades", "tarea-sociales")).exists(), true);
  for (const [group, id] of [["alumnos", "alumno-b"], ["alumnos", "companero"], ["calificaciones", "nota-companero"], ["asistencias", "asistencia-b"], ["actividades", "tarea-b"], ["accesos_alumnos", "acceso-antiguo"]]) await denied(get(student, group, id));
  assert.equal((await getDocs(query(col(student, "calificaciones"), where("alumnoId", "==", "alumno-a")))).size, 1);
  assert.equal((await getDocs(query(col(student, "asistencias"), where("alumnoId", "==", "alumno-a")))).size, 1);
  assert.equal((await getDocs(query(col(student, "actividades"), where("cursoId", "==", "cuarto_a")))).size, 3);
  await denied(getDocs(col(student, "calificaciones")));
});

test("no se puede cambiar el rol ni la identidad del alumno desde su cuenta", async () => {
  await denied(updateDoc(ref(student, "usuarios", "alumno-auth-a"), { rol: "admin" }));
  await denied(updateDoc(ref(student, "usuarios", "alumno-auth-a"), { alumnoId: "alumno-b" }));
  await denied(setDoc(ref(student, "calificaciones", "nota-inventada"), grade({ nota: 100 })));
});

test("el docente lee los datos del curso completo para el boletin pero no de otros cursos", async () => {
  assert.equal((await get(teacher, "actividades", "tarea-sociales")).exists(), true);
  assert.equal((await getDocs(query(col(teacher, "matriculas"), where("cursoId", "==", "cuarto_a")))).size, 27);
  assert.equal((await get(teacher, "alumnos", "alumno-a")).exists(), true);
  await denied(getDocs(col(teacher, "alumnos")));
  for (const [group, id] of [["alumnos", "alumno-b"], ["asistencias", "asistencia-b"], ["actividades", "tarea-b"], ["calificaciones", "nota-b"], ["asignaciones", "docente-b"]]) await denied(get(teacher, group, id));
});

test("la consulta por actividad usada por Calificar conserva sus permisos", async () => {
  assert.equal((await getDocs(query(col(teacher, "calificaciones"), where("actividadId", "==", "tarea-a")))).size, 2);
  await denied(getDocs(query(col(teacherB, "calificaciones"), where("actividadId", "==", "tarea-a"))));
});

test("el docente solo agenda y modifica actividades de las materias asignadas", async () => {
  await setDoc(ref(teacher, "actividades", "nueva-actividad"), activity());
  await updateDoc(ref(teacher, "actividades", "actividad-anterior"), { estadoRevision: "cerrada" });
  await denied(setDoc(ref(teacher, "actividades", "otra-materia"), activity({ materiaId: "sociales" })));
  await denied(setDoc(ref(teacher, "actividades", "otro-curso"), activity({ cursoId: "quinto_a" })));
  await denied(setDoc(ref(teacher, "actividades", "otro-autor"), activity({ creadoPorUid: "docente-b" })));
});

test("la asistencia exige curso del alumno, autor real y estado valido", async () => {
  await setDoc(ref(teacher, "asistencias", "nueva-asistencia"), attendance());
  await updateDoc(ref(teacher, "asistencias", "nueva-asistencia"), { estado: "licencia" });
  for (const changes of [{ alumnoId: "alumno-b" }, { registradoPorUid: "docente-b" }, { estado: "inventado" }, { trimestreId: "t4" }, { cursoId: "quinto_a", alumnoId: "alumno-b" }]) await denied(setDoc(ref(teacher, "asistencias", "asistencia-invalida"), attendance(changes)));
  await denied(updateDoc(ref(teacher, "asistencias", "nueva-asistencia"), { alumnoId: "companero" }));
});

test("las asignaciones anteriores como mapas conservan sus materias autorizadas", async () => {
  const formats = [
    { cursos: { cuarto_a: ["artes"] } },
    { cursos: { cuarto_a: { materias: { artes: true, sociales: false } } } },
    { asignaciones: { cuarto_a: { subjects: ["artes"] } } },
    { cursos: { cuarto_a: { artes: true } } }
  ];
  for (const [index, format] of formats.entries()) {
    await setDoc(ref(admin, "asignaciones", "docente-anterior"), format);
    await setDoc(ref(legacyTeacher, "actividades", `formato-anterior-${index}`), activity({ materiaId: "artes", creadoPorUid: "docente-anterior" }));
    await denied(setDoc(ref(legacyTeacher, "actividades", "formato-sin-asignacion"), activity({ materiaId: "sociales", creadoPorUid: "docente-anterior" })));
  }
});

test("calificar exige actividad real, materia asignada y alumno del curso correcto", async () => {
  await guardarNota(teacher, "nueva-nota", grade());
  for (const changes of [{ alumnoId: "alumno-b" }, { actividadId: "tarea-sociales", materiaId: "sociales" }, { actividadId: "tarea-b", cursoId: "quinto_a", alumnoId: "alumno-b" }, { cursoId: "quinto_a" }, { materiaId: "sociales" }, { trimestreId: "t1" }, { calificadoPorUid: "docente-b" }, { maximo: 5 }, { valor: 101 }, { nota: 34 }, { actividadId: "no-existe" }]) await denied(setDoc(ref(teacher, "calificaciones", "nota-invalida"), grade(changes)));
  await denied(updateDoc(ref(teacher, "calificaciones", "nueva-nota"), { alumnoId: "companero" }));
});

test("una matricula retirada conserva el historial pero bloquea nuevas notas y asistencias del docente", async () => {
  const id = "alumno-retirado";
  await registrarAlumno({ id, cursoId: "cuarto_a" });
  await guardarNota(teacher, "nota-alumno-retirado", grade({ alumnoId: id }));
  await setDoc(ref(teacher, "asistencias", "asistencia-alumno-retirado"), attendance({ alumnoId: id }));
  await updateDoc(ref(admin, "matriculas", id), { estado: "retirado" });

  for (const actor of [teacher, director]) {
    assert.equal((await get(actor, "calificaciones", "nota-alumno-retirado")).data().nota, 80);
    assert.equal((await get(actor, "asistencias", "asistencia-alumno-retirado")).data().estado, "presente");
  }
  await denied(guardarNota(teacher, "nota-retirado-nueva", grade({ alumnoId: id })));
  await denied(updateDoc(ref(teacher, "calificaciones", "nota-alumno-retirado"), { valor: 90, nota: 90 }));
  await denied(setDoc(ref(teacher, "asistencias", "asistencia-retirado-nueva"), attendance({ alumnoId: id })));
  await denied(updateDoc(ref(teacher, "asistencias", "asistencia-alumno-retirado"), { estado: "permiso" }));

  await updateDoc(ref(admin, "matriculas", id), { estado: "activo" });
  await guardarNota(teacher, "nota-alumno-retirado", grade({ alumnoId: id, valor: 90, nota: 90 }));
  await updateDoc(ref(teacher, "asistencias", "asistencia-alumno-retirado"), { estado: "permiso" });
  assert.equal((await get(teacher, "calificaciones", "nota-alumno-retirado")).data().nota, 90);
});

test("la nota normalizada respeta la escala, el redondeo y el minimo de 35", async () => {
  const cases = [
    { maximo: 100, valor: 0, nota: 35 },
    { maximo: 100, valor: 20, nota: 35 },
    { maximo: 100, valor: 35.5, nota: 36 },
    { maximo: 100, valor: 80, nota: 80 },
    { maximo: 3, valor: 1, nota: 35 },
    { maximo: 200, valor: 71, nota: 36 },
    { maximo: 5, valor: 5, nota: 100 }
  ];
  for (const [index, data] of cases.entries()) {
    const actividadId = `escala-valida-${index}`;
    await setDoc(ref(teacher, "actividades", actividadId), activity({ maximo: data.maximo }));
    await guardarNota(teacher, `nota-escala-valida-${index}`, grade({ actividadId, ...data }));
    assert.equal((await get(teacher, "calificaciones", `nota-escala-valida-${index}`)).data().nota, data.nota);
  }
});

test("no se acepta una nota distinta del puntaje real ni valores fuera de la escala", async () => {
  const actividadId = "escala-inconsistente";
  await setDoc(ref(teacher, "actividades", actividadId), activity({ tieneCalificaciones: true }));
  const invalid = [
    { valor: 20, nota: 40 }, { valor: 80, nota: 100 }, { valor: 35.5, nota: 35 },
    { valor: 0, nota: 0 }, { valor: -1, nota: 35 }, { valor: 101, nota: 100 },
    { valor: NaN, nota: 35 }, { valor: Infinity, nota: 100 },
    { valor: 80, nota: NaN }, { valor: 80, nota: Infinity },
    { maximo: NaN }, { maximo: Infinity }, { maximo: 0 }, { maximo: -1 }
  ];
  for (const changes of invalid) {
    await denied(setDoc(ref(teacher, "calificaciones", "nota-escala-invalida"), grade({ actividadId, ...changes })));
  }
  await guardarNota(teacher, "nota-escala-corregida", grade({ actividadId, valor: 80, nota: 80 }));
  await denied(updateDoc(ref(teacher, "calificaciones", "nota-escala-corregida"), { nota: 100 }));
  assert.equal((await get(teacher, "calificaciones", "nota-escala-corregida")).data().nota, 80);
});

test("Autoevaluacion permite crear la actividad y guardar un 5 mediante transaccion", async () => {
  const activityRef = ref(teacher, "actividades", "auto_t2_cuarto_a_matematica_autoevaluacion");
  await runTransaction(teacher.firestore, async (transaction) => {
    const snap = await transaction.get(activityRef);
    if (!snap.exists()) transaction.set(activityRef, activity({ titulo: "Autoevaluacion", tipo: "autoevaluacion", maximo: 5 }));
  });
  await guardarNota(teacher, "auto-alumno-a", grade({ actividadId: activityRef.id, valor: 5, maximo: 5, nota: 100 }));
  assert.equal((await get(student, "calificaciones", "auto-alumno-a")).data().valor, 5);
});

test("finalizar una clase grande funciona en lotes pequenos sin superar el limite de reglas", async () => {
  const id = "revision-clase-grande";
  await setDoc(ref(teacher, "actividades", id), activity());
  const students = Array.from({ length: 25 }, (_, i) => ({ id: `grupo-${i}`, cursoId: "cuarto_a" }));
  const result = await finalizeActivityReview({ activity: { id, ...activity() }, students }, {
    db: teacher.firestore, uid: "docente-a", audit: async () => {}
  });
  assert.equal(result.grades.length, 25);
  assert.ok(result.grades.every((item) => item.nota === 35 && item.estadoEntrega === "no_presento"));
  const saved = (await get(teacher, "actividades", id)).data();
  assert.equal(saved.estadoRevision, "cerrada");
  assert.equal(saved.tieneCalificaciones, true);
});

test("el servicio real de Calificar guarda notas, limpia entregas antiguas y conserva licencias al cerrar", async () => {
  const id = "calificar-servicio-real";
  const data = activity({ entregasPendientes: { "alumno-a": true } });
  await setDoc(ref(teacher, "actividades", id), data);
  const task = { id, ...data };
  const options = { db: teacher.firestore, uid: "docente-a", audit: async () => {} };
  const pupil = { id: "alumno-a", cursoId: "cuarto_a", nombre: "Alumno A" };
  const first = await saveGrade({ activity: task, student: pupil, value: 80, estadoEntrega: "a_tiempo", fechaEntrega: data.fecha }, options);
  assert.equal(first.nota, 80);
  assert.equal(task.tieneCalificaciones, true);
  let saved = (await get(teacher, "actividades", id)).data();
  assert.equal(saved.estadoRevision, "en_proceso");
  assert.equal(saved.entregasPendientes?.[pupil.id], undefined);
  const firstUpdate = saved.updatedAt.toMillis();
  const second = await saveGrade({ activity: task, student: pupil, value: 95, estadoEntrega: "a_tiempo", fechaEntrega: data.fecha }, options);
  saved = (await get(teacher, "actividades", id)).data();
  assert.equal(second.nota, 95);
  assert.equal(saved.updatedAt.toMillis(), firstUpdate);
  const result = await finalizeActivityReview({
    activity: task,
    students: [pupil, { id: "companero", cursoId: "cuarto_a" }, { id: "grupo-0", cursoId: "cuarto_a" }],
    attendanceMap: { companero: { estado: "presente" }, "grupo-0": { estado: "licencia" } },
    gradesMap: { [pupil.id]: second }
  }, options);
  assert.deepEqual(result.grades.map((item) => [item.alumnoId, item.nota]), [["companero", 35]]);
  assert.equal((await get(teacher, "calificaciones", second.id)).data().nota, 95);
  assert.equal((await get(teacher, "actividades", id)).data().estadoRevision, "cerrada");
});

test("la primera nota debe bloquear la actividad en el mismo lote", async () => {
  await setDoc(ref(teacher, "actividades", "bloqueo-primer-nota"), activity());
  const data = grade({ actividadId: "bloqueo-primer-nota" });
  await denied(setDoc(ref(teacher, "calificaciones", "nota-sin-bloqueo"), data));
  await guardarNota(teacher, "nota-con-bloqueo", data);
  assert.equal((await get(teacher, "actividades", data.actividadId)).data().tieneCalificaciones, true);
  await guardarNota(teacher, "nota-con-bloqueo", { ...data, valor: 95, nota: 95 });
  assert.equal((await get(teacher, "calificaciones", "nota-con-bloqueo")).data().nota, 95);
});

test("Firebase impide mover, alterar o borrar una actividad calificada", async () => {
  const id = "actividad-bloqueada";
  await setDoc(ref(teacher, "actividades", id), activity());
  await guardarNota(teacher, "nota-bloqueada", grade({ actividadId: id }));
  for (const change of [
    { cursoId: "quinto_a" }, { materiaId: "sociales" }, { trimestreId: "t1" },
    { fecha: "2026-09-25" }, { tipo: "examen" }, { maximo: 50 },
    { calificable: true }, { tieneCalificaciones: false }
  ]) await denied(updateDoc(ref(teacher, "actividades", id), change));
  await denied(deleteDoc(ref(teacher, "actividades", id)));
  await updateDoc(ref(teacher, "actividades", id), { titulo: "Titulo corregido", estadoRevision: "cerrada" });
  assert.equal((await get(teacher, "calificaciones", "nota-bloqueada")).data().nota, 80);
});

test("la proteccion reconoce notas antiguas sin marca y permite corregir solo el titulo", async () => {
  const id = "actividad-nota-anterior";
  await setDoc(ref(admin, "actividades", id), activity());
  await setDoc(ref(admin, "calificaciones", "nota-anterior-sin-marca"), grade({ actividadId: id }));
  const args = { db: teacher.firestore, id };
  await assert.rejects(eliminarActividadProtegida(args), /no se puede eliminar/i);
  await assert.rejects(actualizarActividadProtegida({ ...args, datos: { maximo: 50 }, siguiente: activity({ maximo: 50 }) }), /puntaje maximo/);
  const updated = await actualizarActividadProtegida({ ...args, datos: { titulo: "Corregido" }, siguiente: activity({ titulo: "Corregido" }) });
  assert.equal(updated.tieneCalificaciones, true);
  assert.equal((await get(teacher, "actividades", id)).data().titulo, "Corregido");
  assert.equal((await get(teacher, "calificaciones", "nota-anterior-sin-marca")).data().nota, 80);
});

test("sin notas se puede cambiar el puntaje y eliminar la actividad", async () => {
  const id = "actividad-editable";
  await setDoc(ref(teacher, "actividades", id), activity());
  await actualizarActividadProtegida({ db: teacher.firestore, id, datos: { maximo: 20 }, siguiente: activity({ maximo: 20 }) });
  assert.equal((await get(teacher, "actividades", id)).data().maximo, 20);
  await eliminarActividadProtegida({ db: teacher.firestore, id });
  assert.equal((await get(admin, "actividades", id)).exists(), false);
});

test("calificar y eliminar simultaneamente nunca deja una nota huerfana", async () => {
  for (let i = 0; i < 3; i += 1) {
    const id = `actividad-concurrente-${i}`;
    const notaId = `nota-concurrente-${i}`;
    await setDoc(ref(teacher, "actividades", id), activity());
    const results = await Promise.allSettled([
      guardarNota(teacher, notaId, grade({ actividadId: id })),
      eliminarActividadProtegida({ db: teacher.firestore, id })
    ]);
    assert.ok(results.some((result) => result.status === "fulfilled"));
    const nota = await get(admin, "calificaciones", notaId);
    const tarea = await get(admin, "actividades", id);
    if (nota.exists()) assert.equal(tarea.exists(), true);
    if (!tarea.exists()) assert.equal(nota.exists(), false);
  }
});

test("calificar y cambiar la escala simultaneamente no desincroniza actividad y nota", async () => {
  const id = "actividad-cambio-concurrente";
  const notaId = "nota-cambio-concurrente";
  await setDoc(ref(teacher, "actividades", id), activity());
  const results = await Promise.allSettled([
    guardarNota(teacher, notaId, grade({ actividadId: id })),
    actualizarActividadProtegida({ db: teacher.firestore, id, datos: { maximo: 20 }, siguiente: activity({ maximo: 20 }) })
  ]);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  const nota = await get(admin, "calificaciones", notaId);
  const tarea = await get(admin, "actividades", id);
  if (nota.exists()) assert.equal(nota.data().maximo, tarea.data().maximo);
});

test("se mantienen trimestre, campanita, seguimientos y comunicados", async () => {
  await updateDoc(ref(teacher, "usuarios", "docente-a"), { "preferencias.trimestresPorGestion.2026": "t3", updatedAt: serverTimestamp() });
  const seguimiento = documentoSeguimiento(teacher.firestore, "docente-a", "alumno-a", "t2");
  await setDoc(seguimiento, { gestionId: "2026", alumnoId: "alumno-a", trimestreId: "t2", avisosVistos: ["pending:alumno-a:tarea-a"], ultimaFaltaAtendida: "2026-09-22", updatedAt: serverTimestamp() });
  await setDoc(ref(director, "comunicados", "reunion"), { destinatariosRol: ["docente"], titulo: "Reunion", motivo: "Coordinacion", fechaEvento: "2026-10-02", horaEvento: "15:00", activo: true, creadoPorUid: "director-a", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  assert.equal((await get(teacher, "comunicados", "reunion")).exists(), true);
  assert.equal((await get(teacher, "usuarios", "docente-a")).data().preferencias.trimestresPorGestion["2026"], "t3");
  await denied(getDocFromServer(documentoSeguimiento(teacherB.firestore, "docente-a", "alumno-a", "t2")));
  await denied(updateDoc(ref(teacher, "usuarios", "docente-a"), { "preferencias.trimestresPorGestion.2026": "t4" }));
  await denied(updateDoc(ref(teacher, "usuarios", "docente-a"), { "preferencias.trimestresPorGestion.2027": "t2" }));
});

test("director consulta la escuela y envia advertencias sin poder alterar notas o alumnos", async () => {
  assert.equal((await get(director, "alumnos", "alumno-b")).exists(), true);
  assert.equal((await get(director, "calificaciones", "nota-b")).exists(), true);
  const aviso = doc(director.firestore, "alumnos", "alumno-a", "avisos", "advertencia-1");
  await setDoc(aviso, { gestionId: "2026", trimestreId: "t2", alumnoId: "alumno-a", cursoId: "cuarto_a", creadaPorUid: "director-a", activa: true, mensaje: "Contactar con direccion", updatedAt: serverTimestamp() });
  assert.equal((await getDocFromServer(doc(student.firestore, "alumnos", "alumno-a", "avisos", aviso.id))).data().activa, true);
  await updateDoc(aviso, { activa: false, cerradoPorUid: "director-a", cerradoAt: serverTimestamp(), updatedAt: serverTimestamp() });
  assert.equal((await getDocFromServer(doc(student.firestore, "alumnos", "alumno-a", "avisos", aviso.id))).data().activa, false);
  await denied(updateDoc(ref(director, "alumnos", "alumno-a"), { cursoId: "quinto_a" }));
  await denied(updateDoc(ref(director, "calificaciones", "nota-a"), { nota: 100 }));
  await denied(setDoc(ref(director, "asistencias", "director-asistencia"), attendance()));
});

test("una asignacion retirada bloquea inmediatamente las escrituras del docente", async () => {
  await updateDoc(ref(admin, "asignaciones", "docente-b"), { cursos: {} });
  await denied(setDoc(ref(teacherB, "asistencias", "sin-asignacion"), attendance({ cursoId: "quinto_a", alumnoId: "alumno-b", registradoPorUid: "docente-b" })));
});

test("crear acceso usa un solo perfil y un indice minimo, sin alterar datos academicos", async () => {
  const pupil = { id: "alumno-migracion", nombre: "Alumno ficticio", ci: "990000123", cursoId: "cuarto_a", activo: true };
  await registrarAlumno(pupil);
  await setDoc(ref(admin, "calificaciones", "nota-migracion"), grade({ alumnoId: pupil.id }));
  await setDoc(ref(admin, "asistencias", "asistencia-migracion"), attendance({ alumnoId: pupil.id }));
  const clients = { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore };
  const result = await createStudentAuthAccess(pupil, { id: "cuarto_a" }, clients);
  assert.equal(result.created, true);
  assert.equal(result.password, "123456");
  assert.equal(creator.auth.currentUser, null);
  const access = (await get(admin, "indice_accesos", pupil.ci)).data();
  assert.equal("password" in (await get(admin, "alumnos", pupil.id)).data(), false);
  assert.deepEqual(Object.keys((await get(admin, "indice_accesos", pupil.ci)).data()).sort(), ["authEmail", "uid"]);
  const credentials = await signInWithEmailAndPassword(migratedStudent.auth, access.authEmail, result.password);
  assert.equal(credentials.user.uid, result.uid);
  const profile = (await get(migratedStudent, "usuarios", result.uid)).data();
  assert.equal(profile.rol, "alumno");
  assert.equal(profile.alumnoId, pupil.id);
  assert.equal((await get(migratedStudent, "calificaciones", "nota-migracion")).data().nota, 80);
  assert.equal((await get(migratedStudent, "asistencias", "asistencia-migracion")).data().estado, "presente");
  await denied(get(migratedStudent, "alumnos", "alumno-a"));
  const repeat = await createStudentAuthAccess(pupil, null, clients);
  assert.equal(repeat.uid, result.uid);
  assert.equal(repeat.created, false);
  assert.equal(repeat.password, "");
  await setStudentAccessActive({ ...pupil, authUid: result.uid }, false, clients);
  assert.equal((await get(admin, "matriculas", pupil.id)).data().estado, "retirado");
  assert.equal((await get(admin, "usuarios", result.uid)).data().activo, false);
  await denied(get(migratedStudent, "calificaciones", "nota-migracion"));
  await setStudentAccessActive({ ...pupil, authUid: result.uid }, true, clients);
  assert.equal((await get(admin, "matriculas", pupil.id)).data().estado, "activo");
  assert.equal((await get(migratedStudent, "alumnos", pupil.id)).exists(), true);
  await updateDoc(ref(admin, "alumnos", pupil.id), { activo: false });
  await denied(get(migratedStudent, "calificaciones", "nota-migracion"));
});

test("migrar un usuario ocupado por un docente no modifica su cuenta", async () => {
  const pupil = { id: "conflicto", ci: "docente-a", cursoId: "cuarto_a" };
  await registrarAlumno(pupil);
  const clients = { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore };
  await assert.rejects(createStudentAuthAccess(pupil, null, clients), /otra cuenta/);
  assert.equal((await get(admin, "usuarios", "docente-a")).data().rol, "docente");
  assert.equal(creator.auth.currentUser, null);
});

test("si cambia la sesion durante la migracion se revierte la cuenta nueva", async () => {
  const pupil = { id: "alumno-sesion-cambiada", ci: "990000124", cursoId: "cuarto_a", activo: true };
  await registrarAlumno(pupil);
  let reads = 0;
  const clients = { auth: { get currentUser() { return ++reads === 1 ? { uid: "admin-prueba" } : null; } }, creatorAuth: creator.auth, firestore: admin.firestore };
  await assert.rejects(createStudentAuthAccess(pupil, null, clients), /sesion cambio/);
  assert.equal((await get(admin, "alumnos", pupil.id)).data().authUid, undefined);
  assert.equal((await get(admin, "indice_accesos", pupil.ci)).exists(), false);
  assert.equal(creator.auth.currentUser, null);
  await assert.rejects(signInWithEmailAndPassword(creator.auth, "990000124@usuarios.ue-nueva-bolivia.edu.bo", "clave-temporal"), (error) => ["auth/user-not-found", "auth/invalid-credential"].includes(error.code));
});

test("un alumno nuevo puede ingresar y cargar su panel sin accesos antiguos ni cache", async () => {
  const pupil = { id: "alumno-nuevo", nombre: "Alumno nuevo", ci: "990000125", cursoId: "cuarto_a", activo: true };
  await registrarAlumno(pupil);
  const clients = { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore };
  const result = await createStudentAuthAccess(pupil, { id: "cuarto_a" }, clients);
  assert.equal(result.created, true);
  assert.equal(result.password, "123456");
  await setDoc(ref(admin, "calificaciones", "nota-alumno-nuevo"), grade({ alumnoId: pupil.id }));
  await setDoc(ref(admin, "asistencias", "asistencia-alumno-nuevo"), attendance({ alumnoId: pupil.id }));
  const access = (await get(anonymous, "indice_accesos", pupil.ci)).data();
  assert.deepEqual(Object.keys(access).sort(), ["authEmail", "uid"]);
  await signInWithEmailAndPassword(migratedStudent.auth, access.authEmail, result.password);
  const data = await getStudentDashboardData({ auth: migratedStudent.auth, firestore: migratedStudent.firestore });
  assert.equal(data.uid, result.uid);
  assert.equal(data.student.id, pupil.id);
  assert.equal(data.course.id, "cuarto_a");
  assert.equal(data.trimesterId, "t2");
  assert.equal(data.grades.length, 1);
  assert.equal(data.attendance.length, 1);
  assert.equal(data.attendancePercent, 100);
  assert.equal(data.grades[0].alumnoId, pupil.id);
  assert.ok(data.activities.every((item) => item.cursoId === "cuarto_a"));
  await denied(get(migratedStudent, "calificaciones", "nota-a"));
  await denied(get(migratedStudent, "accesos_alumnos", pupil.ci));
});

test("la tabla crea acceso con CI como clave, o con correo real y clave manual, y permite ingresar", async () => {
  const course = { id: "cuarto_a" };
  const rows = pasteStudentCells([newStudentRow()], "ALUMNO TABLA CI\t88000551\t\t\tM\nALUMNO TABLA CORREO\t88000552\t192837\talumno-tabla@demo.test\tFemenino", 0, 0);
  const clients = { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore };
  const results = await registrarTablaAlumnos(course, rows, {
    importar: (selected, entries) => importStudents(selected, entries, admin.firestore),
    crearAcceso: (pupil, selected, unused, options) => createStudentAuthAccess(pupil, selected, clients, options)
  });
  assert.ok(results.every((result) => result.success && result.created));
  const login = authClient("acceso-tabla");
  for (const [index, result] of results.entries()) {
    const access = (await get(anonymous, "indice_accesos", result.student.ci)).data();
    assert.equal(access.uid, result.student.authUid);
    assert.equal(access.authEmail, index === 0 ? usernameToAuthEmail("88000551") : "alumno-tabla@demo.test");
    await signInWithEmailAndPassword(login.auth, access.authEmail, index === 0 ? "88000551" : "192837");
    const context = await getStudentContext({ auth: login.auth, firestore: login.firestore });
    assert.equal(context.student.id, result.student.id);
    await denied(get(login, "alumnos", results[1 - index].student.id));
    const registered = (await get(admin, "alumnos", result.student.id)).data();
    const profile = (await get(admin, "usuarios", result.student.authUid)).data();
    assert.equal(registered.password, undefined);
    assert.equal(registered.sexo, index === 0 ? "M" : "F");
    assert.equal(profile.password, undefined);
    assert.deepEqual(Object.keys(access).sort(), ["authEmail", "uid"]);
    await signOut(login.auth);
  }
  await setStudentAccessActive(results[0].student, false, clients);
  const access = (await get(anonymous, "indice_accesos", "88000551")).data();
  await signInWithEmailAndPassword(login.auth, access.authEmail, "88000551");
  await assert.rejects(getStudentContext({ auth: login.auth, firestore: login.firestore }), /activo|retirado|deshabilitado/i);
  await signOut(login.auth);
  await setStudentAccessActive(results[0].student, true, clients);
  await signInWithEmailAndPassword(login.auth, access.authEmail, "88000551");
  assert.equal((await getStudentContext({ auth: login.auth, firestore: login.firestore })).student.id, results[0].student.id);
  await signOut(login.auth);
});

test("un alumno borrado o movido de curso no recibe una cuenta desde una lista desactualizada", async () => {
  const clients = { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore };
  const missing = { id: "alumno-inexistente", ci: "990000126", cursoId: "cuarto_a", activo: true };
  await assert.rejects(createStudentAuthAccess(missing, { id: "cuarto_a" }, clients), /ya no esta registrado/);
  const moved = { id: "alumno-movido", ci: "990000127", cursoId: "cuarto_a", activo: true };
  await registrarAlumno({ ...moved, cursoId: "quinto_a" });
  await assert.rejects(createStudentAuthAccess(moved, { id: "cuarto_a" }, clients), /curso del alumno cambio/i);
  for (const pupil of [missing, moved]) assert.equal((await get(admin, "indice_accesos", pupil.ci)).exists(), false);
  assert.equal(creator.auth.currentUser, null);
});

test("una carga pendiente no devuelve datos del alumno si cambia la sesion", async () => {
  const current = migratedStudent.auth.currentUser;
  let reads = 0;
  const auth = { get currentUser() { return ++reads === 1 ? current : null; } };
  await assert.rejects(getStudentContext({ auth, firestore: migratedStudent.firestore }), /sesion del alumno cambio/);
  await signOut(migratedStudent.auth);
  await assert.rejects(getStudentContext({ auth: migratedStudent.auth, firestore: migratedStudent.firestore }), /No hay sesion/);
});

test("la importacion genera IDs estables, conserva orden y no duplica alumnos", async () => {
  const curso = { id: "tercero_a" };
  const primeros = await importStudents(curso, "JUAN PEREZ MAMANI\t88000001\nMARIA QUISPE", admin.firestore);
  assert.equal(primeros.length, 2);
  assert.notEqual(primeros[0].id, "88000001");
  assert.equal((await get(admin, "alumnos", primeros[0].id)).data().cursoId, undefined);
  const repetidos = await importStudents(curso, "JUAN PEREZ MAMANI\t88000001\nMARIA QUISPE", admin.firestore);
  assert.deepEqual(repetidos.map((item) => item.id), primeros.map((item) => item.id));
  assert.deepEqual(repetidos.map((item) => item.numeroAgregacion), [1, 2]);
  const tercero = await importStudents(curso, "ALAN QUISPE\t88000002", admin.firestore);
  assert.equal(tercero[0].numeroAgregacion, 3);
  await assert.rejects(importStudents({ id: "quinto_a" }, "JUAN PEREZ MAMANI\t88000001", admin.firestore), /otro curso/);
  await assert.rejects(importStudents(curso, "OTRO ALUMNO\t88000001", admin.firestore), /pertenece/);
  await updateDoc(ref(admin, "alumnos", primeros[0].id), { ci: "88000003" });
  const corregido = await importStudents(curso, "JUAN PEREZ MAMANI\t88000003", admin.firestore);
  assert.equal(corregido[0].id, primeros[0].id);
});

test("crear docente guarda perfil, indice y asignaciones juntos sin copias por rol", async () => {
  const clients = { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore };
  const creado = await createSystemUser({ nombre: "Docente prueba", username: "estructura001", password: "Temporal123", rol: "docente", asignaciones: { cuarto_a: { materias: ["matematica"] } } }, clients);
  assert.equal((await get(admin, "usuarios", creado.id)).data().nombre, "Docente prueba");
  assert.deepEqual((await get(admin, "asignaciones", creado.id)).data().cursos, { cuarto_a: { materias: ["matematica"] } });
  assert.deepEqual(Object.keys((await get(anonymous, "indice_accesos", "estructura001")).data()).sort(), ["authEmail", "uid"]);
  await denied(get(admin, "docentes", creado.id));
  assert.equal(creator.auth.currentUser, null);
});

test("cargas simultaneas del mismo alumno no duplican identidad ni numero", async () => {
  const resultados = await Promise.all([
    importStudents({ id: "primero_a" }, "ALUMNO CONCURRENTE\t88000004", admin.firestore),
    importStudents({ id: "primero_a" }, "ALUMNO CONCURRENTE\t88000004", admin.firestore)
  ]);
  assert.equal(resultados[0][0].id, resultados[1][0].id);
  assert.equal(resultados[0][0].numeroAgregacion, resultados[1][0].numeroAgregacion);
  const alumnos = await getDocs(query(col(admin, "alumnos"), where("ci", "==", "88000004")));
  assert.equal(alumnos.size, 1);
});

test("si falla el alta del perfil del docente tambien se revierte Authentication", async () => {
  let lecturas = 0;
  const clients = { auth: { get currentUser() { return ++lecturas === 1 ? { uid: "admin-prueba" } : null; } }, creatorAuth: creator.auth, firestore: admin.firestore };
  await assert.rejects(createSystemUser({ nombre: "No debe quedar", username: "rollback001", password: "Temporal123", rol: "docente" }, clients), /sesion cambio/);
  assert.equal((await get(admin, "indice_accesos", "rollback001")).exists(), false);
  assert.equal(creator.auth.currentUser, null);
  await assert.rejects(signInWithEmailAndPassword(creator.auth, "rollback001@usuarios.ue-nueva-bolivia.edu.bo", "Temporal123"), (error) => ["auth/user-not-found", "auth/invalid-credential"].includes(error.code));
});

test("gestiones separadas pueden tener los mismos IDs sin mezclar datos ni permisos", async () => {
  const ref2027 = documentoGestion(admin.firestore, "actividades", "tarea-a", "2027");
  await setDoc(ref2027, activity({ titulo: "Actividad del siguiente ano" }));
  assert.equal((await get(admin, "actividades", "tarea-a")).data().titulo, "Ejercicios");
  await denied(getDocFromServer(documentoGestion(teacher.firestore, "actividades", "tarea-a", "2027")));
  await denied(getDocFromServer(documentoGestion(student.firestore, "actividades", "tarea-a", "2027")));
});

test("no se crean gestiones futuras ni anos anteriores que no esten registrados", async () => {
  const clients = { auth: { currentUser: { uid: "admin-prueba", email: "smichmev@gmail.com" } }, firestore: admin.firestore, now: () => new Date("2026-10-06T16:00:00Z") };
  await assert.rejects(prepararGestion("2027", clients), /gestiones futuras/);
  await assert.rejects(prepararGestion("2025", clients), /anteriores que ya estan registradas/);
  assert.equal((await get(admin, "configuracion", "sistema")).data().gestionActivaId, "2026");
  assert.equal((await getDocFromServer(doc(admin.firestore, "gestiones", "2025"))).exists(), false);
  assert.equal((await getDocFromServer(doc(admin.firestore, "gestiones", "2027"))).exists(), false);
});

test("iniciar gestion es explicito e idempotente, conserva catalogos y no copia registros academicos", async () => {
  const clients = { auth: { currentUser: { uid: "admin-prueba", email: "smichmev@gmail.com" } }, firestore: admin.firestore, now: () => new Date("2026-10-06T16:00:00Z") };
  await prepararGestion("2026", clients);
  const primera = (await get(admin, "configuracion", "sistema")).data().updatedAt.toMillis();
  await prepararGestion("2026", clients);
  assert.equal((await get(admin, "configuracion", "sistema")).data().updatedAt.toMillis(), primera);
  const catalogo = doc(admin.firestore, "catalogos", "escolar", "cursos", "cuarto_a");
  await updateDoc(catalogo, { nombre: "Cuarto A personalizado" });
  const siguienteAno = { ...clients, now: () => new Date("2027-01-10T16:00:00Z") };
  await prepararGestion("2027", siguienteAno);
  assert.equal((await getDocFromServer(catalogo)).data().nombre, "Cuarto A personalizado");
  assert.equal((await getDocs(col(admin, "matriculas"))).size, 0);
  assert.equal((await get(admin, "configuracion", "sistema")).data().gestionActivaId, "2027");
  await denied(updateDoc(documentoGestion(teacher.firestore, "actividades", "tarea-a", "2026"), { titulo: "Cambio en gestion cerrada" }));
  assert.deepEqual(await listarGestiones(siguienteAno), ["2027", "2026"]);
  assert.deepEqual(await listarGestiones(clients), ["2026"]);
  await prepararGestion("2026", siguienteAno);
  assert.equal((await get(admin, "matriculas", "alumno-a")).data().cursoId, "cuarto_a");
});

test("director puede cambiar el umbral, pero no gestion ni version del sistema", async () => {
  await updateDoc(ref(director, "configuracion", "sistema"), { limiteFaltasDirector: 5, actualizadoPorUid: "director-a", updatedAt: serverTimestamp() });
  await denied(updateDoc(ref(director, "configuracion", "sistema"), { gestionActivaId: "2027" }));
  await denied(updateDoc(ref(director, "configuracion", "sistema"), { versionModelo: 0 }));
  await denied(updateDoc(ref(teacher, "configuracion", "sistema"), { limiteFaltasDirector: 1 }));
});

test("el indice publico no acepta campos privados y los avisos mantienen su historia", async () => {
  await denied(setDoc(ref(admin, "indice_accesos", "dato-invalido"), { uid: "docente-a", authEmail: "docente-a@demo.test", nombre: "Dato privado" }));
  const aviso = doc(student.firestore, "alumnos", "alumno-a", "avisos", "advertencia-1");
  assert.equal((await getDocFromServer(aviso)).data().mensaje, "Contactar con direccion");
  await denied(updateDoc(aviso, { activa: true }));
  await denied(getDocFromServer(doc(teacher.firestore, "alumnos", "alumno-a", "avisos", "advertencia-1")));
});

test("solo administracion puede crear el documento que habilita un ano escolar", async () => {
  for (const actor of [teacher, director, student]) {
    await denied(setDoc(doc(actor.firestore, "gestiones", "2026"), { ano: 2026 }));
    await denied(updateDoc(ref(actor, "configuracion", "sistema"), { gestionActivaId: "2027", versionModelo: 2 }));
  }
});

test("sin documento anual el docente consulta datos existentes pero no puede registrar nada academico", async () => {
  const anual = doc(admin.firestore, "gestiones", "2026");
  const respaldo = (await getDocFromServer(anual)).data();
  await deleteDoc(anual);
  try {
    assert.equal((await get(teacher, "asistencias", "asistencia-a")).exists(), true);
    assert.equal((await get(teacher, "calificaciones", "nota-a")).exists(), true);
    await denied(setDoc(ref(teacher, "asistencias", "sin-ano"), attendance()));
    await denied(setDoc(ref(teacher, "actividades", "sin-ano"), activity()));
    await denied(updateDoc(ref(teacher, "actividades", "tarea-a"), { titulo: "No permitido" }));
    await denied(guardarNota(teacher, "sin-ano", grade()));
    await denied(updateDoc(ref(teacher, "usuarios", "docente-a"), { "preferencias.trimestresPorGestion.2026": "t1" }));
  } finally {
    await setDoc(anual, respaldo);
  }
});

test("una gestion antigua o futura no permite nuevas escrituras del docente aunque este seleccionada", async () => {
  try {
    for (const year of ["2025", "2027"]) {
      await setDoc(doc(admin.firestore, "gestiones", year), { ano: Number(year) });
      await setDoc(documentoGestion(admin.firestore, "asignaciones", "docente-a", year), { cursos: { cuarto_a: { materias: ["matematica"] } } });
      await updateDoc(ref(admin, "configuracion", "sistema"), { gestionActivaId: year });
      await denied(setDoc(documentoGestion(teacher.firestore, "actividades", "no-permitida", year), activity({ fecha: `${year}-10-12` })));
    }
  } finally {
    await updateDoc(ref(admin, "configuracion", "sistema"), { gestionActivaId: "2026" });
  }
});

test("las reglas rechazan fechas de otros anos en actividad, asistencia y entrega", async () => {
  await denied(setDoc(ref(teacher, "actividades", "fecha-incorrecta"), activity({ fecha: "2027-01-01" })));
  await denied(setDoc(ref(teacher, "asistencias", "fecha-incorrecta"), attendance({ fecha: "2027-01-01" })));
  await denied(guardarNota(teacher, "fecha-incorrecta", grade({ fechaEntrega: "2027-01-01" })));
  await setDoc(ref(teacher, "actividades", "criterio-interno"), activity({ fecha: "", interno: true, tipo: "ser" }));
  await setDoc(ref(teacher, "asistencias", "fecha-correcta"), attendance({ fecha: "2026-10-12" }));
});

test("otra sesion recibe cambios de gestion y habilitacion con solo los dos documentos de configuracion", async () => {
  const recibidos = [];
  let esperar = null;
  const stop = observarConfiguracion(teacher.firestore, (data) => {
    recibidos.push(data);
    esperar?.(data);
  }, (error) => { throw error; });
  const hasta = (predicado) => new Promise((resolve, reject) => {
    if (recibidos.some(predicado)) { resolve(); return; }
    const timeout = setTimeout(() => reject(new Error("No llego la configuracion remota.")), 10000);
    esperar = (data) => {
      if (!predicado(data)) return;
      clearTimeout(timeout);
      esperar = null;
      resolve();
    };
  });
  try {
    await hasta((data) => data.gestionActivaId === "2026" && data.gestionHabilitada);
    await updateDoc(doc(admin.firestore, "gestiones", "2026"), { ano: 2025 });
    await hasta((data) => data.gestionActivaId === "2026" && !data.gestionHabilitada);
    await updateDoc(ref(admin, "configuracion", "sistema"), { gestionActivaId: "2027" });
    await hasta((data) => data.gestionActivaId === "2027" && data.gestionHabilitada);
  } finally {
    stop();
    await updateDoc(doc(admin.firestore, "gestiones", "2026"), { ano: 2026 });
    await updateDoc(ref(admin, "configuracion", "sistema"), { gestionActivaId: "2026" });
  }
});

async function cuentaExistenteSinVinculo(id, ci, password = "123456") {
  const pupil = { id, nombre: "Alumno ficticio", ci, cursoId: "cuarto_a", activo: true };
  await registrarAlumno(pupil);
  const email = usernameToAuthEmail(ci);
  const credential = await createUserWithEmailAndPassword(creator.auth, email, password);
  const uid = credential.user.uid;
  await signOut(creator.auth);
  const clients = { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore };
  return { pupil, email, uid, clients };
}

test("una cuenta Auth sin perfil se vincula expresamente con su clave actual, sin crear ni reiniciar la cuenta", async () => {
  const { pupil, email, uid, clients } = await cuentaExistenteSinVinculo("alumno-auth-huerfano", "990000180");
  await assert.rejects(createStudentAuthAccess(pupil, { id: "cuarto_a" }, clients), /falta vincularla/);
  assert.equal((await get(admin, "usuarios", uid)).exists(), false);
  const result = await createStudentAuthAccess(pupil, { id: "cuarto_a" }, clients, { temporaryPassword: "123456", linkExisting: true });
  assert.equal(result.created, false);
  assert.equal(result.uid, uid);
  assert.equal(result.password, "");
  assert.equal(creator.auth.currentUser, null);
  assert.equal((await get(admin, "alumnos", pupil.id)).data().authUid, uid);
  assert.equal((await get(admin, "usuarios", uid)).data().alumnoId, pupil.id);
  assert.equal((await get(admin, "indice_accesos", pupil.ci)).data().uid, uid);
  await signInWithEmailAndPassword(migratedStudent.auth, email, "123456");
  const context = await getStudentContext({ auth: migratedStudent.auth, firestore: migratedStudent.firestore });
  assert.equal(context.student.id, pupil.id);
  await denied(get(migratedStudent, "alumnos", "alumno-a"));
});

test("una clave incorrecta no vincula ni cambia la contrasena de la cuenta existente", async () => {
  const { pupil, email, uid, clients } = await cuentaExistenteSinVinculo("alumno-auth-clave-distinta", "990000181", "ClaveAnterior2026");
  await assert.rejects(createStudentAuthAccess(pupil, { id: "cuarto_a" }, clients, { temporaryPassword: "123456", linkExisting: true }), /no acepta la contrasena/);
  assert.equal((await get(admin, "usuarios", uid)).exists(), false);
  assert.equal((await get(admin, "alumnos", pupil.id)).data().authUid, undefined);
  assert.equal((await get(admin, "indice_accesos", pupil.ci)).exists(), false);
  assert.equal((await signInWithEmailAndPassword(creator.auth, email, "ClaveAnterior2026")).user.uid, uid);
  await signOut(creator.auth);
});

test("no se recupera una cuenta que ya tiene perfil docente, aunque se conozca su clave", async () => {
  const { pupil, email, uid, clients } = await cuentaExistenteSinVinculo("alumno-auth-perfil-ocupado", "990000182");
  await setDoc(ref(admin, "usuarios", uid), { rol: "docente", activo: true });
  await assert.rejects(createStudentAuthAccess(pupil, { id: "cuarto_a" }, clients, { temporaryPassword: "123456", linkExisting: true }), /pertenece a otro perfil/);
  assert.equal((await get(admin, "usuarios", uid)).data().rol, "docente");
  assert.equal((await get(admin, "alumnos", pupil.id)).data().authUid, undefined);
  assert.equal((await signInWithEmailAndPassword(creator.auth, email, "123456")).user.uid, uid);
  await signOut(creator.auth);
});

test("un vinculo de otro alumno o una asignacion docente impide recuperar la cuenta sin perfil", async () => {
  for (const [id, ci, docente] of [["alumno-auth-otro-alumno", "990000183", false], ["alumno-auth-asignacion", "990000184", true]]) {
    const { pupil, email, uid, clients } = await cuentaExistenteSinVinculo(id, ci);
    if (docente) await setDoc(documentoGestion(admin.firestore, "asignaciones", uid), { cursos: { cuarto_a: { materias: ["matematica"] } } });
    else await setDoc(ref(admin, "alumnos", "otro-alumno-vinculado"), { nombre: "Otro alumno ficticio", activo: true, authUid: uid });
    await assert.rejects(createStudentAuthAccess(pupil, { id: "cuarto_a" }, clients, { temporaryPassword: "123456", linkExisting: true }), /ya esta asignada/);
    assert.equal((await get(admin, "usuarios", uid)).exists(), false);
    assert.equal((await signInWithEmailAndPassword(creator.auth, email, "123456")).user.uid, uid);
    await signOut(creator.auth);
  }
});

test("si cambia la sesion mientras se vincula, no se borra la cuenta Auth que ya existia", async () => {
  const { pupil, email, uid, clients } = await cuentaExistenteSinVinculo("alumno-auth-sesion-cambiada", "990000185");
  let readings = 0;
  clients.auth = { get currentUser() { return { uid: ++readings === 1 ? "admin-prueba" : "otra-sesion" }; } };
  await assert.rejects(createStudentAuthAccess(pupil, { id: "cuarto_a" }, clients, { temporaryPassword: "123456", linkExisting: true }), /sesion cambio/);
  assert.equal((await get(admin, "usuarios", uid)).exists(), false);
  assert.equal((await get(admin, "alumnos", pupil.id)).data().authUid, undefined);
  assert.equal((await signInWithEmailAndPassword(creator.auth, email, "123456")).user.uid, uid);
  await signOut(creator.auth);
});
