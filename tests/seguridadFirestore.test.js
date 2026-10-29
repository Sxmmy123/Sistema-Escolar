import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, confirmPasswordReset } from "firebase/auth";
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocs, getFirestore, query, runTransaction, serverTimestamp, setDoc, setLogLevel, terminate, updateDoc, where, writeBatch } from "firebase/firestore";
import { createStudentAuthAccess, setStudentAccessActive } from "../src/services/studentAccess.js";
import { getStudentContext, getStudentDashboardData, observarPanelAlumno } from "../src/services/studentData.js";
import { crearGuardadoConPeriodo, periodosCurso } from "../src/services/periodosCurso.js";
import { coleccionGestion, documentoGestion, documentoSeguimiento, establecerConfiguracion, observarConfiguracion } from "../src/services/rutasFirestore.js";
import { importStudents } from "../src/services/adminData.js";
import { registrarTablaAlumnos } from "../src/services/registroAlumnos.js";
import { newStudentRow, pasteStudentCells } from "../src/services/tablaAlumnos.js";
import { createSystemUser, setTeacherActive } from "../src/services/users.js";
import { listarGestiones, prepararGestion } from "../src/services/configuracionSistema.js";
import { actualizarActividadProtegida, eliminarActividadProtegida } from "../src/services/proteccionActividad.js";
import { finalizeActivityReview, saveGrade } from "../src/services/teacherData.js";
import { usernameToAuthEmail } from "../src/services/users.js";
import { solicitarRecuperacion } from "../src/services/recuperacionContrasena.js";
import { verificarEnlaceRestablecimiento, confirmarRestablecimiento } from "../src/services/restablecimientoContrasena.js";
import { guardarRegistroInicial, listarRegistrosInicial, editarBitacoraInicial } from "../src/services/registrosInicial.js";
import { listarActividadesInicial, modificarActividadInicial, moverActividadInicial, guardarAvanceInicial } from "../src/services/actividadesInicial.js";
import { idAvanceInicial } from "../src/services/modeloActividadesInicial.js";
import { findCourse } from "../src/data/catalog.js";
import { ADMIN_USER } from "../src/firebase/config.js";
import { changeOwnPassword } from "../src/services/accountSettings.js";

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
const bootstrapAdmin = client("admin-principal", ADMIN_USER.uid);
const teacher = client("docente", "docente-a");
const teacherB = client("otro-docente", "docente-b");
const legacyTeacher = client("docente-formato-anterior", "docente-anterior");
const initialTeacher = client("docente-inicial", "docente-inicial");
const director = client("director", "director-a");
const student = client("alumno", "alumno-auth-a");
const anonymous = client("anonimo");
const creator = authClient("creador-emulado");
const migratedStudent = authClient("alumno-migrado");
const anual = new Set(["matriculas", "asignaciones", "horarios", "actividades", "asistencias", "calificaciones", "comunicados", "registros_inicial", "actividades_inicial"]);
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
  await setDoc(ref(bootstrapAdmin, "usuarios", "admin-prueba"), { rol: "admin", activo: true });
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
  prepararDocumento("alumnos", "alumno-a", { nombre: "Alumno A", activo: true, authUid: "alumno-auth-a" });
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

test("cerrar desde una pestana atrasada conserva la nota ya guardada y no inventa otra en la respuesta", async () => {
  const id = "revision-pestana-atrasada", task = { id, ...activity() };
  await setDoc(ref(teacher, "actividades", id), activity());
  const pupil = { id: "alumno-a", cursoId: "cuarto_a", nombre: "Alumno A" };
  const options = { db: teacher.firestore, uid: "docente-a", audit: async () => {} };
  const saved = await saveGrade({ activity: { ...task }, student: pupil, value: 90 }, options);
  const result = await finalizeActivityReview({ activity: task, students: [pupil], gradesMap: {} }, options);
  assert.equal(result.grades.length, 0);
  assert.equal((await get(teacher, "calificaciones", saved.id)).data().nota, 90);
});

test("un correo reservado con otro UID no obtiene permisos administrativos", async () => {
  const impostor = client("correo-sin-privilegio", "otro-uid-con-correo", ADMIN_USER.email);
  await denied(setDoc(ref(impostor, "usuarios", "perfil-admin-falso"), { rol: "admin", activo: true }));
  await denied(get(impostor, "usuarios", "admin-prueba"));
});

test("auditoria solo acepta su esquema y autor reales, y conserva contenido como texto", async () => {
  const data = { gestionId: "2026", tipo: "asistencia", accion: "registrar", detalle: '<img src=x onerror="alert(1)">', datos: {}, usuarioUid: "docente-a", usuario: "Docente A", rol: "docente", fecha: "2026-10-26", hora: "10:00:00", createdAt: serverTimestamp() };
  await setDoc(ref(teacher, "auditoria", "auditoria-valida"), data);
  assert.equal((await get(admin, "auditoria", "auditoria-valida")).data().detalle, data.detalle);
  for (const changes of [{ id: '\" onmouseover=\"alert(1)' }, { usuarioUid: "admin-prueba" }, { datos: [] }, { extra: true }]) {
    await denied(setDoc(ref(teacher, "auditoria", "auditoria-invalida"), { ...data, ...changes }));
  }
});

