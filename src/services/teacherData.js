import {
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where
} from "firebase/firestore";
import { COURSES, DAYS, SUBJECTS, findCourse, findSubject, periodsForCourse } from "../data/catalog.js";
import { auth, firestore } from "../firebase/client.js";
import { getSchedule, listStudents } from "./adminData.js";
import { safeAudit } from "./auditData.js";
import { fechaEscolarIso } from "./fechaEscolar.js";
import { idAutoevaluacion } from "./identificadoresActividad.js";
import { claveCache, coleccionGestion, documentoGestion, gestionActual } from "./rutasFirestore.js";
import { actualizarActividadProtegida, eliminarActividadProtegida } from "./proteccionActividad.js";
import { normalizarEstadoAsistencia } from "./calculoAcademico.js";

function currentUid() {
  return auth.currentUser?.uid || "";
}

function announceAlertDataChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("teacher-alerts-updated"));
}

function currentUserLabel() {
  return sessionStorage.getItem("sesionUsuario") || auth.currentUser?.email || "docente";
}

function normalizeMaterialItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      cantidad: Math.max(1, Math.min(999, Math.round(Number(item?.cantidad) || 1))),
      material: String(item?.material || "").trim().slice(0, 120)
    }))
    .filter((item) => item.material);
}

function scheduleCacheKey(context = {}) {
  const uid = context.uid || currentUid() || "docente";
  const courseIds = (context.courses || []).map((course) => course.id).sort().join("_") || "sin_cursos";
  return claveCache("horario", uid, courseIds);
}

function readScheduleCache(context = {}) {
  try {
    const raw = localStorage.getItem(scheduleCacheKey(context));
    if (!raw) return null;
    const cache = JSON.parse(raw);
    const schedules = cache?.schedules || {};
    const complete = (context.courses || []).every((course) => schedules[course.id]);
    return complete ? cache : null;
  } catch {
    return null;
  }
}

function writeScheduleCache(context = {}, schedules = {}) {
  try {
    localStorage.setItem(scheduleCacheKey(context), JSON.stringify({
      updatedAt: Date.now(),
      schedules
    }));
  } catch {
    // Si el navegador no permite localStorage, el sistema sigue funcionando online.
  }
}

function teacherDataCacheKey(context = {}, type = "datos", courseId = "", trimesterId = "") {
  const uid = context.uid || currentUid() || "docente";
  return claveCache(type, uid, courseId || "sin_curso", trimesterId || "sin_trimestre");
}

function readTeacherDataCache(context = {}, type = "datos", courseId = "", trimesterId = "") {
  try {
    const raw = localStorage.getItem(teacherDataCacheKey(context, type, courseId, trimesterId));
    if (!raw) return null;
    const cache = JSON.parse(raw);
    return cache?.data ? cache : null;
  } catch {
    return null;
  }
}

function writeTeacherDataCache(context = {}, type = "datos", courseId = "", trimesterId = "", data = {}) {
  try {
    localStorage.setItem(teacherDataCacheKey(context, type, courseId, trimesterId), JSON.stringify({
      updatedAt: Date.now(),
      data
    }));
  } catch {
    // Si el navegador no permite localStorage, el sistema sigue funcionando online.
  }
}

function teacherContextCacheKey(uid = currentUid()) {
  return claveCache("contexto", uid || "docente");
}

function readTeacherContextCache(uid = currentUid()) {
  try {
    const raw = sessionStorage.getItem(teacherContextCacheKey(uid));
    if (!raw) return null;
    const context = JSON.parse(raw);
    if (!context?.uid || !Array.isArray(context.courses) || !Array.isArray(context.subjectIds)) return null;
    return context;
  } catch {
    return null;
  }
}

function writeTeacherContextCache(context = {}) {
  try {
    if (!context.uid) return;
    sessionStorage.setItem(teacherContextCacheKey(context.uid), JSON.stringify({
      ...context,
      cachedAt: Date.now()
    }));
  } catch {
    // Si el navegador no permite sessionStorage, solo se vuelve a consultar el perfil.
  }
}

