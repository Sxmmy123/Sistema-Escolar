import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";
import { COURSES, SCHEDULE_COURSES, SUBJECTS, periodsForCourse, scheduleCourseId } from "../data/catalog.js";
import { claveActividad } from "./identificadoresActividad.js";
import { coleccionGestion, documentoGestion, gestionActual } from "./rutasFirestore.js";
import { listarAlumnosMatriculados } from "./matriculas.js";
import { validarFechaGestion } from "./registroEscolar.js";
import { parseStudentsBulk } from "./parsearAlumnos.js";
import { normalizeStudentSex } from "./identidadAlumno.js";
import { guardarImportacionHistorica } from "./importacionHistorica.js";
import { normalizarEstadoAsistencia } from "./calculoAcademico.js";
export { parseStudentsBulk } from "./parsearAlumnos.js";

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function attendanceDocId(courseId, date, studentId) {
  return `${date}_${courseId}_${studentId}`.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

function gradeDocId(activityId, studentId) {
  return `${activityId}_${studentId}`.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

function normalizeGrade(value, maximo = 100) {
  const rawValue = Number(value);
  const max = Math.max(Number(maximo) || 100, 1);
  if (!Number.isFinite(rawValue) || !Number.isFinite(max)) return null;
  const raw = Math.max(0, Math.min(max, rawValue));
  const percent = Math.max(0, Math.min(100, Math.round((raw / max) * 100)));
  const nota = percent <= 0 ? 35 : Math.max(35, percent);
  return { valor: raw, porcentaje: percent, nota };
}

export async function importStudents(course, rawText, db = firestore, opciones = {}) {
  const gestionId = opciones.gestionId || gestionActual();
  if (!COURSES.some((item) => item.id === course?.id)) throw new Error("Selecciona un curso valido.");
  const students = Array.isArray(rawText) ? rawText.map((student) => ({
    nombre: cleanText(student.nombre).toUpperCase(), ci: cleanText(student.ci).replace(/\s+/g, "").toUpperCase(),
    correo: String(student.correo || "").trim().toLowerCase(),
    ...(student.sexo ? { sexo: normalizeStudentSex(student.sexo) } : {}), cursoId: course.id
  })) : parseStudentsBulk(rawText, course.id);
  if (!students.length) throw new Error("No hay alumnos para importar.");
  if (students.length > 200) throw new Error("Importa hasta 200 alumnos por carga.");
  const identities = new Set();
  for (const student of students) {
    if (!student.nombre || (student.ci && !/^[a-z0-9._-]+$/i.test(student.ci)) || (Array.isArray(rawText) && !student.ci)) throw new Error("Cada alumno necesita nombre completo y CI valido.");
    if (student.sexo && !["M", "F"].includes(student.sexo)) throw new Error("Selecciona un sexo valido para el alumno.");
    const key = student.ci.toLowerCase() || student.nombre;
    if (identities.has(key)) throw new Error(`CI repetido en la carga: ${student.ci}.`);
    identities.add(key);
  }
  const controlRef = doc(db, "configuracion", "sistema");
  const control = await getDoc(controlRef);
  if (!control.exists() || control.data().versionModelo !== 2) throw new Error("Primero prepara la gestion desde el panel.");
  const revision = Number(control.data().revisionAlumnos || 0);
  const [registry, enrollments] = await Promise.all([
    getDocs(collection(db, "alumnos")), getDocs(coleccionGestion(db, "matriculas", gestionId))
  ]);
  const existentes = registry.docs.map((item) => ({ id: item.id, ...item.data() }));
  const matriculas = new Map(enrollments.docs.map((item) => [item.id, item.data()]));
  let numero = Math.max(0, ...[...matriculas.values()].filter((item) => item.cursoId === course.id).map((item) => Number(item.numeroAgregacion || 0)));
  const escrituras = [];
  const resultado = [];
  for (const student of students) {
    const candidatos = existentes.filter((item) => student.ci ? item.ci === student.ci : item.nombre === student.nombre);
    if (candidatos.length > 1) throw new Error(`Hay registros ambiguos para ${student.nombre}. Revisa el carnet.`);
    const anterior = candidatos[0];
    if (!anterior && student.ci && existentes.some((item) => item.nombre === student.nombre)) {
      throw new Error(`${student.nombre} ya existe con otro carnet. Revisa su identidad antes de importar.`);
    }
    if (anterior && anterior.nombre !== student.nombre) throw new Error(`El carnet ${student.ci} pertenece a ${anterior.nombre}. No se guardo la carga.`);
    if (anterior?.activo === false) throw new Error(`${student.nombre} esta retirado. Reactivalo expresamente antes de matricularlo.`);
    const id = anterior?.id || doc(collection(db, "alumnos")).id;
    const matricula = matriculas.get(id);
    if (matricula && matricula.cursoId !== course.id) throw new Error(`${student.nombre} ya esta matriculado en otro curso de esta gestion.`);
    if (matricula && matricula.estado !== "activo") throw new Error(`${student.nombre} tiene una matricula retirada. Reactivala primero.`);
    if (!anterior) escrituras.push({ ref: doc(db, "alumnos", id), data: {
      nombre: student.nombre, ci: student.ci, ...(student.correo ? { correo: student.correo } : {}), ...(student.sexo ? { sexo: student.sexo } : {}),
      activo: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    } });
    const numeroAgregacion = matricula?.numeroAgregacion || ++numero;
    escrituras.push({ ref: documentoGestion(db, "matriculas", id, gestionId), data: {
      alumnoId: id, cursoId: course.id, numeroAgregacion, estado: "activo",
      ...(!matricula ? { createdAt: serverTimestamp() } : {}), updatedAt: serverTimestamp()
    } });
    resultado.push({ ...anterior, ...student, id, numeroLista: numeroAgregacion, numeroAgregacion, activo: true });
  }
  try {
    await runTransaction(db, async (transaction) => {
      const actual = await transaction.get(controlRef);
      if (Number(actual.data()?.revisionAlumnos || 0) !== revision) {
        const error = new Error("Otra carga de alumnos termino mientras se preparaba esta carga.");
        error.code = "importacion/concurrente";
        throw error;
      }
      for (const item of escrituras) transaction.set(item.ref, item.data, { merge: true });
      transaction.update(controlRef, { revisionAlumnos: revision + 1, updatedAt: serverTimestamp() });
    });
  } catch (error) {
    if (error.code === "importacion/concurrente" && (opciones.intento || 0) < 3) {
      return importStudents(course, rawText, db, { gestionId, intento: (opciones.intento || 0) + 1 });
    }
    throw error;
  }
  return resultado;
}

export async function listStudents(courseId) {
  return listarAlumnosMatriculados(courseId);
}

export async function getSchedule(courseId) {
  const localShape = {
    cursoId: courseId,
    periodos: periodsForCourse(courseId),
    clases: {}
  };
  const year = gestionActual();
  const sharedId = scheduleCourseId(courseId);
  let snap = await getDoc(documentoGestion(firestore, "horarios", sharedId, year));
  // Older records may exist only under Inicial; both courses now use the same source.
  if (!snap.exists() && sharedId === "preinicial") {
    snap = await getDoc(documentoGestion(firestore, "horarios", "inicial", year));
  }
  if (!snap.exists()) return localShape;

  const data = snap.data() || {};
  return {
    ...localShape,
    clases: data.clases || {}
  };
}

export async function saveScheduleCell(courseId, periodId, dayId, subjectId) {
  const sharedId = scheduleCourseId(courseId);
  if (sharedId === "preinicial") {
    const year = gestionActual();
    const ref = documentoGestion(firestore, "horarios", sharedId, year);
    await runTransaction(firestore, async (transaction) => {
      const saved = await transaction.get(ref);
      const source = saved.exists() ? saved : await transaction.get(documentoGestion(firestore, "horarios", "inicial", year));
      const classes = source.data()?.clases || {};
      transaction.set(ref, {
        clases: { ...classes, [periodId]: { ...classes[periodId], [dayId]: subjectId || null } },
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
    return;
  }
  await setDoc(documentoGestion(firestore, "horarios", courseId), {
    clases: {
      [periodId]: {
        [dayId]: subjectId || null
      }
    },
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function getAllSchedules() {
  const snap = await getDocs(coleccionGestion(firestore, "horarios"));
  const saved = new Map(snap.docs.map((item) => [item.id, item]));
  const schedules = {};
  snap.docs.forEach((item) => {
    const id = scheduleCourseId(item.id);
    const data = (saved.get(id) || item).data() || {};
    schedules[id] = {
      cursoId: id,
      periodos: periodsForCourse(id),
      clases: data.clases || {}
    };
  });
  return schedules;
}

export async function saveFullSchedule(courseId, schedule) {
  await setDoc(documentoGestion(firestore, "horarios", scheduleCourseId(courseId)), {
    clases: schedule?.clases || {},
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function importSchedulesPayload(payload) {
  const rawSchedules = payload?.horarios || payload?.schedules || payload;
  if (!rawSchedules || typeof rawSchedules !== "object") {
    throw new Error("El archivo no contiene horarios validos.");
  }

  const courseByName = new Map(COURSES.map((course) => [cleanText(course.nombre).toLowerCase(), course]));
  const courseById = new Map(COURSES.map((course) => [course.id, course]));
  const entries = Object.entries(rawSchedules)
    .map(([key, value]) => {
      const course = courseById.get(key) || courseById.get(value?.cursoId) || courseByName.get(cleanText(value?.cursoNombre || value?.curso || key).toLowerCase());
      if (!course || !value || typeof value !== "object") return null;
      return [course.id, {
        clases: value.clases || value.horario || {}
      }];
    })
    .filter(Boolean);

  if (!entries.length) {
    throw new Error("No se encontraron horarios compatibles para importar.");
  }

  const shared = new Map();
  const signature = (classes) => JSON.stringify(Object.entries(classes).sort(([a], [b]) => a.localeCompare(b))
    .map(([period, days]) => [period, Object.entries(days).sort(([a], [b]) => a.localeCompare(b))]));
  for (const [courseId, schedule] of entries) {
    const id = scheduleCourseId(courseId);
    if (shared.has(id) && signature(shared.get(id).clases) !== signature(schedule.clases)) {
      throw new Error("Inicial y Preinicial comparten un solo horario. El archivo contiene horarios distintos para ambos cursos; unificalos antes de importar.");
    }
    shared.set(id, schedule);
  }
  await Promise.all([...shared].map(([courseId, schedule]) => saveFullSchedule(courseId, schedule)));
  return shared.size;
}

export async function importHistoricalAttendance({ course, rows, trimestreId, onProgress, isCurrent = () => true }, clients = { auth, firestore, read: getDocs, transact: runTransaction }) {
  if (!course?.id) throw new Error("Selecciona un curso valido.");
  if (!Array.isArray(rows) || !rows.length) throw new Error("No hay asistencias para guardar.");
  if (!["t1", "t2", "t3"].includes(trimestreId)) throw new Error("Selecciona un trimestre valido.");
  const year = gestionActual(), uid = clients.auth.currentUser?.uid;
  rows.forEach((row) => validarFechaGestion(row.fecha, year));
  if (!uid) throw new Error("Ingresa como administrador para importar.");
  const current = () => clients.auth.currentUser?.uid === uid && gestionActual() === year && isCurrent();
  const source = await clients.read(query(coleccionGestion(clients.firestore, "asistencias", year), where("cursoId", "==", course.id)));
  const existing = new Map(source.docs.map((item) => [`asistencias/${item.id}`, item.data()]));
  const requestedAttendance = new Set(rows.map((row) => JSON.stringify([row.fecha, row.student?.id])));
  const attendanceIds = new Map();
  for (const item of source.docs) {
    const data = item.data(), key = JSON.stringify([data.fecha, data.alumnoId]);
    if (!requestedAttendance.has(key)) continue;
    if (attendanceIds.has(key)) throw new Error("Hay asistencias duplicadas para un alumno y dia. Revisalas antes de importar.");
    attendanceIds.set(key, item.id);
  }
  const entries = new Map();
  rows.forEach((row) => {
    if (!row.student?.id || row.student.id.includes("/") || !["presente", "falta", "atraso", "licencia", "permiso"].includes(row.estado)) throw new Error("La asistencia contiene un alumno o estado invalido.");
    const id = attendanceIds.get(JSON.stringify([row.fecha, row.student.id])) || attendanceDocId(course.id, row.fecha, row.student.id);
    const data = {
        cursoId: course.id,
        alumnoId: row.student.id,
        fecha: row.fecha,
        trimestreId,
        estado: row.estado,
        origen: "carga_historica",
        registradoPorUid: uid,
        registradoPor: clients.auth.currentUser?.email || "admin",
        updatedAt: serverTimestamp()
    };
    const matches = (saved) => saved.cursoId === course.id && saved.alumnoId === row.student.id && saved.fecha === row.fecha && saved.trimestreId === trimestreId && normalizarEstadoAsistencia(saved.estado) === normalizarEstadoAsistencia(row.estado);
    if (entries.has(id) && !matches(entries.get(id).data)) throw new Error("La carga contiene asistencias distintas para el mismo alumno y dia.");
    entries.set(id, { id, collection: "asistencias", data, matches, label: `asistencia del ${row.fecha}` });
  });
  const result = await guardarImportacionHistorica({ groups: [...entries.values()].map((item) => [item]), existing, db: clients.firestore, reference: (item) => documentoGestion(clients.firestore, item.collection, item.id, year), current, transact: clients.transact, onProgress });
  return { total: entries.size, created: result.created, preserved: result.preserved };
}

export async function importHistoricalGrades({ course, materiaId, rows, activities, trimestreId, onProgress, isCurrent = () => true }, clients = { auth, firestore, read: getDocs, transact: runTransaction }) {
  if (!course?.id) throw new Error("Selecciona un curso valido.");
  if (!COURSES.some((item) => item.id === course.id && item.nivel === "primaria")) throw new Error("La carga de notas numericas solo corresponde a Primaria.");
  if (!materiaId) throw new Error("Selecciona una materia.");
  if (!["t1", "t2", "t3"].includes(trimestreId)) throw new Error("Selecciona un trimestre valido.");
  if (!Array.isArray(activities) || !activities.length) throw new Error("No hay actividades para guardar.");
  if (!Array.isArray(rows) || !rows.length) throw new Error("No hay notas para guardar.");
  const year = gestionActual(), uid = clients.auth.currentUser?.uid;
  activities.forEach((activity) => validarFechaGestion(activity.fecha, year, { opcional: true }));
  if (!uid) throw new Error("Ingresa como administrador para importar.");
  const current = () => clients.auth.currentUser?.uid === uid && gestionActual() === year && isCurrent();
  const subject = SUBJECTS.find((item) => item.id === materiaId);
  if (!subject) throw new Error("Selecciona una materia valida.");
  const [existingSnapshot, gradesSnapshot] = await Promise.all(["actividades", "calificaciones"].map((name) => clients.read(query(coleccionGestion(clients.firestore, name, year), where("cursoId", "==", course.id), where("trimestreId", "==", trimestreId)))));
  const existing = new Map([...existingSnapshot.docs.map((item) => [`actividades/${item.id}`, item.data()]), ...gradesSnapshot.docs.map((item) => [`calificaciones/${item.id}`, item.data()])]);
  const existingIds = new Map();
  const requestedActivities = new Set(activities.map((activity) => claveActividad({ ...activity, cursoId: course.id, materiaId, trimestreId })));
  for (const item of existingSnapshot.docs) {
    const key = claveActividad(item.data());
    if (!requestedActivities.has(key)) continue;
    if (existingIds.has(key)) throw new Error("Hay actividades duplicadas en el sistema. Revisa sus registros antes de importar.");
    existingIds.set(key, item.id);
  }
  const activityMap = new Map(), activityKeys = new Set();
  for (const activity of activities) {
    if (!activity.key || activityMap.has(activity.key) || !String(activity.titulo || "").trim() || !Number.isFinite(Number(activity.maximo)) || Number(activity.maximo) <= 0 || Number(activity.maximo) > 100) throw new Error("La carga contiene una actividad duplicada, sin titulo o con puntaje invalido.");
    const key = claveActividad({ ...activity, cursoId: course.id, materiaId, trimestreId });
    if (activityKeys.has(key)) throw new Error("La carga repite la misma actividad. Revisa sus columnas antes de importar.");
    activityKeys.add(key);
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)))].map((value) => value.toString(16).padStart(2, "0")).join("");
    const id = existingIds.get(key) || `historica_${hash}`;
    existingIds.set(key, id);
    activityMap.set(activity.key, {
      id,
      cursoId: course.id,
      materiaId,
      trimestreId,
      fecha: activity.fecha || "",
      titulo: String(activity.titulo || "").trim(),
      tipo: activity.tipo || "tarea",
      maximo: Number(activity.maximo || 100),
      creadoPorUid: uid,
      creadoPor: clients.auth.currentUser?.email || "admin",
      origen: "carga_historica",
      estadoRevision: "cerrada",
      activo: true,
      updatedAt: serverTimestamp()
    });
  }
  const requestedIds = new Set([...activityMap.values()].map((activity) => activity.id));
  const requestedStudents = new Set(rows.map((row) => row.student?.id));
  const gradeIds = new Map();
  for (const item of gradesSnapshot.docs) {
    const data = item.data();
    if (!requestedIds.has(data.actividadId) || !requestedStudents.has(data.alumnoId)) continue;
    const key = JSON.stringify([data.actividadId, data.alumnoId]);
    if (gradeIds.has(key)) throw new Error("Hay notas duplicadas para un alumno y actividad. Revisalas antes de importar.");
    gradeIds.set(key, item.id);
  }
  const groups = new Map(), gradeKeys = new Set();
  rows.forEach((row) => {
    const activity = activityMap.get(row.activityKey);
    const normalized = normalizeGrade(row.valor, activity?.maximo);
    if (!activity || !row.student?.id || row.student.id.includes("/") || String(row.valor ?? "").trim() === "" || !normalized || Number(row.valor) < 0 || Number(row.valor) > activity.maximo) throw new Error("La carga contiene un alumno, actividad o nota invalida. No se guardo ningun dato.");
    const pair = JSON.stringify([activity.id, row.student.id]);
    if (gradeKeys.has(pair)) throw new Error("La carga repite una nota del mismo alumno y actividad.");
    gradeKeys.add(pair);
    activity.tieneCalificaciones = true;
    if (!groups.has(activity.id)) groups.set(activity.id, [{ id: activity.id, collection: "actividades", data: activity, label: `actividad ${activity.titulo}`, matches: (saved) => claveActividad(saved) === claveActividad(activity) && Number(saved.maximo) === activity.maximo && saved.activo !== false }]);
    const data = {
        actividadId: activity.id,
        cursoId: course.id,
        materiaId,
        trimestreId,
        alumnoId: row.student.id,
        valor: normalized.valor,
        porcentaje: normalized.porcentaje,
        nota: normalized.nota,
        maximo: activity.maximo,
        fecha: activity.fecha || "",
        tipo: activity.tipo,
        origen: "carga_historica",
        calificadoPorUid: uid,
        calificadoPor: clients.auth.currentUser?.email || "admin",
        updatedAt: serverTimestamp()
    };
    groups.get(activity.id).push({ id: gradeIds.get(pair) || gradeDocId(activity.id, row.student.id), collection: "calificaciones", data, label: `nota de ${activity.titulo}`, matches: (saved) => saved.actividadId === activity.id && saved.alumnoId === row.student.id && saved.cursoId === course.id && saved.materiaId === materiaId && saved.trimestreId === trimestreId && Number(saved.valor) === data.valor && Number(saved.nota) === data.nota && Number(saved.maximo) === data.maximo });
  });
  const result = await guardarImportacionHistorica({ groups: [...groups.values()], existing, db: clients.firestore, reference: (item) => documentoGestion(clients.firestore, item.collection, item.id, year), current, transact: clients.transact, onProgress });
  return { activities: groups.size, grades: rows.length, subject: subject.nombre, created: result.created, preserved: result.preserved };
}

export async function saveTeacherAssignments(teacherUid, assignments) {
  if (!teacherUid) throw new Error("Falta el docente para guardar asignaciones.");
  await setDoc(documentoGestion(firestore, "asignaciones", teacherUid), {
    cursos: assignments || {},
    updatedAt: serverTimestamp()
  }, { merge: true });
}
export async function getAdminCounts() {
  const [students, teachers, directors, schedules] = await Promise.all([
    getCountFromServer(query(coleccionGestion(firestore, "matriculas"), where("estado", "==", "activo"))),
    getCountFromServer(query(collection(firestore, "usuarios"), where("rol", "==", "docente"), where("activo", "==", true))),
    getCountFromServer(query(collection(firestore, "usuarios"), where("rol", "==", "director"), where("activo", "==", true))),
    getAllSchedules()
  ]);

  return {
    students: students.data().count,
    teachers: teachers.data().count,
    directors: directors.data().count,
    schedules: SCHEDULE_COURSES.filter((course) => schedules[course.id]).length
  };
}


