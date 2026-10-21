export function crearCacheCalificar({ almacenamiento = () => globalThis.localStorage } = {}) {
  const memoria = new Map();
  const cargas = new Map();
  const versiones = new Map();
  const prefijo = (ambito) => `escolar_v2_${ambito.gestionId}_${ambito.uid}_calificar_v1_${ambito.trimestreId}_`;
  const clave = (ambito, tipo, id) => `${prefijo(ambito)}${tipo}_${id}`;

  function leer(ambito, tipo, id) {
    const key = clave(ambito, tipo, id);
    if (memoria.has(key)) return memoria.get(key);
    try {
      const registro = JSON.parse(almacenamiento()?.getItem(key) || "null");
      if (registro && Object.hasOwn(registro, "datos")) {
        memoria.set(key, registro.datos);
        return registro.datos;
      }
    } catch {
      // La copia en memoria funciona aunque el navegador no permita almacenamiento.
    }
    return null;
  }

  function guardar(ambito, tipo, id, datos) {
    const key = clave(ambito, tipo, id);
    versiones.set(key, (versiones.get(key) || 0) + 1);
    memoria.set(key, datos);
    try { almacenamiento()?.setItem(key, JSON.stringify({ datos })); } catch { /* Solo memoria. */ }
    return datos;
  }

  function invalidar(ambito, tipo, id) {
    const key = clave(ambito, tipo, id);
    versiones.set(key, (versiones.get(key) || 0) + 1);
    memoria.delete(key);
    try { almacenamiento()?.removeItem(key); } catch { /* Solo memoria. */ }
  }

  function actualizar(ambito, tipo, id, transformar) {
    const datos = leer(ambito, tipo, id);
    if (datos === null) return invalidar(ambito, tipo, id);
    return guardar(ambito, tipo, id, transformar(datos));
  }

  async function cargar(ambito, tipo, id, cargarRemoto) {
    const key = clave(ambito, tipo, id);
    const datos = leer(ambito, tipo, id);
    if (datos !== null) return datos;
    if (cargas.has(key)) return cargas.get(key);
    const version = versiones.get(key) || 0;
    const promesa = Promise.resolve().then(cargarRemoto).then(async (resultado) => {
      // Una consulta anterior no debe pisar una nota guardada mientras estaba en vuelo.
      if ((versiones.get(key) || 0) !== version) {
        cargas.delete(key);
        return leer(ambito, tipo, id) ?? cargar(ambito, tipo, id, cargarRemoto);
      }
      return guardar(ambito, tipo, id, resultado);
    }).finally(() => {
      if (cargas.get(key) === promesa) cargas.delete(key);
    });
    cargas.set(key, promesa);
    return promesa;
  }

  function limpiar(ambito) {
    const inicio = prefijo(ambito);
    const keys = new Set([...memoria.keys(), ...cargas.keys(), ...versiones.keys()]);
    try {
      const storage = almacenamiento();
      for (let i = 0; i < (storage?.length || 0); i += 1) keys.add(storage.key(i));
    } catch { /* Solo memoria. */ }
    for (const key of keys) {
      if (!key?.startsWith(inicio)) continue;
      versiones.set(key, (versiones.get(key) || 0) + 1);
      memoria.delete(key);
      try { almacenamiento()?.removeItem(key); } catch { /* Solo memoria. */ }
    }
  }

  return { leer, guardar, cargar, actualizar, invalidar, limpiar };
}

export const cacheCalificar = crearCacheCalificar();

export function ambitoCalificar(context, trimestreId) {
  return { uid: context.uid, gestionId: context.gestionId, trimestreId };
}

export async function cargarIndiceCalificar(context, trimestreId, loaders, { pendientes = false, cache = cacheCalificar } = {}) {
  const ambito = ambitoCalificar(context, trimestreId);
  const porCurso = await Promise.all(context.courses.map(async (curso) => ({
    curso,
    actividades: await cache.cargar(ambito, "actividades", curso.id, () => loaders.listActivities(curso.id, trimestreId))
  })));
  const cursosAntiguos = pendientes ? porCurso.filter(({ actividades }) => actividades.some((item) => !item.estadoRevision)) : [];
  const notasAntiguas = await Promise.all(cursosAntiguos.map(({ curso }) =>
    cache.cargar(ambito, "notas_curso", curso.id, () => loaders.listGradesForCourse(curso.id, trimestreId))
  ));
  return {
    actividades: porCurso.flatMap((item) => item.actividades),
    calificadas: new Set(notasAntiguas.flat().map((item) => item.actividadId).filter(Boolean))
  };
}

export async function cargarActividadCalificar(context, actividad, loaders, { cache = cacheCalificar } = {}) {
  const ambito = ambitoCalificar(context, actividad.trimestreId);
  const [students, gradesMap, attendanceMap] = await Promise.all([
    cache.cargar(ambito, "alumnos", actividad.cursoId, () => loaders.getTeacherStudents(actividad.cursoId)),
    cache.cargar(ambito, "notas_actividad", actividad.id, () => loaders.listGradesForActivity(actividad.id)),
    cache.cargar(ambito, "asistencia", `${actividad.cursoId}_${actividad.fecha}`, () =>
      loaders.listAttendanceForCourseDate(actividad.cursoId, actividad.fecha, actividad.trimestreId))
  ]);
  return { students, gradesMap, attendanceMap };
}

export function sincronizarActividadCalificar(context, actividad, anterior = null, cache = cacheCalificar) {
  if (anterior && (anterior.cursoId !== actividad.cursoId || anterior.trimestreId !== actividad.trimestreId)) {
    const previo = ambitoCalificar(context, anterior.trimestreId);
    cache.actualizar(previo, "actividades", anterior.cursoId, (items) => items.filter((item) => item.id !== actividad.id));
  }
  const ambito = ambitoCalificar(context, actividad.trimestreId);
  cache.actualizar(ambito, "actividades", actividad.cursoId, (items) => {
    const index = items.findIndex((item) => item.id === actividad.id);
    const copia = [...items];
    if (index < 0) copia.push({ ...actividad });
    else copia[index] = { ...actividad };
    return copia;
  });
}

export function sincronizarNotaCalificar(context, actividad, nota, cache = cacheCalificar) {
  const ambito = ambitoCalificar(context, actividad.trimestreId);
  cache.actualizar(ambito, "notas_actividad", actividad.id, (notas) => ({ ...notas, [nota.alumnoId]: nota }));
  cache.actualizar(ambito, "notas_curso", actividad.cursoId, (notas) => [
    ...notas.filter((item) => !(item.actividadId === nota.actividadId && item.alumnoId === nota.alumnoId)), nota
  ]);
  sincronizarActividadCalificar(context, actividad, null, cache);
}

export function sincronizarAsistenciaCalificar(context, asistencia, cache = cacheCalificar) {
  const ambito = ambitoCalificar(context, asistencia.trimestreId);
  cache.actualizar(ambito, "asistencia", `${asistencia.cursoId}_${asistencia.fecha}`, (mapa) => ({
    ...mapa, [asistencia.alumnoId]: asistencia
  }));
}

export function quitarActividadCalificar(context, actividad, cache = cacheCalificar) {
  const ambito = ambitoCalificar(context, actividad.trimestreId);
  cache.actualizar(ambito, "actividades", actividad.cursoId, (items) => items.filter((item) => item.id !== actividad.id));
  cache.invalidar(ambito, "notas_actividad", actividad.id);
}