function updateTeacherContextTrimesterCache(uid = currentUid(), trimesterId = "t1") {
  const context = readTeacherContextCache(uid);
  if (!context) return;
  writeTeacherContextCache({
    ...context,
    profile: {
      ...(context.profile || {}),
      trimestreActivo: trimesterId
    }
  });
}

export function getTeacherDataCacheMeta(context = {}, type = "datos", courseId = "", trimesterId = "") {
  const cache = readTeacherDataCache(context, type, courseId, trimesterId);
  if (!cache) return null;
  return {
    updatedAt: cache.updatedAt || 0,
    label: cache.updatedAt ? new Date(cache.updatedAt).toLocaleString("es-BO") : "Guardado local"
  };
}

function normalizeSubjectList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value && typeof value === "object") return Object.keys(value).filter((key) => value[key]);
  return [];
}

function normalizeCourses(data = {}) {
  const source = data.cursos || data.asignaciones || {};

  if (Array.isArray(source)) {
    return source
      .map((item) => ({
        cursoId: item.cursoId || item.courseId || item.id,
        materias: normalizeSubjectList(item.materias || item.subjects)
      }))
      .filter((item) => item.cursoId);
  }

  return Object.entries(source)
    .map(([cursoId, item]) => ({
      cursoId,
      materias: normalizeSubjectList(item?.materias || item?.subjects || item)
    }))
    .filter((item) => item.cursoId);
}

function localIsoDate(date = new Date()) {
  return fechaEscolarIso(date);
}

export function todayIso(offset = 0) {
  return fechaEscolarIso(new Date(), offset);
}

export const TRIMESTERS = [
  { id: "t1", label: "1er trimestre" },
  { id: "t2", label: "2do trimestre" },
  { id: "t3", label: "3er trimestre" }
];

export const DELIVERY_STATES = {
  ON_TIME: "a_tiempo",
  LATE: "tardia",
  NOT_SUBMITTED: "no_presento",
  LICENSE_PENDING: "pendiente_licencia",
  UNREVIEWED: "sin_revisar"
};

export async function saveTeacherTrimesterPreference(uid = currentUid(), trimesterId = "t1") {
  const safeUid = auth.currentUser?.uid || uid || currentUid();
  if (!safeUid || !["t1", "t2", "t3"].includes(trimesterId)) throw new Error("Selecciona un trimestre valido.");

  await updateDoc(doc(firestore, "usuarios", safeUid), {
    [`preferencias.trimestresPorGestion.${gestionActual()}`]: trimesterId,
    updatedAt: serverTimestamp()
  });
  updateTeacherContextTrimesterCache(safeUid, trimesterId);
}

export async function getTeacherContext(uid = currentUid(), options = {}) {
  if (!uid) return { uid: "", profile: null, courses: [], subjectIds: [] };

  const cachedContext = options.forceRemote ? null : readTeacherContextCache(uid);
  if (cachedContext) return cachedContext;

  const [userSnap, assignmentSnap] = await Promise.all([
    getDoc(doc(firestore, "usuarios", uid)),
    getDoc(documentoGestion(firestore, "asignaciones", uid))
  ]);
  const userProfile = userSnap.exists() ? userSnap.data() : null;
  const profile = {
    ...(userProfile || {}),
    trimestreActivo: userProfile?.preferencias?.trimestresPorGestion?.[gestionActual()] || "t1"
  };
  const assignment = assignmentSnap.exists() ? assignmentSnap.data() : {};
  const assignedCourses = normalizeCourses(assignment)
    .map((item) => {
      const course = findCourse(item.cursoId);
      const materias = item.materias.filter((subjectId) => Boolean(findSubject(subjectId)));
      return { ...course, materias };
    })
    .filter((course, index, list) => list.findIndex((item) => item.id === course.id) === index)
    .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));

  const context = {
    uid,
    gestionId: gestionActual(),
    profile,
    courses: assignedCourses,
    subjectIds: [...new Set(assignedCourses.flatMap((course) => course.materias))]
  };
  writeTeacherContextCache(context);
  return context;
}

export async function getTeacherStudents(courseId) {
  if (!courseId) return [];
  const students = await listStudents(courseId);
  return students
    .filter((student) => student.activo !== false)
    .sort((a, b) => {
      const nameOrder = String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" });
      return nameOrder || Number(a.numeroLista || 9999) - Number(b.numeroLista || 9999);
    });
}

