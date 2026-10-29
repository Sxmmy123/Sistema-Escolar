import { getTeacherStudents, listAttendanceForCourseDate, saveAttendance } from "../../services/teacherData.js";
import { getSchedule } from "../../services/adminData.js";
import { listarRegistrosInicial, guardarRegistroInicial, editarBitacoraInicial, nuevoIdRegistroInicial } from "../../services/registrosInicial.js";
import { cursoInicial } from "../../services/modeloInicial.js";
import { listarActividadesInicial, modificarActividadInicial, moverActividadInicial, guardarAvanceInicial } from "../../services/actividadesInicial.js";
import { GRUPO_INICIAL, cursosGrupoInicial, esMultigradoInicial } from "../../services/grupoInicial.js";

export function crearDatosInicial(context, dependencies = {}) {
  const services = { getTeacherStudents, listAttendanceForCourseDate, saveAttendance, getSchedule, listarRegistrosInicial, guardarRegistroInicial, editarBitacoraInicial, nuevoIdRegistroInicial, listarActividadesInicial, modificarActividadInicial, moverActividadInicial, guardarAvanceInicial, ...dependencies };
  const cache = new Map();
  const pending = new Map();
  const versions = new Map();
  let active = true;
  const key = (type, courseId, term = "", date = "") => JSON.stringify([type, courseId, term, date]);
  const check = (courseId) => {
    if (!active) throw new Error("La sesion cambio.");
    if (courseId === GRUPO_INICIAL && esMultigradoInicial(context)) cursosGrupoInicial(context).forEach((id) => cursoInicial(context, id));
    else cursoInicial(context, courseId);
  };
  function combine(type, values) {
    if (values.some((value) => value === undefined)) return undefined;
    if (type === "schedule") return values.find((value) => Object.keys(value?.clases || {}).length) || values[0];
    if (type === "attendance") return Object.assign({}, ...values);
    const courses = cursosGrupoInicial(context);
    const rows = values.flatMap((items, index) => type === "students" ? items.map((student) => ({ ...student, cursoId: courses[index] })) : items);
    return [...new Map(rows.map((item) => [item.id, item])).values()];
  }
  function read(type, courseId, term = "", date = "") {
    if (courseId !== GRUPO_INICIAL) return cache.get(key(type, courseId, term, date));
    return combine(type, cursosGrupoInicial(context).map((id) => cache.get(key(type, id, term, date))));
  }
  function studentCourse(courseId, studentId) {
    if (courseId !== GRUPO_INICIAL) return courseId;
    const course = cursosGrupoInicial(context).find((id) => cache.get(key("students", id))?.some((student) => student.id === studentId));
    if (!course) throw new Error("El estudiante no pertenece al grupo multigrado cargado.");
    return course;
  }
  async function load(type, courseId, term, date, force = false) {
    check(courseId);
    if (courseId === GRUPO_INICIAL) {
      const values = await Promise.all(cursosGrupoInicial(context).map((id) => load(type, id, term, date, force)));
      check(courseId);
      return combine(type, values);
    }
    const id = key(type, courseId, term, date);
    if (pending.has(id)) {
      const entry = pending.get(id);
      if (!force || entry.force) return entry.request;
      entry.refresh ||= entry.request.catch(() => {}).then(() => load(type, courseId, term, date, true));
      return entry.refresh;
    }
    if (!force && cache.has(id)) return cache.get(id);
    const version = versions.get(id) || 0;
    const entry = { force };
    const request = Promise.resolve().then(() => {
      check(courseId);
      if (type === "students") return services.getTeacherStudents(courseId);
      if (type === "attendance") return services.listAttendanceForCourseDate(courseId, date, term);
      if (type === "schedule") return services.getSchedule(courseId);
      if (type === "records") return services.listarRegistrosInicial(context, courseId, term, { fresh: force });
      if (type === "activities") return services.listarActividadesInicial(context, courseId, term);
      throw new Error("Carga no disponible.");
    }).then((result) => {
      check(courseId);
      if ((versions.get(id) || 0) !== version) {
        if (pending.get(id) === entry) pending.delete(id);
        return load(type, courseId, term, date, true);
      }
      cache.set(id, result); return result;
    }).finally(() => { if (pending.get(id) === entry) pending.delete(id); });
    entry.request = request;
    pending.set(id, entry);
    return request;
  }
  function merge(type, course, term, rows) {
    const id = key(type, course, term), ids = new Set(rows.map((item) => item.id));
    versions.set(id, (versions.get(id) || 0) + 1);
    cache.set(id, [...(cache.get(id) || []).filter((item) => !ids.has(item.id)), ...rows]);
  }
  return {
    nuevoId: () => services.nuevoIdRegistroInicial(context.uid),
    leer: read,
    cargar: (type, courseId, term = "", date = "", force = false) => load(type, courseId, term, date, force),
    async guardarActividad(input) {
      check(input.cursoId);
      const courseId = input.cursoId === GRUPO_INICIAL ? read("activities", GRUPO_INICIAL, input.trimestreId)?.find((item) => item.id === input.id)?.cursoId || cursosGrupoInicial(context)[0] : input.cursoId;
      const row = await services.modificarActividadInicial(context, { ...input, cursoId: courseId }); check(courseId);
      merge("activities", courseId, input.trimestreId, [row]); return row;
    },
    async moverActividad(activity, neighbor) {
      check(activity.cursoId); const rows = await services.moverActividadInicial(context, activity, neighbor); check(activity.cursoId);
      for (const row of rows) merge("activities", row.cursoId || activity.cursoId, activity.trimestreId, [row]);
    },
    async guardarAvance(activity, studentId, entries) {
      check(activity.cursoId);
      const courseId = esMultigradoInicial(context) ? studentCourse(GRUPO_INICIAL, studentId) : activity.cursoId;
      let result;
      try { result = await services.guardarAvanceInicial(context, activity, studentId, entries, { cursoAlumnoId: courseId }); }
      catch (error) {
        if (error.code === "initial/criteria-changed") await load("activities", activity.cursoId, activity.trimestreId, "", true);
        throw error;
      }
      check(courseId);
      merge("activities", activity.cursoId, activity.trimestreId, [result.activity]);
      merge("records", courseId, activity.trimestreId, result.records); return result;
    },
    async guardarAsistencia(courseId, student, date, term, state, observation) {
      check(courseId);
      courseId = studentCourse(courseId, student.id);
      const record = await services.saveAttendance({ course: cursoInicial(context, courseId), student, fecha: date, trimestreId: term, estado: state, observacion: observation });
      check(courseId);
      const id = key("attendance", courseId, term, date);
      versions.set(id, (versions.get(id) || 0) + 1);
      cache.set(id, { ...(cache.get(id) || {}), [student.id]: record });
      return record;
    },
    async guardarRegistro(input) {
      check(input.cursoId);
      const courseId = studentCourse(input.cursoId, input.alumnoId);
      const result = await services.guardarRegistroInicial(context, { ...input, cursoId: courseId });
      check(courseId);
      merge("records", courseId, input.trimestreId, [result]);
      return result;
    },
    async editarBitacora(input) {
      check(input.cursoId);
      const result = await services.editarBitacoraInicial(context, input);
      check(input.cursoId);
      merge("records", input.cursoId, input.trimestreId, [result]);
      return result;
    },
    desmontar() { active = false; cache.clear(); pending.clear(); versions.clear(); }
  };
}
