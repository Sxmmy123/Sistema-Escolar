import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocs, getFirestore, query, runTransaction, serverTimestamp, setDoc, setLogLevel, terminate, updateDoc, where, writeBatch } from "firebase/firestore";
import { createStudentAuthAccess, setStudentAccessActive } from "../src/services/studentAccess.js";
import { getStudentContext, getStudentDashboardData } from "../src/services/studentData.js";
import { coleccionGestion, documentoGestion, documentoSeguimiento, establecerConfiguracion } from "../src/services/rutasFirestore.js";
import { importStudents } from "../src/services/adminData.js";
import { createSystemUser } from "../src/services/users.js";
import { prepararGestion } from "../src/services/configuracionSistema.js";
import { actualizarActividadProtegida, eliminarActividadProtegida } from "../src/services/proteccionActividad.js";
import { finalizeActivityReview, saveGrade } from "../src/services/teacherData.js";

const projectId = "demo-sistema-seguridad";
if (process.env.GCLOUD_PROJECT !== projectId || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8185" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9195") {
  throw new Error("Estas pruebas solo se ejecutan con los emuladores del proyecto demo-sistema-seguridad.");
}
setLogLevel("silent");
const apps = [];
const databases = [];
function client(name, uid = "", email = "") {
  const app = initializeApp({ projectId, apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com` }, name);
  const database = getFirestore(app);
  connectFirestoreEmulator(database, "127.0.0.1", 8185, uid ? { mockUserToken: { sub: uid, email } } : undefined);
  apps.push(app); databases.push(database);
  return { app, firestore: database };
}
function authClient(name) {
  const result = client(name);
  result.auth = getAuth(result.app);
  connectAuthEmulator(result.auth, "http://127.0.0.1:9195", { disableWarnings: true });
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
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2 });
  const batch = writeBatch(admin.firestore);
  const seed = (group, id, data) => batch.set(ref(admin, group, id), data);
  seed("configuracion", "sistema", { gestionActivaId: "2026", versionModelo: 2 });
  seed("usuarios", "docente-a", { rol: "docente", activo: true });
  seed("usuarios", "docente-b", { rol: "docente", activo: true });
  seed("usuarios", "docente-anterior", { rol: "docente", activo: true });
  seed("usuarios", "director-a", { rol: "director", activo: true });
  seed("usuarios", "alumno-auth-a", { rol: "alumno", activo: true, alumnoId: "alumno-a" });
  seed("asignaciones", "docente-a", { cursos: { cuarto_a: { materias: ["matematica"] } } });
  seed("asignaciones", "docente-b", { cursos: { quinto_a: { materias: ["matematica"] } } });
  seed("alumnos", "alumno-a", { nombre: "Alumno A", activo: true });
  seed("alumnos", "alumno-b", { nombre: "Alumno B", activo: true });
  seed("alumnos", "companero", { nombre: "Otro alumno", activo: true });
  seed("matriculas", "alumno-a", { alumnoId: "alumno-a", cursoId: "cuarto_a", estado: "activo", numeroAgregacion: 1 });
  seed("matriculas", "alumno-b", { alumnoId: "alumno-b", cursoId: "quinto_a", estado: "activo", numeroAgregacion: 1 });
  seed("matriculas", "companero", { alumnoId: "companero", cursoId: "cuarto_a", estado: "activo", numeroAgregacion: 2 });
  seed("actividades", "tarea-a", activity());
  seed("actividades", "tarea-sociales", activity({ materiaId: "sociales" }));
  seed("actividades", "tarea-b", activity({ cursoId: "quinto_a", creadoPorUid: "docente-b" }));
  const { creadoPorUid, ...legacy } = activity();
  seed("actividades", "actividad-anterior", legacy);
  seed("calificaciones", "nota-a", grade());
  seed("calificaciones", "nota-b", grade({ alumnoId: "alumno-b", actividadId: "tarea-b", cursoId: "quinto_a", calificadoPorUid: "docente-b" }));
  seed("calificaciones", "nota-companero", grade({ alumnoId: "companero" }));
  seed("asistencias", "asistencia-a", attendance());
  seed("asistencias", "asistencia-b", attendance({ cursoId: "quinto_a", alumnoId: "alumno-b", registradoPorUid: "docente-b" }));
  seed("indice_accesos", "docente-a", { uid: "docente-a", authEmail: "docente-a@demo.test" });
  for (let i = 0; i < 25; i += 1) {
    seed("alumnos", `grupo-${i}`, { nombre: `Alumno ${i}`, activo: true });
    seed("matriculas", `grupo-${i}`, { alumnoId: `grupo-${i}`, cursoId: "cuarto_a", estado: "activo", numeroAgregacion: i + 3 });
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
  assert.equal(result.password.length, 16);
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
  assert.equal(result.password.length, 16);
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

test("preparar gestion es explicito, conserva catalogos y no copia registros academicos", async () => {
  const clients = { auth: { currentUser: { uid: "admin-prueba", email: "smichmev@gmail.com" } }, firestore: admin.firestore };
  await prepararGestion("2026", clients);
  const catalogo = doc(admin.firestore, "catalogos", "escolar", "cursos", "cuarto_a");
  await updateDoc(catalogo, { nombre: "Cuarto A personalizado" });
  await prepararGestion("2027", clients);
  assert.equal((await getDocFromServer(catalogo)).data().nombre, "Cuarto A personalizado");
  assert.equal((await getDocs(col(admin, "matriculas"))).size, 0);
  assert.equal((await get(admin, "configuracion", "sistema")).data().gestionActivaId, "2027");
  await denied(updateDoc(documentoGestion(teacher.firestore, "actividades", "tarea-a", "2026"), { titulo: "Cambio en gestion cerrada" }));
  await prepararGestion("2026", clients);
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