function rowsFromSchedules(context, schedules = {}, dayId = null) {
  const rows = [];
  const dayIds = dayId ? [dayId] : DAYS.map((day) => day.id);

  context.courses.forEach((course) => {
    const schedule = schedules[course.id] || {
      cursoId: course.id,
      periodos: periodsForCourse(course.id),
      clases: {}
    };
    schedule.periodos.forEach((period) => {
      if (period.recreo) return;
      dayIds.forEach((currentDayId) => {
        const subjectId = schedule.clases?.[period.id]?.[currentDayId];
        if (!subjectId || !course.materias.includes(subjectId)) return;
        rows.push({
          cursoId: course.id,
          curso: course.nombre,
          diaId: currentDayId,
          dia: DAYS.find((day) => day.id === currentDayId)?.label || currentDayId,
          periodo: period.label,
          hora: period.hora,
          materiaId: subjectId,
          materia: findSubject(subjectId)?.nombre || subjectId,
          color: findSubject(subjectId)?.color || "#e2e8f0"
        });
      });
    });
  });

  return rows.sort((a, b) => `${a.diaId}-${a.periodo}`.localeCompare(`${b.diaId}-${b.periodo}`));
}

async function loadTeacherSchedulesRemote(context) {
  const entries = await Promise.all((context.courses || []).map(async (course) => [course.id, await getSchedule(course.id)]));
  return Object.fromEntries(entries);
}

export function getTeacherScheduleCacheMeta(context) {
  const cache = readScheduleCache(context);
  if (!cache) return null;
  return {
    updatedAt: cache.updatedAt || 0,
    label: cache.updatedAt ? new Date(cache.updatedAt).toLocaleString("es-BO") : "Guardado local"
  };
}

export async function refreshTeacherScheduleCache(context) {
  const schedules = await loadTeacherSchedulesRemote(context);
  writeScheduleCache(context, schedules);
  return getTeacherScheduleCacheMeta(context);
}

export async function getTeacherScheduleRows(context, dayId = null, options = {}) {
  const cache = readScheduleCache(context);
  if (cache) return rowsFromSchedules(context, cache.schedules, dayId);
  if (options.forceRemote) {
    const schedules = await loadTeacherSchedulesRemote(context);
    writeScheduleCache(context, schedules);
    return rowsFromSchedules(context, schedules, dayId);
  }
  return [];
}

export async function refreshTeacherNotesSnapshot(context, course, trimesterId = "t1", options = {}) {
  if (!course?.id) return null;
  const [students, activities, gradesList, attendanceRows] = await Promise.all([
    Array.isArray(options.students) ? options.students : getTeacherStudents(course.id),
    listActivities(course.id, trimesterId),
    listGradesForCourse(course.id, trimesterId),
    listAttendanceForCourse(course.id, trimesterId)
  ]);
  const data = { students, activities, gradesList, attendanceRows };
  writeTeacherDataCache(context, "notas", course.id, trimesterId, data);
  return data;
}

export async function refreshTeacherBulletinSnapshot(context, course, loaders = {}) {
  if (!course?.id) return [];
  const loadStudents = loaders.loadStudents || getTeacherStudents;
  const refreshSnapshot = loaders.refreshSnapshot || refreshTeacherNotesSnapshot;
  const students = await loadStudents(course.id);
  return Promise.all(TRIMESTERS.map((trimester) =>
    refreshSnapshot(context, course, trimester.id, { students })
  ));
}

export async function getTeacherNotesSnapshot(context, course, trimesterId = "t1", options = {}) {
  if (!course?.id) return null;
  const cache = readTeacherDataCache(context, "notas", course.id, trimesterId);
  if (cache && !options.forceRemote) return cache.data;
  if (options.forceRemote) return refreshTeacherNotesSnapshot(context, course, trimesterId);
  return null;
}
function updateTeacherNotesSnapshotCache(context, activity, updater) {
  if (!activity?.cursoId) return;
  const trimesterId = activity.trimestreId || "t1";
  const cache = readTeacherDataCache(context, "notas", activity.cursoId, trimesterId);
  if (!cache?.data) return;
  const nextData = updater(cache.data) || cache.data;
  writeTeacherDataCache(context, "notas", activity.cursoId, trimesterId, nextData);
}

