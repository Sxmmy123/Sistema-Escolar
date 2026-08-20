import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { COURSES, DAYS, SUBJECTS, findCourse, findSubject, periodsForCourse } from "../data/catalog.js";
import { auth, firestore } from "../firebase/client.js";
import { getSchedule, listStudents } from "./adminData.js";
import { safeAudit } from "./auditData.js";

function currentUid() {
  return auth.currentUser?.uid || sessionStorage.getItem("sesionUid") || "";
}

function currentUserLabel() {
  return sessionStorage.getItem("sesionUsuario") || auth.currentUser?.email || "docente";
}

function scheduleCacheKey(context = {}) {
  const uid = context.uid || currentUid() || "docente";
  const courseIds = (context.courses || []).map((course) => course.id).sort().join("_") || "sin_cursos";
  return `docente_horario_${uid}_${courseIds}`;
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
  return `docente_${type}_${uid}_${courseId || "sin_curso"}_${trimesterId || "sin_trimestre"}`;
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

export function todayIso(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export const TRIMESTERS = [
  { id: "t1", label: "1er trimestre" },
  { id: "t2", label: "2do trimestre" },
  { id: "t3", label: "3er trimestre" }
];

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function newestTrimesterPreference(userProfile = null, teacherProfile = null) {
  const userTrimester = userProfile?.trimestreActivo;
  const teacherTrimester = teacherProfile?.trimestreActivo;
  if (!userTrimester) return teacherTrimester || "t1";
  if (!teacherTrimester) return userTrimester;

  const userTime = timestampMillis(userProfile?.trimestreActivoUpdatedAt || userProfile?.updatedAt);
  const teacherTime = timestampMillis(teacherProfile?.trimestreActivoUpdatedAt || teacherProfile?.updatedAt);
  return userTime >= teacherTime ? userTrimester : teacherTrimester;
}

export async function saveTeacherTrimesterPreference(uid = currentUid(), trimesterId = "t1") {
  const safeUid = auth.currentUser?.uid || uid || currentUid();
  if (!safeUid) return;

  await setDoc(doc(firestore, "preferencias_docente", safeUid), {
    uid: safeUid,
    trimestreActivo: trimesterId,
    trimestreActivoUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function getTeacherContext(uid = currentUid()) {
  if (!uid) return { uid: "", profile: null, courses: [], subjectIds: [] };

  const [userSnap, profileSnap, assignmentSnap] = await Promise.all([
    getDoc(doc(firestore, "usuarios", uid)),
    getDoc(doc(firestore, "docentes", uid)),
    getDoc(doc(firestore, "asignaciones", uid))
  ]);

  const preferenceSnap = await getDoc(doc(firestore, "preferencias_docente", uid)).catch((error) => {
    console.warn("No se pudo leer la preferencia del docente; se usara el trimestre local.", error);
    return null;
  });

  const userProfile = userSnap.exists() ? userSnap.data() : null;
  const teacherProfile = profileSnap.exists() ? profileSnap.data() : null;
  const preferenceProfile = preferenceSnap?.exists?.() ? preferenceSnap.data() : null;
  const accountProfile = preferenceProfile ? { ...(userProfile || {}), ...preferenceProfile } : userProfile;
  const profile = {
    ...(userProfile || {}),
    ...(teacherProfile || {}),
    ...(preferenceProfile || {}),
    trimestreActivo: newestTrimesterPreference(accountProfile, teacherProfile)
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

  return {
    uid,
    profile,
    courses: assignedCourses,
    subjectIds: [...new Set(assignedCourses.flatMap((course) => course.materias))]
  };
}

export async function getTeacherStudents(courseId) {
  if (!courseId) return [];
  const students = await listStudents(courseId);
  return students.filter((student) => student.activo !== false);
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

export async function refreshTeacherNotesSnapshot(context, course, trimesterId = "t1") {
  if (!course?.id) return null;
  const [students, activities, gradesList, attendanceRows] = await Promise.all([
    getTeacherStudents(course.id),
    listActivities(course.id, trimesterId),
    listGradesForCourse(course.id, trimesterId),
    listAttendanceForCourse(course.id, trimesterId)
  ]);
  const data = { students, activities, gradesList, attendanceRows };
  writeTeacherDataCache(context, "notas", course.id, trimesterId, data);
  return data;
}

export async function getTeacherNotesSnapshot(context, course, trimesterId = "t1", options = {}) {
  if (!course?.id) return null;
  const cache = readTeacherDataCache(context, "notas", course.id, trimesterId);
  if (cache && !options.forceRemote) return cache.data;
  if (options.forceRemote) return refreshTeacherNotesSnapshot(context, course, trimesterId);
  return null;
}
export function upsertTeacherNotesSnapshotGrade(context, activity, grade) {
  if (!activity?.cursoId || !grade?.id) return;
  const trimesterId = activity.trimestreId || grade.trimestreId || "t1";
  const cache = readTeacherDataCache(context, "notas", activity.cursoId, trimesterId);
  if (!cache?.data) return;

  const activities = Array.isArray(cache.data.activities) ? [...cache.data.activities] : [];
  const gradesList = Array.isArray(cache.data.gradesList) ? [...cache.data.gradesList] : [];
  const activityIndex = activities.findIndex((item) => item.id === activity.id);
  const normalizedActivity = { ...activity, trimestreId };
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
    iso: date.toISOString().slice(0, 10)
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
  const snap = await getDocs(query(collection(firestore, "asistencias"), ...filters));
  const map = {};
  snap.docs.forEach((item) => { map[item.data().alumnoId] = { id: item.id, ...item.data() }; });
  return map;
}

export async function listAttendanceForCourse(courseId, trimestreId = "") {
  const filters = [where("cursoId", "==", courseId)];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = await getDocs(query(collection(firestore, "asistencias"), ...filters));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function saveAttendance({ course, student, fecha, estado, trimestreId = "t1", observacion = "" }) {
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
  await setDoc(doc(firestore, "asistencias", id), payload, { merge: true });
  safeAudit({
    tipo: "asistencia",
    accion: "registrar",
    detalle: `${student.nombre} marcado como ${estado} en ${course.nombre}`,
    datos: { cursoId: course.id, alumnoId: student.id, fecha, trimestreId, estado, observacion: payload.observacion }
  });
  return { id, ...payload };
}

export function activityDocId(courseId, subjectId, date, title) {
  const clean = String(title || "actividad").replace(/[^a-z0-9]+/gi, "_").slice(0, 32).toLowerCase();
  return `${date}_${courseId}_${subjectId}_${clean}`.replace(/_+/g, "_").toLowerCase();
}

export function specialActivityDocId(courseId, subjectId, trimesterId, type, title = "") {
  const cleanTitle = String(title || type || "nota").replace(/[^a-z0-9]+/gi, "_").slice(0, 32).toLowerCase();
  return `${type}_${trimesterId}_${courseId}_${subjectId}_${cleanTitle}`.replace(/_+/g, "_").toLowerCase();
}

export async function listActivities(courseId, trimestreId = "") {
  const filters = [where("cursoId", "==", courseId)];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = await getDocs(query(collection(firestore, "actividades"), ...filters));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(a.titulo || "").localeCompare(String(b.titulo || "")));
}

export async function saveActivity({ course, materiaId, fecha, titulo, tipo, maximo, trimestreId = "t1" }) {
  const id = activityDocId(course.id, materiaId, fecha, titulo);
  const subject = findSubject(materiaId);
  const payload = {
    cursoId: course.id,
    materiaId,
    trimestreId,
    fecha,
    titulo: String(titulo || "").trim(),
    tipo: tipo || "tarea",
    maximo: Number(maximo || 100),
    creadoPorUid: currentUid(),
    creadoPor: currentUserLabel(),
    activo: true,
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(firestore, "actividades", id), payload, { merge: true });
  await safeAudit({
    tipo: "actividades",
    accion: "crear",
    detalle: `Creo ${payload.tipo} ${payload.titulo} en ${course.nombre} - ${subject?.nombre || materiaId}`,
    datos: { actividadId: id, cursoId: course.id, materiaId, trimestreId, fecha, maximo: payload.maximo }
  });
  return { id, ...payload };
}

export async function saveInternalActivity({ course, materiaId, titulo, tipo, maximo, trimestreId = "t1" }) {
  const id = specialActivityDocId(course.id, materiaId, trimestreId, tipo, titulo);
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
    creadoPorUid: currentUid(),
    creadoPor: currentUserLabel(),
    activo: true,
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(firestore, "actividades", id), payload, { merge: true });
  await safeAudit({
    tipo: "actividades",
    accion: "crear",
    detalle: `Creo criterio ${payload.titulo} en ${course.nombre} - ${subject?.nombre || materiaId}`,
    datos: { actividadId: id, cursoId: course.id, materiaId, trimestreId, maximo: payload.maximo, tipo }
  });
  return { id, ...payload };
}

export async function updateActivity({ activity, course, materiaId, fecha, titulo, tipo, maximo, trimestreId = "t1" }) {
  if (!activity?.id) throw new Error("Actividad invalida.");
  const subject = findSubject(materiaId);
  const payload = {
    cursoId: course.id,
    materiaId,
    trimestreId,
    fecha,
    titulo: String(titulo || "").trim(),
    tipo: tipo || "tarea",
    maximo: Number(maximo || 100),
    updatedAt: serverTimestamp()
  };
  await updateDoc(doc(firestore, "actividades", activity.id), payload);
  await safeAudit({
    tipo: "actividades",
    accion: "editar",
    detalle: `Edito ${payload.tipo} ${payload.titulo} en ${course.nombre} - ${subject?.nombre || materiaId}`,
    datos: { actividadId: activity.id, cursoId: course.id, materiaId, trimestreId, fecha, maximo: payload.maximo }
  });
  return { id: activity.id, ...activity, ...payload };
}

export async function deleteActivity(activity) {
  await deleteDoc(doc(firestore, "actividades", activity.id));
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

export async function listGradesForActivity(activityId) {
  const snap = await getDocs(query(collection(firestore, "calificaciones"), where("actividadId", "==", activityId)));
  const map = {};
  snap.docs.forEach((item) => { map[item.data().alumnoId] = { id: item.id, ...item.data() }; });
  return map;
}

export async function listGradesForCourse(courseId, trimestreId = "") {
  const filters = [where("cursoId", "==", courseId)];
  if (trimestreId) filters.push(where("trimestreId", "==", trimestreId));
  const snap = await getDocs(query(collection(firestore, "calificaciones"), ...filters));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function saveGrade({ activity, student, value }) {
  const normalized = normalizeGrade(value, activity.maximo);
  if (!normalized) throw new Error("Nota invalida.");
  const id = gradeDocId(activity.id, student.id);
  const payload = {
    actividadId: activity.id,
    cursoId: activity.cursoId,
    materiaId: activity.materiaId,
    trimestreId: activity.trimestreId || "t1",
    alumnoId: student.id,
    valor: normalized.valor,
    porcentaje: normalized.porcentaje,
    nota: normalized.nota,
    maximo: Number(activity.maximo || 100),
    fecha: activity.fecha || "",
    tipo: activity.tipo || "tarea",
    calificadoPorUid: currentUid(),
    calificadoPor: currentUserLabel(),
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(firestore, "calificaciones", id), payload, { merge: true });
  await safeAudit({
    tipo: "calificaciones",
    accion: "calificar",
    detalle: `Califico ${student.nombre} con ${payload.nota} en ${activity.titulo}`,
    datos: { actividadId: activity.id, alumnoId: student.id, trimestreId: payload.trimestreId, nota: payload.nota, valor: payload.valor, maximo: payload.maximo }
  });
  return { id, ...payload };
}

export { COURSES, SUBJECTS };







