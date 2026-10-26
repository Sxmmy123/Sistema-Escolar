# Modalidades docentes

## Cursos y evaluacion

- `preinicial` y `inicial` son cursos independientes, con matriculas y horarios propios.
- Ambos pertenecen a `nivel: "inicial"` y usan `modalidadEvaluacion: "cualitativa"`.
- Los seis cursos de Primaria mantienen la modalidad `cuantitativa` y sus calculos actuales.
- Una cuenta docente puede tener los dos cursos cualitativos, o varios de Primaria. No puede combinar ambos niveles.

## Registro del docente

El administrador completa cuenta, cursos, asignacion y confirmacion. Seleccionar un curso bloquea los de la otra modalidad; desmarcar todos permite cambiarla.

Ejemplo de perfil en `usuarios/{uid}`:

```json
{
  "rol": "docente",
  "nivelDocente": "inicial",
  "modalidadEvaluacion": "cualitativa",
  "activo": true
}
```

Asignacion en `gestiones/{gestion}/asignaciones/{uid}`:

```json
{
  "nivelDocente": "inicial",
  "modalidadEvaluacion": "cualitativa",
  "cursos": {
    "preinicial": { "materias": [] },
    "inicial": { "materias": [] }
  }
}
```

No se asignan materias numericas de Primaria a Inicial. La estructura de su evaluacion cualitativa se definira en la siguiente etapa.

## Acceso y compatibilidad

El acceso identifica primero los cursos del docente y descarga solo la entrada correspondiente. Primaria conserva sus rutas. Inicial y Preinicial usan `src/modules/docente-inicial/`, con el mismo sidebar y cabecera compartidos, pero rutas y controladores propios. No exponen Calificar, Regularizacion, Notas ni Boletin numericos.

## Modulos de Inicial y Preinicial

- Panel: cursos asignados, trimestre activo, estudiantes y horario del dia.
- Asistencia: P, F, A y L, con los mismos registros de asistencia del sistema. No registrar no equivale a Falta.
- Registro Diario: una observacion por estudiante y fecha, con recuadros Realiza la actividad, Necesita apoyo, No realiza la actividad y Se distrae. Admite una nota adicional. No son calificaciones ni diagnosticos.
- Registro Semanal: bitacora opcional del curso y observaciones individuales sobre identidad, avances y progreso. No exige describir a todo el curso.
- Horario: consulta independiente del horario asignado al curso, de lunes a viernes.
- Resumenes: cantidades reales de observaciones y acceso al historial de cada estudiante por trimestre. No calcula notas ni promedios cualitativos inventados.
- Seguimiento con IA: anunciado como no disponible; no envia datos a ningun proveedor de IA.

Los modulos cargan mediante sus botones Cargar/Actualizar y reutilizan su cache en memoria al navegar. Las cargas simultaneas del mismo conjunto se comparten. La cache y los borradores se descartan al cerrar sesion o cambiar de gestion/asignacion; los borradores de distintas fechas y cursos permanecen separados mientras esta sesion siga abierta. La campana mantiene una sola suscripcion a comunicados de direccion, reutilizada entre modulos, sin consultar notas numericas para este docente.

El trimestre activo usa la misma preferencia de la cuenta docente y requiere confirmacion. Elegirlo no convierte las observaciones en puntajes. Las escrituras respetan la habilitacion anual del administrador.

### Datos de observacion

Las observaciones se guardan en `gestiones/{gestion}/registros_inicial/{id}`. El ID es estable por docente, tipo, fecha, curso y estudiante (o curso completo), de modo que editar no duplica entradas.

```json
{
  "cursoId": "inicial",
  "trimestreId": "t1",
  "tipo": "diario",
  "fecha": "2026-03-09",
  "alumnoId": "alumno-id",
  "estado": "apoyo",
  "descripcion": "Completo la actividad con acompanamiento.",
  "docenteUid": "docente-uid",
  "updatedAt": "timestamp de Firebase"
}
```

En el registro semanal, `tipo` es `semanal`, `estado` es vacio y `fecha` identifica el inicio de semana; `alumnoId` vacio indica bitacora del curso. La descripcion es obligatoria solo si se decide guardar esa entrada. Estas notas privadas solo pueden consultarlas su autor asignado, el director y administracion, no los alumnos. La evaluacion cualitativa formal y sus informes siguen pendientes de definir.

Las cuentas anteriores de Primaria no necesitan los campos nuevos: su modalidad se obtiene de sus cursos. Una asignacion mezclada, desconocida o del antiguo curso `preinicial_inicial` muestra una solicitud de revision administrativa, no otro curso por defecto.

No se trasladan alumnos, horarios, actividades ni docentes del antiguo curso combinado. Al preparar una gestion, el catalogo persistido se actualiza a version 2 y el curso combinado queda inactivo para revision, conservando sus registros. Las opciones actuales de registro usan el catalogo de la aplicacion.

## Reglas y pruebas

Publicar `firestore.rules` para aplicar tambien en Firebase el rechazo de asignaciones mezcladas y de calificaciones numericas en Inicial/Preinicial. Editar el archivo local no publica las reglas.

Verificacion: `npm test`, `npm run test:seguridad` (solo emuladores) y `npm run build`. La verificacion visual usa una prueba aislada sin crear cuentas ni modificar datos reales.
