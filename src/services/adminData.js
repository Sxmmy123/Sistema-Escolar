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
import { COURSES, SUBJECTS, periodsForCourse } from "../data/catalog.js";
import { claveActividad } from "./identificadoresActividad.js";
import { coleccionGestion, documentoGestion, gestionActual } from "./rutasFirestore.js";
import { listarAlumnosMatriculados } from "./matriculas.js";
import { parseStudentsBulk } from "./parsearAlumnos.js";
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
  const students = parseStudentsBulk(rawText, course.id);
  if (!students.length) throw new Error("No hay alumnos para importar.");
  if (students.length > 200) throw new Error("Importa hasta 200 alumnos por carga.");
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
      nombre: student.nombre, ci: student.ci, activo: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
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
  const snap = await getDoc(documentoGestion(firestore, "horarios", courseId));
  if (!snap.exists()) return localShape;

  const data = snap.data() || {};
  return {
    ...localShape,
    clases: data.clases || {}
  };
}

export async function saveScheduleCell(courseId, periodId, dayId, subjectId) {
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
  const schedules = {};
  snap.docs.forEach((item) => {
    const data = item.data() || {};
    schedules[item.id] = {
      cursoId: item.id,
      periodos: periodsForCourse(item.id),
      clases: data.clases || {}
    };
  });
  return schedules;
}

export async function saveFullSchedule(courseId, schedule) {
  await setDoc(documentoGestion(firestore, "horarios", courseId), {
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

  await Promise.all(entries.map(([courseId, schedule]) => saveFullSchedule(courseId, schedule)));
  return entries.length;
}

export async function importHistoricalAttendance({ course, rows, trimestreId }) {
  if (!course?.id) throw new Error("Selecciona un curso valido.");
  if (!Array.isArray(rows) || !rows.length) throw new Error("No hay asistencias para guardar.");
  if (!["t1", "t2", "t3"].includes(trimestreId)) throw new Error("Selecciona un trimestre valido.");

  const chunks = [];
  for (let index = 0; index < rows.length; index += 450) {
    chunks.push(rows.slice(index, index + 450));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(firestore);
    chunk.forEach((row) => {
      const id = attendanceDocId(course.id, row.fecha, row.student.id);
      batch.set(documentoGestion(firestore, "asistencias", id), {
        cursoId: course.id,
        alumnoId: row.student.id,
        fecha: row.fecha,
        trimestreId,
        estado: row.estado,
        observacion: "",
        origen: "carga_historica",
        registradoPorUid: auth.currentUser?.uid || "",
        registradoPor: auth.currentUser?.email || "admin",
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
  }

  return rows.length;
}

export async function importHistoricalGrades({ course, materiaId, rows, activities, trimestreId }) {
  if (!course?.id) throw new Error("Selecciona un curso valido.");
  if (!materiaId) throw new Error("Selecciona una materia.");
  if (!["t1", "t2", "t3"].includes(trimestreId)) throw new Error("Selecciona un trimestre valido.");
  if (!Array.isArray(activities) || !activities.length) throw new Error("No hay actividades para guardar.");
  if (!Array.isArray(rows) || !rows.length) throw new Error("No hay notas para guardar.");

  const subject = SUBJECTS.find((item) => item.id === materiaId);
  const existingSnapshot = await getDocs(query(coleccionGestion(firestore, "actividades"), where("cursoId", "==", course.id), where("trimestreId", "==", trimestreId)));
  const existingIds = new Map(existingSnapshot.docs.map((item) => [claveActividad(item.data()), item.id]));
  const activityMap = new Map();
  activities.forEach((activity) => {
    const key = claveActividad({ ...activity, cursoId: course.id, materiaId, trimestreId });
    const id = existingIds.get(key) || doc(coleccionGestion(firestore, "actividades")).id;
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
      creadoPorUid: auth.currentUser?.uid || "",
      creadoPor: auth.currentUser?.email || "admin",
      origen: "carga_historica",
      estadoRevision: "cerrada",
      activo: true,
      updatedAt: serverTimestamp()
    });
  });

  const writes = [];
  activityMap.forEach((activity) => {
    writes.push({ ref: documentoGestion(firestore, "actividades", activity.id), data: activity });
  });

  rows.forEach((row) => {
    const activity = activityMap.get(row.activityKey);
    const normalized = normalizeGrade(row.valor, activity?.maximo);
    if (!activity || !normalized) return;
    activity.tieneCalificaciones = true;
    writes.push({
      ref: documentoGestion(firestore, "calificaciones", gradeDocId(activity.id, row.student.id)),
      data: {
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
        calificadoPorUid: auth.currentUser?.uid || "",
        calificadoPor: auth.currentUser?.email || "admin",
        updatedAt: serverTimestamp()
      }
    });
  });

  const chunks = [];
  for (let index = 0; index < writes.length; index += 450) {
    chunks.push(writes.slice(index, index + 450));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(firestore);
    chunk.forEach((item) => batch.set(item.ref, item.data, { merge: true }));
    await batch.commit();
  }

  return { activities: activityMap.size, grades: rows.length, subject: subject?.nombre || materiaId };
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
    getCountFromServer(coleccionGestion(firestore, "horarios"))
  ]);

  return {
    students: students.data().count,
    teachers: teachers.data().count,
    directors: directors.data().count,
    schedules: schedules.data().count
  };
}