export function upsertTeacherNotesSnapshotActivity(context, activity) {
  updateTeacherNotesSnapshotCache(context, activity, (data) => {
    const activities = Array.isArray(data.activities) ? [...data.activities] : [];
    const activityIndex = activities.findIndex((item) => item.id === activity.id);
    const normalizedActivity = { ...activity, trimestreId: activity.trimestreId || "t1" };
    if (activityIndex >= 0) activities[activityIndex] = { ...activities[activityIndex], ...normalizedActivity };
    else activities.push(normalizedActivity);
    return { ...data, activities };
  });
}

export function removeTeacherNotesSnapshotActivity(context, activity) {
  updateTeacherNotesSnapshotCache(context, activity, (data) => ({
    ...data,
    activities: (Array.isArray(data.activities) ? data.activities : []).filter((item) => item.id !== activity.id),
    gradesList: (Array.isArray(data.gradesList) ? data.gradesList : []).filter((item) => item.actividadId !== activity.id)
  }));
}

export function upsertTeacherNotesSnapshotGrade(context, activity, grade) {
  if (!activity?.cursoId) return;
  if (!grade?.id) {
    upsertTeacherNotesSnapshotActivity(context, activity);
    return;
  }
  const trimesterId = activity.trimestreId || grade.trimestreId || "t1";
  const cache = readTeacherDataCache(context, "notas", activity.cursoId, trimesterId);
  if (!cache?.data) return;

  const activities = Array.isArray(cache.data.activities) ? [...cache.data.activities] : [];
  const gradesList = Array.isArray(cache.data.gradesList) ? [...cache.data.gradesList] : [];
  const activityIndex = activities.findIndex((item) => item.id === activity.id);
  const normalizedActivity = { ...activity, trimestreId: trimesterId };
  if (activityIndex >= 0) activities[activityIndex] = { ...activities[activityIndex], ...normalizedActivity };
  else activities.push(normalizedActivity);

  const gradeIndex = gradesList.findIndex((item) => item.id === grade.id);
  if (gradeIndex >= 0) gradesList[gradeIndex] = { ...gradesList[gradeIndex], ...grade };
  else gradesList.push(grade);

  writeTeacherDataCache(context, "notas", activity.cursoId, trimesterId, {
    ...cache.data,
    activities,
    gradesList
  });
}

export async function refreshTeacherSummarySnapshot(context, course, trimesterId = "t1") {
  if (!course?.id) return null;
  const [students, records] = await Promise.all([
    getTeacherStudents(course.id),
    listAttendanceForCourse(course.id, trimesterId)
  ]);
  const data = { students, records };
  writeTeacherDataCache(context, "resumen_asistencia", course.id, trimesterId, data);
  return data;
}

export async function getTeacherSummarySnapshot(context, course, trimesterId = "t1", options = {}) {
  if (!course?.id) return null;
  const cache = readTeacherDataCache(context, "resumen_asistencia", course.id, trimesterId);
  if (cache && !options.forceRemote) return cache.data;
  if (options.forceRemote) return refreshTeacherSummarySnapshot(context, course, trimesterId);
  return null;
}

export function todayDayId(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const map = [null, "lunes", "martes", "miercoles", "jueves", "viernes", null];
  return map[date.getDay()] || "lunes";
}

export function nextSchoolDayInfo() {
  const base = new Date();
  const date = new Date(base);
  const map = [null, "lunes", "martes", "miercoles", "jueves", "viernes", null];
  do {
    date.setDate(date.getDate() + 1);
  } while (date.getDay() === 0 || date.getDay() === 6);

  const dayId = map[date.getDay()] || "lunes";
  const daysAhead = Math.round((date - base) / 86400000);
  const label = daysAhead === 1
    ? "Mañana"
    : DAYS.find((day) => day.id === dayId)?.label || "Lunes";

  return {
    dayId,
    label,
    iso: localIsoDate(date)
  };
}

export function subjectNames(subjectIds = []) {
  return subjectIds.map((subjectId) => findSubject(subjectId)?.nombre || subjectId);
}