test("un perfil sobrante del alumno no lee sus notas ni al reactivarlo", async () => {
  const duplicate = client("alumno-duplicado", "alumno-uid-sobrante");
  await setDoc(ref(admin, "usuarios", "alumno-uid-sobrante"), { rol: "alumno", activo: true, alumnoId: "alumno-a" });
  await denied(get(duplicate, "calificaciones", "nota-a"));
  await updateDoc(ref(admin, "alumnos", "alumno-a"), { activo: false });
  await updateDoc(ref(admin, "alumnos", "alumno-a"), { activo: true });
  await denied(get(duplicate, "asistencias", "asistencia-a"));
  assert.equal((await get(student, "calificaciones", "nota-a")).data().nota, 80);
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

test("la senal de trimestre exige actividad y asistencia reales y solo se consulta desde el curso propio", async () => {
  const save = crearGuardadoConPeriodo();
  const periodRef = doc(periodosCurso(teacher.firestore, "cuarto_a"), "t2");
  const common = { db: teacher.firestore, uid: "docente-a", year: "2026", courseId: "cuarto_a", termId: "t2", periodRef };
  await save({ ...common, kind: "actividad", sourceRef: ref(teacher, "actividades", "senal-tarea"), payload: { ...activity(), fecha: "2026-05-11" } });
  await save({ ...common, kind: "asistencia", sourceRef: ref(teacher, "asistencias", "senal-asistencia"), payload: { ...attendance(), fecha: "2026-05-11", updatedAt: serverTimestamp() } });
  const read = await getDocFromServer(doc(periodosCurso(student.firestore, "cuarto_a"), "t2"));
  assert.equal(read.data().actividadFecha, "2026-05-11"); assert.equal(read.data().asistenciaFecha, "2026-05-11");
  await getDocFromServer(doc(periodosCurso(director.firestore, "cuarto_a"), "t2"));
  await denied(getDocFromServer(doc(periodosCurso(student.firestore, "quinto_a"), "t2")));
  await denied(getDocFromServer(doc(periodosCurso(anonymous.firestore, "cuarto_a"), "t2")));
  await denied(setDoc(doc(periodosCurso(student.firestore, "cuarto_a"), "t3"), { asistenciaId: "asistencia-a", asistenciaFecha: "2026-09-22", updatedAt: serverTimestamp() }));
  await denied(setDoc(doc(periodosCurso(teacherB.firestore, "cuarto_a"), "t3"), { asistenciaId: "asistencia-a", asistenciaFecha: "2026-09-22", updatedAt: serverTimestamp() }));
});

test("no se puede inventar una senal ni moverla de curso o trimestre ni borrar su otra evidencia", async () => {
  const target = doc(periodosCurso(teacher.firestore, "cuarto_a"), "t2");
  await denied(updateDoc(target, { asistenciaId: "no-existe", asistenciaFecha: "2026-01-01", updatedAt: serverTimestamp() }));
  await denied(updateDoc(target, { actividadId: "tarea-b", actividadFecha: "2026-01-01", updatedAt: serverTimestamp() }));
  await denied(setDoc(doc(periodosCurso(teacher.firestore, "cuarto_a"), "t3"), { actividadId: "senal-tarea", actividadFecha: "2026-05-11", updatedAt: serverTimestamp() }));
  await denied(setDoc(target, { actividadId: "senal-tarea", actividadFecha: "2026-05-11", updatedAt: serverTimestamp() }));
  await denied(updateDoc(target, { asistenciaId: "asistencia-a", asistenciaFecha: "2026-09-22", updatedAt: serverTimestamp() }));
});

test("el alumno cambia solo su vista de trimestre sin editar el curso ni perfiles ajenos", async () => {
  const own = ref(student, "usuarios", "alumno-auth-a");
  const view = { cursoId: "cuarto_a", trimestreId: "t1", automatico: "t2" };
  await updateDoc(own, { "preferencias.vistasAlumnoPorGestion.2026": view, updatedAt: serverTimestamp() });
  assert.equal((await get(student, "usuarios", "alumno-auth-a")).data().preferencias.vistasAlumnoPorGestion[2026].trimestreId, "t1");
  for (const change of [{ trimestreId: "t4" }, { automatico: "t4" }, { cursoId: "quinto_a" }, { extra: true }]) await denied(updateDoc(own, { "preferencias.vistasAlumnoPorGestion.2026": { ...view, ...change } }));
  await denied(updateDoc(own, { "preferencias.vistasAlumnoPorGestion.2027": view }));
  await denied(updateDoc(own, { rol: "admin", "preferencias.vistasAlumnoPorGestion.2026": view }));
  await denied(updateDoc(ref(teacher, "usuarios", "docente-a"), { "preferencias.vistasAlumnoPorGestion.2026": view }));
  await denied(updateDoc(ref(student, "usuarios", "docente-a"), { "preferencias.vistasAlumnoPorGestion.2026": view }));
});

test("el panel abierto recibe el avance del curso en vivo y conserva el cambio manual hasta el proximo trimestre", async () => {
  let latest, next;
  const changes = [];
  const wait = (predicate) => new Promise((resolve, reject) => {
    if (latest && predicate(latest)) return resolve(latest);
    const timer = setTimeout(() => reject(new Error("No llego la actualizacion del alumno")), 10000);
    next = (data) => { if (predicate(data)) { clearTimeout(timer); next = null; resolve(data); } };
  });
  const watcher = await observarPanelAlumno((data) => { latest = data; changes.push(data.trimesterId); next?.(data); }, (error) => assert.fail(error.message), { auth: { currentUser: { uid: "alumno-auth-a" } }, firestore: student.firestore });
  try {
    await wait((data) => data.trimesterId === "t1" && data.automaticTrimesterId === "t2");
    await watcher.seleccionarTrimestre("t2"); assert.equal(latest.trimesterId, "t2");
    await watcher.seleccionarTrimestre("t1"); assert.equal(latest.trimesterId, "t1");
    const save = crearGuardadoConPeriodo(), periodRef = doc(periodosCurso(teacher.firestore, "cuarto_a"), "t3");
    const common = { db: teacher.firestore, uid: "docente-a", year: "2026", courseId: "cuarto_a", termId: "t3", periodRef };
    await save({ ...common, kind: "actividad", sourceRef: ref(teacher, "actividades", "senal-tarea-t3"), payload: activity({ trimestreId: "t3", fecha: "2026-09-23" }) });
    await save({ ...common, kind: "asistencia", sourceRef: ref(teacher, "asistencias", "senal-asistencia-t3"), payload: attendance({ trimestreId: "t3", fecha: "2026-09-23", observacion: "Llego tarde a las 9am" }) });
    const data = await wait((data) => data.trimesterId === "t3" && data.attendance.some((record) => record.observacion));
    assert.equal(data.attendance.find((record) => record.observacion).observacion, "Llego tarde a las 9am");
  } finally {
    watcher.stop();
    const count = changes.length;
    await deleteDoc(doc(periodosCurso(admin.firestore, "cuarto_a"), "t3"));
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(changes.length, count);
    await deleteDoc(ref(admin, "actividades", "senal-tarea-t3"));
    await deleteDoc(ref(admin, "asistencias", "senal-asistencia-t3"));
  }
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

test("el alumno cambia su clave con la actual y vuelve a ingresar conservando UID, notas y matricula", async () => {
  const pupil = { id: "alumno-cambio-clave", nombre: "Alumno cambio clave", ci: "990000902", cursoId: "cuarto_a" };
  await registrarAlumno(pupil);
  const access = await createStudentAuthAccess(pupil, { id: "cuarto_a" }, { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore });
  await setDoc(ref(admin, "calificaciones", "nota-cambio-clave"), grade({ alumnoId: pupil.id }));
  const learner = authClient("cambio-clave-alumno");
  await signInWithEmailAndPassword(learner.auth, access.authEmail, "123456");
  const input = { currentPassword: "incorrecta", newPassword: "ClaveNueva2026", confirmPassword: "ClaveNueva2026" };
  await assert.rejects(changeOwnPassword(input, { authClient: learner.auth }), (error) => ["auth/invalid-credential", "auth/wrong-password", "auth/invalid-login-credentials"].includes(error.code));
  await changeOwnPassword({ ...input, currentPassword: "123456" }, { authClient: learner.auth });
  await signOut(learner.auth);
  await assert.rejects(signInWithEmailAndPassword(learner.auth, access.authEmail, "123456"), (error) => ["auth/invalid-credential", "auth/wrong-password"].includes(error.code));
  const credential = await signInWithEmailAndPassword(learner.auth, access.authEmail, "ClaveNueva2026");
  assert.equal(credential.user.uid, access.uid);
  assert.equal((await getStudentContext({ auth: learner.auth, firestore: learner.firestore })).student.id, pupil.id);
  assert.equal((await get(learner, "calificaciones", "nota-cambio-clave")).data().nota, 80);
  assert.equal((await get(admin, "alumnos", pupil.id)).data().authUid, access.uid);
  assert.equal((await get(admin, "usuarios", access.uid)).data().password, undefined);
  await signOut(learner.auth);
});

test("dos altas concurrentes con correos distintos dejan un solo acceso vinculado y utilizable", async () => {
  const pupil = { id: "alumno-alta-paralela", nombre: "Alumno paralelo", ci: "990000901", cursoId: "cuarto_a" };
  await registrarAlumno(pupil);
  const creators = [authClient("alta-paralela-a"), authClient("alta-paralela-b")];
  const emails = ["alta.paralela.a@example.test", "alta.paralela.b@example.test"];
  const results = await Promise.allSettled(creators.map((actor, index) => createStudentAuthAccess(pupil, { id: "cuarto_a" }, {
    auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: actor.auth, firestore: admin.firestore
  }, { email: emails[index], temporaryPassword: "123456" })));
  const saved = (await get(admin, "alumnos", pupil.id)).data();
  const profiles = await getDocs(query(col(admin, "usuarios"), where("alumnoId", "==", pupil.id)));
  assert.equal(profiles.size, 1);
  assert.equal(profiles.docs[0].id, saved.authUid);
  assert.equal((await get(admin, "indice_accesos", pupil.ci)).data().uid, saved.authUid);
  assert.ok(results.some((item) => item.status === "fulfilled"));
  for (const [index, item] of results.entries()) {
    if (item.status === "fulfilled") assert.equal(item.value.uid, saved.authUid);
    else await assert.rejects(signInWithEmailAndPassword(creators[index].auth, emails[index], "123456"), (error) => ["auth/user-not-found", "auth/invalid-credential"].includes(error.code));
    await signOut(creators[index].auth);
  }
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
  const creado = await createSystemUser({ nombre: "Docente prueba", username: "estructura001", emailRecuperacion: "docente.prueba@example.test", password: "Temporal123", rol: "docente", asignaciones: { cuarto_a: { materias: ["matematica"] } } }, clients);
  assert.equal((await get(admin, "usuarios", creado.id)).data().nombre, "Docente prueba");
  assert.deepEqual((await get(admin, "asignaciones", creado.id)).data().cursos, { cuarto_a: { materias: ["matematica"] } });
  assert.deepEqual(Object.keys((await get(anonymous, "indice_accesos", "estructura001")).data()).sort(), ["authEmail", "uid"]);
  await denied(get(admin, "docentes", creado.id));
  assert.equal(creator.auth.currentUser, null);
  assert.equal(creado.authEmail, "docente.prueba@example.test");
  assert.equal((await get(anonymous, "indice_accesos", "estructura001")).data().authEmail, creado.authEmail);
  const login = await signInWithEmailAndPassword(creator.auth, creado.authEmail, "Temporal123");
  assert.equal(login.user.uid, creado.id);
  await signOut(creator.auth);
});

test("el enlace de recuperacion restablece la clave conservando UID, usuario y asignaciones", async () => {
  const index = (await get(anonymous, "indice_accesos", "estructura001")).data();
  const before = (await get(admin, "asignaciones", index.uid)).data();
  await solicitarRecuperacion("estructura001", { auth: creator.auth, resolver: async () => index.authEmail, enviar: sendPasswordResetEmail });
  const response = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/oobCodes`);
  assert.equal(response.ok, true);
  const payload = await response.json();
  const code = payload.oobCodes.findLast((item) => item.email === index.authEmail && item.requestType === "PASSWORD_RESET");
  assert.ok(code);
  assert.equal(await verificarEnlaceRestablecimiento(creator.auth, code.oobCode), index.authEmail);
  await assert.rejects(confirmarRestablecimiento({ auth: creator.auth, code: code.oobCode, password: "NuevaTemporal456", confirmation: "Distinta456" }), /no coinciden/);
  assert.equal(await verificarEnlaceRestablecimiento(creator.auth, code.oobCode), index.authEmail);
  await confirmarRestablecimiento({ auth: creator.auth, code: code.oobCode, password: "NuevaTemporal456", confirmation: "NuevaTemporal456" });
  await assert.rejects(signInWithEmailAndPassword(creator.auth, index.authEmail, "Temporal123"));
  const login = await signInWithEmailAndPassword(creator.auth, index.authEmail, "NuevaTemporal456");
  assert.equal(login.user.uid, index.uid);
  await signOut(creator.auth);
  assert.deepEqual((await get(admin, "asignaciones", index.uid)).data(), before);
  assert.equal((await get(admin, "usuarios", index.uid)).data().usuario, "estructura001");
  await assert.rejects(confirmPasswordReset(creator.auth, code.oobCode, "OtraTemporal789"));
  await assert.rejects(verificarEnlaceRestablecimiento(creator.auth, code.oobCode));
});

test("director y administrador nuevos tambien usan su correo real y no necesitan asignaciones", async () => {
  const clients = { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore };
  for (const rol of ["director", "admin"]) {
    const email = `${rol}.registro@example.test`;
    const creado = await createSystemUser({ nombre: `Prueba ${rol}`, username: `${rol}correo001`, emailRecuperacion: email, password: "Temporal123", rol }, clients);
    assert.equal(creado.authEmail, email);
    assert.equal(creado.correoRecuperacion, email);
    assert.equal((await get(admin, "asignaciones", creado.id)).exists(), false);
    const login = await signInWithEmailAndPassword(creator.auth, email, "Temporal123");
    assert.equal(login.user.uid, creado.id);
    await signOut(creator.auth);
  }
});

test("un correo ocupado no crea otra cuenta, perfil ni indice de acceso", async () => {
  const clients = { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore };
  await assert.rejects(createSystemUser({ nombre: "Duplicado", username: "correorepetido001", emailRecuperacion: "docente.prueba@example.test", password: "Temporal123", rol: "director" }, clients), /correo ya pertenece/);
  assert.equal((await get(admin, "indice_accesos", "correorepetido001")).exists(), false);
  assert.equal(creator.auth.currentUser, null);
});

test("las reglas permiten Inicial y Preinicial pero rechazan mezclar Primaria o asignar materias numericas", async () => {
  const target = ref(admin, "asignaciones", "docente-inicial");
  const data = { cursos: { inicial: { materias: [] }, preinicial: { materias: [] } }, nivelDocente: "inicial", modalidadEvaluacion: "cualitativa" };
  await setDoc(target, data);
  await denied(setDoc(target, { ...data, cursos: { ...data.cursos, cuarto_a: { materias: ["matematica"] } } }));
  await denied(setDoc(target, { ...data, nivelDocente: "primaria" }));
  await denied(setDoc(target, { ...data, cursos: { inicial: { materias: ["matematica"] } } }));
  await denied(setDoc(target, { cursos: { preinicial_inicial: { materias: [] } } }));
  assert.deepEqual((await get(admin, "asignaciones", "docente-inicial")).data(), data);
});

test("Inicial y Preinicial tienen sus propias matriculas y no conceden acceso a Primaria", async () => {
  await setDoc(ref(admin, "usuarios", "docente-inicial"), { rol: "docente", activo: true, nivelDocente: "inicial", modalidadEvaluacion: "cualitativa" });
  await registrarAlumno({ id: "alumno-inicial", cursoId: "inicial" });
  await registrarAlumno({ id: "alumno-preinicial", cursoId: "preinicial" });
  for (const courseId of ["inicial", "preinicial"]) {
    const enrolled = await getDocs(query(col(initialTeacher, "matriculas"), where("cursoId", "==", courseId)));
    assert.equal(enrolled.size, 1);
    assert.equal(enrolled.docs[0].data().cursoId, courseId);
  }
  await denied(get(initialTeacher, "alumnos", "alumno-a"));
  await denied(get(teacher, "alumnos", "alumno-inicial"));
  await denied(getDocs(query(col(initialTeacher, "matriculas"), where("cursoId", "==", "cuarto_a"))));
});

test("ninguna cuenta puede guardar notas numericas de Inicial ni Preinicial", async () => {
  for (const cursoId of ["inicial", "preinicial"]) {
    await denied(setDoc(ref(admin, "calificaciones", `nota-${cursoId}`), grade({ cursoId })));
    await denied(setDoc(ref(initialTeacher, "calificaciones", `nota-${cursoId}`), grade({ cursoId, calificadoPorUid: "docente-inicial" })));
  }
});

const initialContext = { uid: "docente-inicial", gestionId: "2026", courses: [findCourse("inicial"), findCourse("preinicial")] };
const initialClients = { db: initialTeacher.firestore, authClient: { currentUser: { uid: "docente-inicial" } } };
const activityCriteria = Object.fromEntries(["ser", "saber", "hacer"].map((dimension) => [dimension, { criterio: `Criterio ${dimension}`, opciones: { logrado: "Lo realiza con autonomia", en_proceso: "Lo realiza con orientacion", requiere_apoyo: "Requiere acompanamiento", no_observado: "Todavia no se observo" } }]));
let qualitativeActivity, otherQualitativeActivity;
test("crear actividad con criterios aprobados es atomico y reintentar no duplica ni sobreescribe", async () => {
  const input = { id: "docente-inicial_aprobada-al-crear", cursoId: "inicial", trimestreId: "t1", accion: "crear", titulo: "Construimos figuras", materiaId: "artes_plasticas", descripcion: "Construir con material reciclado", prioritaria: true, criterios: activityCriteria };
  const result = await modificarActividadInicial(initialContext, input, initialClients);
  assert.equal(Object.keys(result.criterios).length, 3);
  const retried = await modificarActividadInicial(initialContext, { ...input, titulo: "No debe reemplazar el original" }, initialClients);
  assert.equal(retried.id, result.id); assert.equal(retried.titulo, input.titulo);
  await denied(updateDoc(ref(initialTeacher, "actividades_inicial", result.id), { criterios: { ser: {} }, updatedAt: serverTimestamp() }));
});
test("actividades cualitativas son privadas, sin fecha obligatoria y ordenables por su docente", async () => {
  const input = { cursoId: "inicial", trimestreId: "t1", accion: "crear", titulo: "Muneco de carton", materiaId: "artes_plasticas", descripcion: "Construccion con material reciclado", prioritaria: true };
  qualitativeActivity = await modificarActividadInicial(initialContext, input, initialClients);
  otherQualitativeActivity = await modificarActividadInicial(initialContext, { ...input, titulo: "Vocales", materiaId: "lenguaje" }, initialClients);
  assert.equal(qualitativeActivity.fecha, undefined);
  const rows = await listarActividadesInicial(initialContext, "inicial", "t1", initialClients); assert.equal(rows.filter((item) => [qualitativeActivity.id, otherQualitativeActivity.id].includes(item.id)).length, 2);
  const moved = await moverActividadInicial(initialContext, qualitativeActivity, otherQualitativeActivity, initialClients);
  assert.equal(moved[0].orden, otherQualitativeActivity.orden);
  qualitativeActivity = moved[0]; otherQualitativeActivity = moved[1];
  for (const actor of [anonymous, student, teacherB]) await denied(get(actor, "actividades_inicial", qualitativeActivity.id));
  assert.equal((await get(director, "actividades_inicial", qualitativeActivity.id)).exists(), true);
  await denied(updateDoc(ref(initialTeacher, "actividades_inicial", qualitativeActivity.id), { materiaId: "matematica", updatedAt: serverTimestamp() }));
  await denied(updateDoc(ref(initialTeacher, "actividades_inicial", qualitativeActivity.id), { criterios: { ser: {} }, updatedAt: serverTimestamp() }));
});
test("habilitar criterios los fija; guardar avances es atomico y permite corregir sin duplicar", async () => {
  qualitativeActivity = await modificarActividadInicial(initialContext, { ...qualitativeActivity, accion: "criterios", criterios: activityCriteria }, initialClients);
  await assert.rejects(modificarActividadInicial(initialContext, { ...qualitativeActivity, accion: "criterios", criterios: activityCriteria }, initialClients), /habilitados/);
  const first = await guardarAvanceInicial(initialContext, qualitativeActivity, "alumno-inicial", { ser: { valoracion: "logrado" }, saber: { valoracion: "en_proceso" }, hacer: { valoracion: "requiere_apoyo", descripcion: "Requiere ayuda al recortar" } }, initialClients);
  assert.equal(first.records.length, 3); assert.equal(first.activity.tieneRegistros, true);
  const createdAt = (await get(initialTeacher, "registros_inicial", first.records[2].id)).data().createdAt;
  const corrected = await guardarAvanceInicial(initialContext, first.activity, "alumno-inicial", { hacer: { valoracion: "logrado", descripcion: "Correccion docente" } }, initialClients);
  assert.equal(corrected.records[0].id, first.records[2].id);
  assert.equal(corrected.records[0].createdAt.toMillis(), createdAt.toMillis());
  assert.equal((await get(initialTeacher, "registros_inicial", corrected.records[0].id)).data().opinion, activityCriteria.hacer.opciones.logrado);
  await denied(updateDoc(ref(initialTeacher, "registros_inicial", corrected.records[0].id), { opinion: "Nota inventada", updatedAt: serverTimestamp() }));
  await denied(updateDoc(ref(initialTeacher, "actividades_inicial", qualitativeActivity.id), { criterios: { ...activityCriteria, ser: { ...activityCriteria.ser, criterio: "Cambiar significado" } }, updatedAt: serverTimestamp() }));
});
test("multigrado comparte una actividad sin cambiar la matricula ni mezclar los registros de cada curso", async () => {
  const shared = await guardarAvanceInicial(initialContext, qualitativeActivity, "alumno-preinicial", { ser: { valoracion: "logrado" }, saber: { valoracion: "en_proceso" }, hacer: { valoracion: "logrado" } }, { ...initialClients, cursoAlumnoId: "preinicial" });
  assert.equal(shared.records.length, 3);
  assert.ok(shared.records.every((record) => record.cursoId === "preinicial" && record.actividadId === qualitativeActivity.id));
  assert.equal((await get(initialTeacher, "matriculas", "alumno-preinicial")).data().cursoId, "preinicial");
  const initialRows = await listarRegistrosInicial(initialContext, "inicial", "t1", initialClients);
  const preinitialRows = await listarRegistrosInicial(initialContext, "preinicial", "t1", initialClients);
  assert.ok(initialRows.every((record) => record.alumnoId !== "alumno-preinicial"));
  assert.ok(preinitialRows.some((record) => record.id === shared.records[0].id));
  const limited = { ...initialContext, courses: [findCourse("inicial")] };
  await assert.rejects(guardarAvanceInicial(limited, qualitativeActivity, "alumno-preinicial", { ser: { valoracion: "logrado" } }, { ...initialClients, cursoAlumnoId: "preinicial" }));
  await denied(guardarAvanceInicial(initialContext, qualitativeActivity, "alumno-a", { ser: { valoracion: "logrado" } }, { ...initialClients, cursoAlumnoId: "inicial" }));
});

test("avance exige el curso real del alumno y no admite ausencia de criterios ni notas numericas", async () => {
  await denied(guardarAvanceInicial(initialContext, qualitativeActivity, "alumno-preinicial", { ser: { valoracion: "logrado" } }, initialClients));
  await assert.rejects(guardarAvanceInicial(initialContext, otherQualitativeActivity, "alumno-inicial", { ser: { valoracion: "logrado" } }, initialClients));
  const id = idAvanceInicial(initialContext.uid, qualitativeActivity.id, "alumno-inicial", "ser");
  await denied(updateDoc(ref(initialTeacher, "registros_inicial", id), { puntaje: 100, updatedAt: serverTimestamp() }));
  for (const actor of [anonymous, student, teacher]) await denied(get(actor, "registros_inicial", id));
});
test("eliminar y restaurar actividades conserva las observaciones, y finalizadas no admiten avances", async () => {
  const input = { ...qualitativeActivity, accion: "eliminar" };
  const removed = await modificarActividadInicial(initialContext, input, initialClients); assert.equal(removed.estado, "eliminada"); assert.equal(removed.prioritaria, false);
  const id = idAvanceInicial(initialContext.uid, qualitativeActivity.id, "alumno-inicial", "ser"); assert.equal((await get(initialTeacher, "registros_inicial", id)).exists(), true);
  await assert.rejects(guardarAvanceInicial(initialContext, removed, "alumno-inicial", { ser: { valoracion: "logrado" } }, initialClients));
  const restored = await modificarActividadInicial(initialContext, { ...removed, accion: "restaurar" }, initialClients);
  const finished = await modificarActividadInicial(initialContext, { ...restored, accion: "finalizar" }, initialClients);
  await assert.rejects(guardarAvanceInicial(initialContext, finished, "alumno-inicial", { ser: { valoracion: "logrado" } }, initialClients));
  await denied(deleteDoc(ref(initialTeacher, "actividades_inicial", qualitativeActivity.id)));
});
const initialRecord = (changes = {}) => ({ cursoId: "inicial", trimestreId: "t1", tipo: "diario", fecha: "2026-03-10", alumnoId: "alumno-inicial", estado: "realiza", descripcion: "Participo en la actividad.", docenteUid: "docente-inicial", updatedAt: serverTimestamp(), ...changes });

test("Inicial acumula observaciones y bitacoras sin fecha manual y reintentar no duplica", async () => {
  const input = { id: "docente-inicial_observacion-nueva", cursoId: "inicial", trimestreId: "t1", alumnoId: "alumno-inicial", tipo: "observacion", materiaId: "artes_plasticas", dimension: "ser", criterio: "Comparte sus materiales", valoracion: "logrado", descripcion: "Es amable con sus companeros." };
  await guardarRegistroInicial(initialContext, input, initialClients);
  await guardarRegistroInicial(initialContext, input, initialClients);
  const first = await get(initialTeacher, "registros_inicial", input.id);
  assert.equal(first.data().fecha, undefined);
  assert.ok(first.data().createdAt);
  await guardarRegistroInicial(initialContext, { ...input, id: "docente-inicial_bitacora-uno", tipo: "bitacora", descripcion: "Comentario uno" }, initialClients);
  await guardarRegistroInicial(initialContext, { ...input, id: "docente-inicial_bitacora-dos", tipo: "bitacora", descripcion: "Comentario dos" }, initialClients);
  const rows = await listarRegistrosInicial(initialContext, "inicial", "t1", initialClients);
  assert.equal(rows.filter((item) => [input.id, "docente-inicial_bitacora-uno", "docente-inicial_bitacora-dos"].includes(item.id)).length, 3);
  await denied(updateDoc(ref(initialTeacher, "registros_inicial", input.id), { valoracion: "requiere_apoyo", updatedAt: serverTimestamp() }));
  for (const actor of [student, anonymous, teacher]) await denied(get(actor, "registros_inicial", input.id));
});
test("Bitacora permite corregir solo texto del autor y rechaza cambio de identidad o conflictos", async () => {
  const input = { id: "docente-inicial_bitacora-editable", cursoId: "inicial", trimestreId: "t1", alumnoId: "alumno-inicial", tipo: "bitacora", materiaId: "", descripcion: "Comentario original" };
  await guardarRegistroInicial(initialContext, input, initialClients);
  const original = (await get(initialTeacher, "registros_inicial", input.id)).data();
  const edit = { ...input, descripcionAnterior: input.descripcion, descripcion: "Comentario corregido" };
  await editarBitacoraInicial(initialContext, edit, initialClients);
  const updated = (await get(initialTeacher, "registros_inicial", input.id)).data();
  assert.equal(updated.descripcion, "Comentario corregido"); assert.equal(updated.createdAt.toMillis(), original.createdAt.toMillis());
  await assert.rejects(editarBitacoraInicial(initialContext, edit, initialClients), /cambio/);
  for (const changes of [{ cursoId: "preinicial" }, { trimestreId: "t2" }, { alumnoId: "alumno-preinicial" }, { docenteUid: "docente-a" }, { tipo: "informe" }, { materiaId: "matematica" }, { createdAt: serverTimestamp() }, { descripcion: "a".repeat(5001) }, { descripcion: "" }]) await denied(updateDoc(ref(initialTeacher, "registros_inicial", input.id), { ...changes, updatedAt: serverTimestamp() }));
  for (const actor of [student, anonymous, teacher, teacherB]) await denied(updateDoc(ref(actor, "registros_inicial", input.id), { descripcion: "No autorizado", updatedAt: serverTimestamp() }));
});

test("informe cualitativo conserva un unico documento y limita el texto a 200 caracteres", async () => {
  const input = { cursoId: "inicial", trimestreId: "t1", alumnoId: "alumno-inicial", tipo: "informe", descripcion: "Participa con entusiasmo. Requiere apoyo al recortar.", origen: "docente", aprobado: false, fuentesFirma: "3-abcd" };
  const draft = await guardarRegistroInicial(initialContext, input, initialClients);
  const approved = await guardarRegistroInicial(initialContext, { ...input, aprobado: true }, initialClients);
  assert.equal(draft.id, approved.id);
  assert.equal((await get(initialTeacher, "registros_inicial", draft.id)).data().aprobado, true);
  await denied(updateDoc(ref(initialTeacher, "registros_inicial", draft.id), { descripcion: "a".repeat(201), updatedAt: serverTimestamp() }));
  await denied(updateDoc(ref(initialTeacher, "registros_inicial", draft.id), { trimestreId: "t2", updatedAt: serverTimestamp() }));
  await denied(updateDoc(ref(initialTeacher, "registros_inicial", draft.id), { puntaje: 100, updatedAt: serverTimestamp() }));
});

test("Inicial guarda y edita observaciones reales sin crear notas ni duplicar el mismo registro", async () => {
  const input = initialRecord();
  const first = await guardarRegistroInicial(initialContext, input, initialClients);
  const second = await guardarRegistroInicial(initialContext, { ...input, estado: "apoyo", descripcion: "Necesito acompanamiento." }, initialClients);
  assert.equal(first.id, second.id);
  const rows = await listarRegistrosInicial(initialContext, "inicial", "t1", initialClients);
  assert.equal(rows.filter((item) => item.tipo === "diario").length, 1);
  assert.equal(rows.find((item) => item.id === first.id).estado, "apoyo");
  assert.equal(Object.hasOwn(rows.find((item) => item.id === first.id), "nota"), false);
  assert.equal((await getDocs(query(col(admin, "calificaciones"), where("cursoId", "==", "inicial")))).size, 0);
});
test("la bitacora semanal admite curso y alumno y usa una sola entrada por semana", async () => {
  const first = await guardarRegistroInicial(initialContext, initialRecord({ tipo: "semanal", alumnoId: "", fecha: "2026-03-11" }), initialClients);
  const second = await guardarRegistroInicial(initialContext, initialRecord({ tipo: "semanal", alumnoId: "", fecha: "2026-03-13", descripcion: "Progreso del curso." }), initialClients);
  assert.equal(first.id, second.id);
  assert.equal(second.fecha, "2026-03-09");
  await guardarRegistroInicial(initialContext, initialRecord({ tipo: "semanal", cursoId: "preinicial", alumnoId: "alumno-preinicial" }), initialClients);
  assert.equal((await listarRegistrosInicial(initialContext, "preinicial", "t1", initialClients)).filter((record) => record.tipo === "semanal").length, 1);
});
test("los registros cualitativos rechazan otro curso, alumno incorrecto, estados inventados y puntajes", async () => {
  for (const changes of [{ cursoId: "cuarto_a", alumnoId: "alumno-a" }, { alumnoId: "alumno-preinicial" }, { alumnoId: "inexistente" }, { estado: "80" }, { nota: 100 }, { valor: 90 }, { descripcion: "x".repeat(1501) }, { fecha: "2027-03-10" }, { docenteUid: "docente-a" }]) await denied(setDoc(ref(initialTeacher, "registros_inicial", "registro-no-valido"), initialRecord(changes)));
});
test("las bitacoras son privadas para su autor asignado, director y admin, no para alumnos ni anonimos", async () => {
  const saved = await guardarRegistroInicial(initialContext, initialRecord(), initialClients);
  assert.equal((await get(director, "registros_inicial", saved.id)).exists(), true);
  assert.equal((await get(admin, "registros_inicial", saved.id)).exists(), true);
  for (const actor of [student, anonymous, teacher, teacherB]) await denied(get(actor, "registros_inicial", saved.id));
  await denied(getDocs(query(col(initialTeacher, "registros_inicial"), where("cursoId", "==", "inicial"))));
  await denied(setDoc(ref(teacher, "registros_inicial", "spoof-inicial"), initialRecord({ docenteUid: "docente-a" })));
});
test("una observacion no puede moverse de alumno, curso, fecha o trimestre al editar", async () => {
  const saved = await guardarRegistroInicial(initialContext, initialRecord(), initialClients);
  for (const changes of [{ tipo: "semanal", estado: "" }, { fecha: "2026-03-11" }, { trimestreId: "t2" }, { alumnoId: "" }, { cursoId: "preinicial", alumnoId: "alumno-preinicial" }]) await denied(updateDoc(ref(initialTeacher, "registros_inicial", saved.id), { ...changes, updatedAt: serverTimestamp() }));
});
test("sin habilitacion anual y con matricula retirada no se registran nuevas observaciones", async () => {
  await updateDoc(ref(admin, "matriculas", "alumno-inicial"), { estado: "retirado" });
  await denied(setDoc(ref(initialTeacher, "registros_inicial", "retirado"), initialRecord()));
  await updateDoc(ref(admin, "matriculas", "alumno-inicial"), { estado: "activo" });
  await deleteDoc(doc(admin.firestore, "gestiones", "2026"));
  await denied(setDoc(ref(initialTeacher, "registros_inicial", "sin-gestion"), initialRecord()));
  await setDoc(doc(admin.firestore, "gestiones", "2026"), { ano: 2026, createdBy: "admin-prueba" });
});

test("crear un docente cualitativo guarda el nivel y no requiere materias de Primaria", async () => {
  const clients = { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore };
  const creado = await createSystemUser({ nombre: "Docente cualitativo", username: "inicial001", emailRecuperacion: "inicial.prueba@example.test", password: "Temporal123", rol: "docente", asignaciones: { inicial: { materias: [] } } }, clients);
  const perfil = (await get(admin, "usuarios", creado.id)).data();
  const asignacion = (await get(admin, "asignaciones", creado.id)).data();
  assert.equal(perfil.nivelDocente, "inicial");
  assert.equal(perfil.modalidadEvaluacion, "cualitativa");
  assert.equal(asignacion.nivelDocente, perfil.nivelDocente);
  assert.deepEqual(asignacion.cursos, { inicial: { materias: [] } });
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
  await assert.rejects(createSystemUser({ nombre: "No debe quedar", username: "rollback001", emailRecuperacion: "rollback.prueba@example.test", password: "Temporal123", rol: "docente", asignaciones: { cuarto_a: { materias: ["matematica"] } } }, clients), /sesion cambio/);
  assert.equal((await get(admin, "indice_accesos", "rollback001")).exists(), false);
  assert.equal(creator.auth.currentUser, null);
  await assert.rejects(signInWithEmailAndPassword(creator.auth, "rollback.prueba@example.test", "Temporal123"), (error) => ["auth/user-not-found", "auth/invalid-credential"].includes(error.code));
});

test("reemplazar crea acceso y reparte trimestres atomicamente sin borrar ni desactivar al anterior", async () => {
  const clients = { auth: { currentUser: { uid: "admin-prueba" } }, creatorAuth: creator.auth, firestore: admin.firestore };
  const oldTeacher = await createSystemUser({ nombre: "Docente anterior", username: "relevoanterior", emailRecuperacion: "relevo.anterior@example.test", password: "Temporal123", rol: "docente", asignaciones: { cuarto_a: { materias: ["matematica"] } } }, clients);
  const source = client("relevo-origen", oldTeacher.id);
  await setDoc(ref(source, "actividades", "relevo-historico"), activity({ trimestreId: "t1", creadoPorUid: oldTeacher.id }));
  await guardarNota(source, "relevo-nota-historica", grade({ actividadId: "relevo-historico", trimestreId: "t1", calificadoPorUid: oldTeacher.id }));
  const before = (await get(admin, "calificaciones", "relevo-nota-historica")).data();
  const replacement = await createSystemUser({ nombre: "Docente nuevo", username: "relevonuevo", emailRecuperacion: "relevo.nuevo@example.test", password: "Temporal123", rol: "docente", reemplazo: { docenteUid: oldTeacher.id, trimestreInicio: "t2" } }, clients);
  const target = client("relevo-destino", replacement.id);
  const oldAssignment = (await get(admin, "asignaciones", oldTeacher.id)).data();
  const newAssignment = (await get(admin, "asignaciones", replacement.id)).data();
  assert.deepEqual(oldAssignment.trimestres, ["t1"]);
  assert.deepEqual(newAssignment.trimestres, ["t2", "t3"]);
  assert.deepEqual(newAssignment.cursos, oldAssignment.cursos);
  assert.equal(oldAssignment.reemplazadoPorUid, replacement.id);
  assert.equal(newAssignment.reemplazoDeUid, oldTeacher.id);
  assert.equal((await get(admin, "usuarios", oldTeacher.id)).data().activo, true);
  assert.deepEqual((await get(target, "calificaciones", "relevo-nota-historica")).data(), before);
  await denied(updateDoc(ref(target, "calificaciones", "relevo-nota-historica"), { nota: 100, valor: 100, calificadoPorUid: replacement.id }));
  await denied(deleteDoc(ref(target, "calificaciones", "relevo-nota-historica")));
  await denied(updateDoc(ref(target, "actividades", "relevo-historico"), { trimestreId: "t2" }));
  await denied(setDoc(ref(source, "actividades", "relevo-invasion"), activity({ creadoPorUid: oldTeacher.id })));
  await setDoc(ref(target, "actividades", "relevo-propia"), activity({ creadoPorUid: replacement.id }));
  await guardarNota(target, "relevo-propia-nota", grade({ actividadId: "relevo-propia", calificadoPorUid: replacement.id }));
  await denied(updateDoc(ref(source, "calificaciones", "relevo-propia-nota"), { valor: 90, nota: 90, calificadoPorUid: oldTeacher.id }));
  await setDoc(ref(source, "asistencias", "relevo-asistencia-primero"), attendance({ trimestreId: "t1", registradoPorUid: oldTeacher.id }));
  await denied(updateDoc(ref(target, "asistencias", "relevo-asistencia-primero"), { trimestreId: "t2", registradoPorUid: replacement.id }));
  await denied(setDoc(ref(source, "asistencias", "relevo-asistencia-segundo"), attendance({ registradoPorUid: oldTeacher.id })));
  await setDoc(ref(target, "asistencias", "relevo-asistencia-segundo"), attendance({ registradoPorUid: replacement.id }));
  await updateDoc(ref(source, "calificaciones", "relevo-nota-historica"), { valor: 85, nota: 85 });
  await setTeacherActive(oldTeacher.id, false, clients);
  await denied(get(source, "actividades", "relevo-historico"));
  await denied(updateDoc(ref(source, "calificaciones", "relevo-nota-historica"), { valor: 90, nota: 90 }));
  assert.equal((await get(target, "calificaciones", "relevo-nota-historica")).data().nota, 85);
  await setTeacherActive(oldTeacher.id, true, clients);
  assert.equal((await get(source, "actividades", "relevo-historico")).exists(), true);
  await assert.rejects(createSystemUser({ nombre: "Duplicado", username: "relevoduplicado", emailRecuperacion: "relevo.duplicado@example.test", password: "Temporal123", rol: "docente", reemplazo: { docenteUid: oldTeacher.id, trimestreInicio: "t2" } }, clients), /ya tiene un reemplazo/);
  assert.equal((await get(admin, "indice_accesos", "relevoduplicado")).exists(), false);
  await denied(setTeacherActive(oldTeacher.id, false, { auth: { currentUser: { uid: "docente-a" } }, firestore: teacher.firestore }));
});

test("el reemplazante continua AUTO existente solo en su trimestre y materia asignados", async () => {
  const a = client("auto-relevo-a", "auto-relevo-a"), b = client("auto-relevo-b", "auto-relevo-b");
  for (const [uid, terms] of [["auto-relevo-a", ["t1"]], ["auto-relevo-b", ["t2", "t3"]]]) {
    await setDoc(ref(admin, "usuarios", uid), { rol: "docente", activo: true });
    await setDoc(ref(admin, "asignaciones", uid), { cursos: { cuarto_a: { materias: ["matematica"] } }, trimestres: terms });
  }
  const id = "auto_t2_cuarto_a_matematica_autoevaluacion";
  const task = activity({ tipo: "auto", interno: true, maximo: 5, fecha: "", creadoPorUid: "auto-relevo-a" });
  await setDoc(ref(admin, "actividades", id), task);
  const inherited = grade({ actividadId: id, maximo: 5, valor: 3, nota: 60, calificadoPorUid: "auto-relevo-a" });
  const gradeId = `${id}_alumno-a`;
  await guardarNota(admin, gradeId, inherited);
  const result = await saveGrade({ activity: { id, ...task }, student: { id: "alumno-a", cursoId: "cuarto_a" }, value: 4 }, { db: b.firestore, uid: "auto-relevo-b", audit: async () => {} });
  assert.equal((await get(b, "calificaciones", result.id)).data().nota, 80);
  assert.equal((await get(admin, "actividades", id)).data().creadoPorUid, "auto-relevo-a");
  await denied(updateDoc(ref(a, "calificaciones", result.id), { valor: 5, nota: 100, calificadoPorUid: "auto-relevo-a" }));
  await denied(updateDoc(ref(b, "actividades", id), { creadoPorUid: "auto-relevo-b" }));
  await denied(updateDoc(ref(b, "actividades", id), { trimestreId: "t1" }));
});

test("las reglas de Inicial separan tambien los trimestres del relevo", async () => {
  const a = client("inicial-relevo-a", "inicial-relevo-a");
  const b = client("inicial-relevo-b", "inicial-relevo-b");
  for (const [id, terms] of [["inicial-relevo-a", ["t1"]], ["inicial-relevo-b", ["t2", "t3"]]]) {
    await setDoc(ref(admin, "usuarios", id), { rol: "docente", activo: true });
    await setDoc(ref(admin, "asignaciones", id), { cursos: { inicial: { materias: [] } }, trimestres: terms });
  }
  const record = { cursoId: "inicial", trimestreId: "t1", tipo: "diario", fecha: "2026-03-10", alumnoId: "alumno-inicial", estado: "apoyo", descripcion: "Observacion", docenteUid: "inicial-relevo-a", updatedAt: serverTimestamp() };
  await setDoc(ref(a, "registros_inicial", "relevo-observacion"), record);
  await denied(setDoc(ref(b, "registros_inicial", "relevo-observacion-b"), { ...record, docenteUid: "inicial-relevo-b" }));
  await setDoc(ref(b, "registros_inicial", "relevo-observacion-b"), { ...record, trimestreId: "t2", docenteUid: "inicial-relevo-b" });
  await denied(updateDoc(ref(b, "registros_inicial", "relevo-observacion"), { trimestreId: "t2", docenteUid: "inicial-relevo-b", updatedAt: serverTimestamp() }));
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

test("actualizar un catalogo anterior separa cursos sin mover alumnos ni sobreescribir nombres de Primaria", async () => {
  const clients = { auth: { currentUser: { uid: "admin-prueba", email: "smichmev@gmail.com" } }, firestore: admin.firestore, now: () => new Date("2026-10-06T16:00:00Z") };
  await setDoc(doc(admin.firestore, "catalogos", "escolar"), { version: 1 });
  await setDoc(doc(admin.firestore, "catalogos", "escolar", "cursos", "preinicial_inicial"), { nombre: "Pre Inicial - Inicial", activo: true });
  await registrarAlumno({ id: "alumno-curso-anterior", cursoId: "preinicial_inicial" });
  await prepararGestion("2026", clients);
  assert.equal((await getDocFromServer(doc(admin.firestore, "catalogos", "escolar"))).data().version, 2);
  for (const id of ["inicial", "preinicial"]) {
    const course = (await getDocFromServer(doc(admin.firestore, "catalogos", "escolar", "cursos", id))).data();
    assert.equal(course.activo, true);
    assert.equal(course.modalidadEvaluacion, "cualitativa");
  }
  assert.equal((await getDocFromServer(doc(admin.firestore, "catalogos", "escolar", "cursos", "preinicial_inicial"))).data().activo, false);
  assert.equal((await getDocFromServer(doc(admin.firestore, "catalogos", "escolar", "cursos", "cuarto_a"))).data().nombre, "Cuarto A personalizado");
  assert.equal((await get(admin, "matriculas", "alumno-curso-anterior")).data().cursoId, "preinicial_inicial");
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
