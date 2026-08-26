import {
  collection,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { auth, firestore } from "../firebase/client.js";
import { COURSES, SUBJECTS, periodsForCourse } from "../data/catalog.js";

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function studentDocId(ci) {
  return String(ci || "").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

function attendanceDocId(courseId, date, studentId) {
  return `${date}_${courseId}_${studentId}`.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

export async function seedSchoolCatalog() {
  await Promise.all([
    ...COURSES.map((course) => setDoc(doc(firestore, "cursos", course.id), {
      nombre: course.nombre,
      corto: course.corto,
      orden: course.orden,
      activo: true,
      updatedAt: serverTimestamp()
    }, { merge: true })),
    ...SUBJECTS.map((subject, index) => setDoc(doc(firestore, "materias_escuela", subject.id), {
      nombre: subject.nombre,
      corto: subject.corto,
      color: subject.color,
      orden: index,
      activo: true,
      updatedAt: serverTimestamp()
    }, { merge: true }))
  ]);
}

export function parseStudentsBulk(text, courseId) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(/\t| {2,}/).map((part) => cleanText(part)).filter(Boolean);
      let nombre = parts[0] || line;
      let ci = parts[1] || "";

      if (!ci) {
        const match = line.match(/(.+?)\s+([A-Za-z0-9._-]{4,})$/);
        if (match) {
          nombre = cleanText(match[1]);
          ci = cleanText(match[2]);
        }
      }

      ci = ci || `sin_ci_${courseId}_${index + 1}`;
      return {
        id: studentDocId(ci),
        ci: String(ci),
        nombre: cleanText(nombre).toUpperCase(),
        cursoId: courseId,
        numeroLista: index + 1,
        activo: true,
        retirado: false
      };
    });
}

export async function importStudents(course, rawText) {
  const students = parseStudentsBulk(rawText, course.id);
  if (!students.length) throw new Error("No hay alumnos para importar.");

  await Promise.all(students.map((student) => {
    const { id, ...studentData } = student;
    return setDoc(doc(firestore, "alumnos", id), {
      ...studentData,
      course: deleteField(),
      cursoNombre: deleteField(),
      order: deleteField(),
      password: deleteField(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }));

  return students;
}

export async function listStudents(courseId) {
  const snap = await getDocs(query(
    collection(firestore, "alumnos"),
    where("cursoId", "==", courseId)
  ));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => Number(a.numeroLista || 0) - Number(b.numeroLista || 0));
}

export async function setStudentActive(studentId, active) {
  await updateDoc(doc(firestore, "alumnos", studentId), {
    activo: Boolean(active),
    retirado: !Boolean(active),
    course: deleteField(),
    cursoNombre: deleteField(),
    order: deleteField(),
    password: deleteField(),
    updatedAt: serverTimestamp()
  });
}

export async function getSchedule(courseId) {
  const localShape = {
    cursoId: courseId,
    periodos: periodsForCourse(courseId),
    clases: {}
  };
  const snap = await getDoc(doc(firestore, "horarios", courseId));
  if (!snap.exists()) return localShape;

  const data = snap.data() || {};
  return {
    ...localShape,
    clases: data.clases || {}
  };
}

export async function saveScheduleCell(courseId, periodId, dayId, subjectId) {
  await setDoc(doc(firestore, "horarios", courseId), {
    clases: {
      [periodId]: {
        [dayId]: subjectId || null
      }
    },
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function getAllSchedules() {
  const snap = await getDocs(collection(firestore, "horarios"));
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
  await setDoc(doc(firestore, "horarios", courseId), {
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
      batch.set(doc(firestore, "asistencias", id), {
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

export async function saveTeacherAssignments(teacherUid, assignments) {
  if (!teacherUid) throw new Error("Falta el docente para guardar asignaciones.");
  await setDoc(doc(firestore, "asignaciones", teacherUid), {
    cursos: assignments || {},
    updatedAt: serverTimestamp()
  }, { merge: true });
}
export async function getAdminCounts() {
  const [students, teachers, directors, schedules] = await Promise.all([
    getCountFromServer(query(collection(firestore, "alumnos"), where("activo", "==", true))),
    getCountFromServer(query(collection(firestore, "docentes"), where("activo", "==", true))),
    getCountFromServer(query(collection(firestore, "director"), where("activo", "==", true))),
    getCountFromServer(collection(firestore, "horarios"))
  ]);

  return {
    students: students.data().count,
    teachers: teachers.data().count,
    directors: directors.data().count,
    schedules: schedules.data().count
  };
}