export function attendanceDocId(courseId, date, studentId) {
  return `${date}_${courseId}_${studentId}`.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

export async function listAttendanceForCourseDate(courseId, date, trimestreId = "") {
  const filters = [
    where("cursoId", "==", courseId),
    where("fecha", "==", date)
  ];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = await getDocs(query(coleccionGestion(firestore, "asistencias"), ...filters));
  const map = {};
  snap.docs.forEach((item) => {
    const record = item.data();
    map[record.alumnoId] = { id: item.id, ...record, estado: normalizarEstadoAsistencia(record.estado) };
  });
  return map;
}

export async function listAttendanceForCourse(courseId, trimestreId = "") {
  const filters = [where("cursoId", "==", courseId)];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = await getDocs(query(coleccionGestion(firestore, "asistencias"), ...filters));
  return snap.docs.map((item) => {
    const record = item.data();
    return { id: item.id, ...record, estado: normalizarEstadoAsistencia(record.estado) };
  });
}

export async function saveAttendance({ course, student, fecha, estado, trimestreId = "t1", observacion = "" }) {
  if (student.cursoId && student.cursoId !== course.id) throw new Error("El alumno no pertenece al curso seleccionado.");
  const id = attendanceDocId(course.id, fecha, student.id);
  const now = new Date();
  const payload = {
    cursoId: course.id,
    alumnoId: student.id,
    fecha,
    trimestreId,
    estado,
    observacion: String(observacion || "").trim(),
    horaRegistro: now.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" }),
    horaRegistroISO: now.toISOString(),
    registradoPorUid: currentUid(),
    registradoPor: currentUserLabel(),
    updatedAt: serverTimestamp()
  };
  await setDoc(documentoGestion(firestore, "asistencias", id), payload, { merge: true });
  announceAlertDataChange();
  safeAudit({
    tipo: "asistencia",
    accion: "registrar",
    detalle: `${student.nombre} marcado como ${estado} en ${course.nombre}`,
    datos: { cursoId: course.id, alumnoId: student.id, fecha, trimestreId, estado, observacion: payload.observacion }
  });
  return { id, ...payload };
}

export async function listActivities(courseId, trimestreId = "") {
  const filters = [where("cursoId", "==", courseId)];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = await getDocs(query(coleccionGestion(firestore, "actividades"), ...filters));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(a.titulo || "").localeCompare(String(b.titulo || "")));
}

export async function saveActivity({ course, materiaId, fecha, titulo, tipo, maximo, calificable = false, materiales = [], trimestreId = "t1" }) {
  const subject = findSubject(materiaId);
  const isMaterial = ["material", "materiales"].includes(String(tipo || "").toLowerCase());
  const scoreEnabled = isMaterial && Boolean(calificable);
  const materialItems = isMaterial ? normalizeMaterialItems(materiales) : [];
  if (isMaterial && !materialItems.length) throw new Error("Agregue al menos un material.");
  const cleanTitle = isMaterial
    ? materialItems.map((item) => item.material).join(", ")
    : String(titulo || "").trim();
  const ref = doc(coleccionGestion(firestore, "actividades"));
  const id = ref.id;
  const payload = {
    cursoId: course.id,
    materiaId,
    trimestreId,
    fecha,
    titulo: cleanTitle,
    tipo: tipo || "tarea",
    maximo: isMaterial && !scoreEnabled ? 0 : Number(maximo || 100),
    ...(isMaterial ? { calificable: scoreEnabled, materiales: materialItems } : {}),
    creadoPorUid: currentUid(),
    createdAt: serverTimestamp(),
    estadoRevision: "sin_iniciar",
    activo: true,
    updatedAt: serverTimestamp()
  };
  await setDoc(ref, payload);
  await safeAudit({
    tipo: "actividades",
    accion: "crear",
    detalle: `Creo ${payload.tipo} ${payload.titulo} en ${course.nombre} - ${subject?.nombre || materiaId}`,
    datos: {
      actividadId: id,
      cursoId: course.id,
      materiaId,
      trimestreId,
      fecha,
      maximo: payload.maximo,
      ...(isMaterial ? { calificable: scoreEnabled, cantidadMateriales: materialItems.length } : {})
    }
  });
  return { id, ...payload };
}

export async function saveInternalActivity({ course, materiaId, titulo, tipo, maximo, trimestreId = "t1" }) {
  const isAuto = tipo === "auto";
  const ref = isAuto
    ? documentoGestion(firestore, "actividades", idAutoevaluacion(course.id, materiaId, trimestreId))
    : doc(coleccionGestion(firestore, "actividades"));
  const id = ref.id;
  const subject = findSubject(materiaId);
  const payload = {
    cursoId: course.id,
    materiaId,
    trimestreId,
    fecha: "",
    titulo: String(titulo || "").trim(),
    tipo,
    maximo: Number(maximo || 100),
    interno: true,
    activo: true,
    creadoPorUid: currentUid(),
    createdAt: serverTimestamp(),
    estadoRevision: "cerrada",
    updatedAt: serverTimestamp()
  };
  if (isAuto) {
    const existing = await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists()) return { id, ...snapshot.data() };
      transaction.set(ref, payload);
      return null;
    });
    if (existing) return existing;
  } else {
    await setDoc(ref, payload);
  }
  await safeAudit({
    tipo: "actividades",
    accion: "crear",
    detalle: `Creo criterio ${payload.titulo} en ${course.nombre} - ${subject?.nombre || materiaId}`,
    datos: { actividadId: id, cursoId: course.id, materiaId, trimestreId, maximo: payload.maximo, tipo }
  });
  return { id, ...payload };
}

export async function updateActivity({ activity, course, materiaId, fecha, titulo, tipo, maximo, calificable = false, materiales = [], trimestreId = "t1" }) {
  if (!activity?.id) throw new Error("Actividad invalida.");
  const subject = findSubject(materiaId);
  const isMaterial = ["material", "materiales"].includes(String(tipo || "").toLowerCase());
  const scoreEnabled = isMaterial && Boolean(calificable);
  const materialItems = isMaterial ? normalizeMaterialItems(materiales) : [];
  if (isMaterial && !materialItems.length) throw new Error("Agregue al menos un material.");
  const cleanTitle = isMaterial
    ? materialItems.map((item) => item.material).join(", ")
    : String(titulo || "").trim();
  const payload = {
    cursoId: course.id,
    materiaId,
    trimestreId,
    fecha,
    titulo: cleanTitle,
    tipo: tipo || "tarea",
    maximo: isMaterial && !scoreEnabled ? 0 : Number(maximo || 100),
    calificable: isMaterial ? scoreEnabled : deleteField(),
    materiales: isMaterial ? materialItems : deleteField(),
    updatedAt: serverTimestamp()
  };
  const siguiente = {
    cursoId: course.id, materiaId, trimestreId, fecha,
    titulo: cleanTitle, tipo: tipo || "tarea", maximo: payload.maximo,
    calificable: scoreEnabled, materiales: materialItems
  };
  const updatedActivity = await actualizarActividadProtegida({ db: firestore, id: activity.id, datos: payload, siguiente });
  await safeAudit({
    tipo: "actividades",
    accion: "editar",
    detalle: `Edito ${payload.tipo} ${payload.titulo} en ${course.nombre} - ${subject?.nombre || materiaId}`,
    datos: {
      actividadId: activity.id,
      cursoId: course.id,
      materiaId,
      trimestreId,
      fecha,
      maximo: payload.maximo,
      ...(isMaterial ? { calificable: scoreEnabled, cantidadMateriales: materialItems.length } : {})
    }
  });
  if (!isMaterial) {
    delete updatedActivity.calificable;
    delete updatedActivity.materiales;
  }
  return updatedActivity;
}

export async function deleteActivity(activity) {
  if (!activity?.id) throw new Error("Actividad invalida.");
  await eliminarActividadProtegida({ db: firestore, id: activity.id });
  await safeAudit({
    tipo: "actividades",
    accion: "eliminar",
    detalle: `Elimino actividad ${activity.titulo || activity.id}`,
    datos: { actividadId: activity.id, cursoId: activity.cursoId, materiaId: activity.materiaId }
  });
}

export function gradeDocId(activityId, studentId) {
  return `${activityId}_${studentId}`.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

export function normalizeGrade(value, maximo = 100) {
  const raw = Number(value);
  const max = Math.max(Number(maximo) || 100, 1);
  if (Number.isNaN(raw)) return null;
  const percent = Math.max(0, Math.min(100, Math.round((raw / max) * 100)));
  const nota = percent <= 0 ? 35 : Math.max(35, percent);
  return { valor: raw, porcentaje: percent, nota };
}

function normalizeDeliveryState(value = "") {
  const state = String(value || "").trim().toLowerCase();
  return Object.values(DELIVERY_STATES).includes(state) ? state : "";
}

function isInternalGradeActivity(activity = {}) {
  return activity.interno === true || ["ser", "auto"].includes(String(activity.tipo || "").toLowerCase());
}

function deliveryPayload({ activity, normalized, estadoEntrega = "", fechaEntrega = "" }) {
  if (isInternalGradeActivity(activity)) return {};

  let state = normalizeDeliveryState(estadoEntrega);
  if (Number(normalized.valor || 0) <= 0) state = DELIVERY_STATES.NOT_SUBMITTED;
  if (!state) return {};

  const submitted = [DELIVERY_STATES.ON_TIME, DELIVERY_STATES.LATE].includes(state);
  const safeDate = submitted
    ? String(fechaEntrega || activity.fecha || todayIso()).slice(0, 10)
    : "";
  return {
    estadoEntrega: state,
    fechaEntrega: safeDate
  };
}

export async function listGradesForActivity(activityId) {
  const snap = await getDocs(query(coleccionGestion(firestore, "calificaciones"), where("actividadId", "==", activityId)));
  const map = {};
  snap.docs.forEach((item) => { map[item.data().alumnoId] = { id: item.id, ...item.data() }; });
  return map;
}

export async function listGradesForCourse(courseId, trimestreId = "") {
  const filters = [where("cursoId", "==", courseId)];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = await getDocs(query(coleccionGestion(firestore, "calificaciones"), ...filters));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function saveGrade({
  activity,
  student,
  value,
  estadoEntrega = "",
  fechaEntrega = ""
}, { db = firestore, uid = currentUid(), audit = safeAudit } = {}) {
  if (!activity?.id) throw new Error("No se encontro la actividad para calificar.");
  if (!student?.id) throw new Error("No se encontro el alumno para calificar.");

  const cursoId = activity.cursoId || student.cursoId || "";
  const materiaId = activity.materiaId || "";
  const trimestreId = activity.trimestreId || "t1";
  const maximo = Number(activity.maximo || 100);

  if (!cursoId) throw new Error("La actividad no tiene curso asignado.");
  if (!materiaId) throw new Error("La actividad no tiene materia asignada.");
  if (student.cursoId && student.cursoId !== cursoId) throw new Error("El alumno no pertenece al curso de la actividad.");

  const normalized = normalizeGrade(value, maximo);
  if (!normalized) throw new Error("Nota invalida.");
  const id = gradeDocId(activity.id, student.id);
  const payload = {
    actividadId: activity.id,
    cursoId,
    materiaId,
    trimestreId,
    alumnoId: student.id,
    valor: normalized.valor,
    nota: normalized.nota,
    maximo,
    calificadoPorUid: uid,
    ...deliveryPayload({ activity, normalized, estadoEntrega, fechaEntrega }),
    updatedAt: serverTimestamp()
  };
  const batch = writeBatch(db);
  batch.set(documentoGestion(db, "calificaciones", id), payload, { merge: true });
  if (activity.tieneCalificaciones !== true || activity.estadoRevision === "sin_iniciar") {
    batch.update(documentoGestion(db, "actividades", activity.id), {
      tieneCalificaciones: true,
      ...(activity.estadoRevision === "sin_iniciar" ? {
        estadoRevision: "en_proceso",
        revisionIniciadaAt: serverTimestamp(),
        revisionIniciadaPorUid: uid
      } : {}),
      updatedAt: serverTimestamp()
    });
  }
  const hadPendingDelivery = Boolean(activity.entregasPendientes?.[student.id]);
  if (hadPendingDelivery) {
    batch.update(documentoGestion(db, "actividades", activity.id), new FieldPath("entregasPendientes", student.id), deleteField());
  }
  await batch.commit();
  activity.tieneCalificaciones = true;
  announceAlertDataChange();
  if (hadPendingDelivery) delete activity.entregasPendientes[student.id];
  if (activity.estadoRevision === "sin_iniciar") activity.estadoRevision = "en_proceso";
  await audit({
    tipo: "calificaciones",
    accion: "calificar",
    detalle: `Califico ${student.nombre} con ${payload.nota} en ${activity.titulo}`,
    datos: {
      actividadId: activity.id,
      alumnoId: student.id,
      trimestreId: payload.trimestreId,
      nota: payload.nota,
      valor: payload.valor,
      maximo: payload.maximo,
      estadoEntrega: payload.estadoEntrega || "registro_anterior",
      fechaEntrega: payload.fechaEntrega || ""
    }
  });
  return { id, ...payload };
}

export async function finalizeActivityReview({ activity, students = [], attendanceMap = {}, gradesMap = {} }, { db = firestore, uid = currentUid(), audit = safeAudit } = {}) {
  if (!activity?.id) throw new Error("No se encontro la actividad para finalizar.");

  const revisionFinalizadaFecha = todayIso();
  const regularizacionDesde = todayIso();
  const generatedGrades = [];
  students.forEach((student) => {
    if (!student?.id || gradesMap[student.id]) return;
    if (student.cursoId && student.cursoId !== activity.cursoId) throw new Error("Hay un alumno de otro curso en la revision.");
    const attendanceState = String(attendanceMap[student.id]?.estado || "").toLowerCase();
    if (["permiso", "licencia"].includes(attendanceState)) return;

    const normalized = normalizeGrade(0, activity.maximo || 100);
    const id = gradeDocId(activity.id, student.id);
    const payload = {
      actividadId: activity.id,
      cursoId: activity.cursoId || student.cursoId || "",
      materiaId: activity.materiaId || "",
      trimestreId: activity.trimestreId || "t1",
      alumnoId: student.id,
      valor: normalized.valor,
      nota: normalized.nota,
      maximo: Number(activity.maximo || 100),
      calificadoPorUid: uid,
      ...deliveryPayload({
        activity,
        normalized,
        estadoEntrega: DELIVERY_STATES.NOT_SUBMITTED
      }),
      updatedAt: serverTimestamp()
    };
    generatedGrades.push({ id, ...payload });
  });

  // Two grades fit the rules budget even without cached checks across writes.
  for (let index = 0; index < generatedGrades.length; index += 2) {
    const gradesBatch = writeBatch(db);
    generatedGrades.slice(index, index + 2).forEach(({ id, ...payload }) => {
      gradesBatch.set(documentoGestion(db, "calificaciones", id), payload, { merge: true });
    });
    if (activity.tieneCalificaciones !== true) {
      gradesBatch.update(documentoGestion(db, "actividades", activity.id), {
        tieneCalificaciones: true, updatedAt: serverTimestamp()
      });
    }
    await gradesBatch.commit();
    activity.tieneCalificaciones = true;
  }
  const batch = writeBatch(db);
  batch.update(documentoGestion(db, "actividades", activity.id), {
    estadoRevision: "cerrada",
    revisionFinalizadaFecha,
    regularizacionDesde,
    revisionFinalizadaAt: serverTimestamp(),
    revisionFinalizadaPorUid: uid,
    updatedAt: serverTimestamp()
  });
  await batch.commit();
  announceAlertDataChange();
  activity.estadoRevision = "cerrada";
  activity.revisionFinalizadaFecha = revisionFinalizadaFecha;
  activity.regularizacionDesde = regularizacionDesde;

  await audit({
    tipo: "calificaciones",
    accion: "finalizar_revision",
    detalle: `Finalizo la revision de ${activity.titulo || activity.id}`,
    datos: {
      actividadId: activity.id,
      cursoId: activity.cursoId || "",
      trimestreId: activity.trimestreId || "t1",
      noPresentaron: generatedGrades.length,
      regularizacionDesde
    }
  });

  return { activity, grades: generatedGrades };
}

export { COURSES, SUBJECTS };







