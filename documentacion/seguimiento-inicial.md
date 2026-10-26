# Seguimiento cualitativo de Inicial y Preinicial

## Modulos

- Panel: seleccion del trimestre activo, cursos y horario.
- Asistencia: fecha de clase y estados habituales. Carga automatica.
- Actividades: tablero por materias y lista enumerada ordenable. La creacion solicita materia, nombre y descripcion; Gemini propone criterios antes de guardar. La docente puede revisar y editar SER, SABER y HACER y confirma una sola vez con Aceptar criterios y crear, sin checks adicionales. La actividad y sus criterios se crean en una sola transaccion. Cualquier materia del catalogo, sin fecha obligatoria. Priorizar no significa fijar un vencimiento. Eliminar requiere modal y permite restaurar; conserva el historial.
- Registro: mosaico de actividades pendientes con criterios aprobados, primero las prioritarias, cinco inicialmente y Cargar mas. Elegir una actividad recoge el mosaico y centra su titulo; pulsar el titulo vuelve al mosaico. Se selecciona un alumno, destacado en verde y por nombre. Cada recuadro se guarda automaticamente antes de avanzar SER -> SABER -> HACER y luego al siguiente alumno pendiente. No hay boton Guardar. Un fallo conserva la seleccion y ofrece Reintentar sin avanzar. Los registros anteriores siguen disponibles para consulta y correccion.
- Bitacora: comentarios generales sucesivos de hasta 5000 caracteres por alumno, sin selector de materia. El texto puede mencionar materias. Cada comentario es una entrada independiente.
- Informe trimestral: fuentes del alumno y trimestre, borrador editable de hasta 200 caracteres, aprobacion explicita e impresion carta vertical.
- Horario: carga automatica y colores compartidos con Primaria.
- Seguimiento: unica pantalla que conserva carga y actualizacion manual del historial completo. Seleccionar un alumno recoge los demas con una animacion; pulsarlo otra vez restaura la lista. Cuatro pestanas SER, SABER, HACER y Bitacora muestran mapas de todos los registros del alumno, sin paginacion. Los filtros ofrecen solo materias con observaciones; Bitacora agrupa comentarios por mes y conserva la edicion de las entradas propias. Los registros antiguos siguen disponibles aparte. Mantiene la ruta interna `/docente/resumenes` para no romper enlaces existentes.

## Datos

Los mapas de Seguimiento mantienen la lectura horizontal tambien en celular y tableta, con desplazamiento lateral tactil, por teclado o con flechas. Los bordes y conexiones tienen un trazo de 2 px. La posicion se conserva por alumno, categoria y materia durante la sesion.

`gestiones/{gestion}/actividades_inicial` conserva docente, curso, trimestre, materia, titulo, descripcion, prioridad, orden, estado y criterios habilitados. Se separa de las actividades cuantitativas de Primaria. No guarda puntajes.

Se conserva `gestiones/{gestion}/registros_inicial`. Tipos:

- `observacion`: alumno, materia, dimension, criterio, valoracion y descripcion opcional.
- `actividad`: alumno, actividad, materia, dimension, criterio, opcion elegida y su texto, comentario opcional. ID unico por docente/actividad/alumno/dimension; corregir actualiza esa misma observacion sin duplicarla. Guardar el avance y marcar la actividad con registros es atomico.
- `bitacora`: alumno y descripcion general. Las antiguas entradas con materia siguen siendo legibles.
- `informe`: un documento por docente, alumno, curso y trimestre; texto, origen, aprobacion y firma de sus fuentes.

Todos conservan autor, curso, trimestre y timestamps de auditoria. Las observaciones anteriores y comentarios se acumulan. Los IDs estables evitan duplicar al reintentar. Los antiguos registros diarios y semanales siguen siendo legibles; no se migran ni eliminan. Sin observar es ausencia de evidencia, no una dificultad; no se asignan valoraciones automaticas a alumnos pendientes.

Cambiar de alumno, materia o trimestre conserva borradores en la sesion. Cerrar sesion los descarta. Una edicion o un registro nuevo impide imprimir un informe antiguo hasta revisarlo y aprobarlo de nuevo. El informe generado por IA nunca se guarda ni aprueba automaticamente.

## Gemini local

La configuracion de prueba esta en `.env.local`, excluida de Git. `GEMINI_API_KEY` y `GEMINI_MODEL` son exclusivamente del servidor. Nunca usar el prefijo `VITE_` para una clave. `VITE_INFORMES_IA_HABILITADA` solo indica si se muestra la accion disponible.

El middleware de desarrollo `/api/inicial/informe` solo admite conexiones locales, valida el token con Firebase y consulta Firestore con ese mismo token: no elude las reglas ni usa una credencial administrativa. Verifica rol activo, gestion, modalidad, matricula y trimestre. El navegador envia unicamente los identificadores de seleccion, no un prompt arbitrario ni registros inventados.

`/api/inicial/criterios` valida el mismo contexto y la propiedad de la actividad, o un borrador acotado al crearla. Un borrador no exige una actividad ya guardada y nunca consulta registros de estudiantes. Solo envia a Gemini materia, titulo y descripcion, sin datos de alumnos. Devuelve una propuesta estructurada con cuatro opciones por SER/SABER/HACER; nunca elige la valoracion de un alumno. El informe utiliza las opciones que realmente selecciono la docente y sus comentarios generales de Bitacora. La aceptacion valida que los tres criterios y sus opciones esten completos, sin requerir confirmaciones por dimension. Los criterios habilitados permanecen fijos para conservar el significado del historial. Las actividades antiguas con criterios pendientes se preparan desde Actividades, no desde Registro.

La redaccion sigue la referencia escolar de criterios de evaluacion: un parrafo de capacidades y actitudes concretas, en presente y sin encabezados ni introducciones como "El estudiante". Integra logros y necesidades de apoyo que tengan evidencia, no recomendaciones futuras. Los ejemplos de las fichas no se copian como si fueran hechos del alumno. Las fechas internas de los registros permiten interpretar avances; no se imprimen en el texto ni se exige una fecha de evaluacion manual. El limite sigue siendo 200 caracteres, aunque la referencia impresa sea mas extensa.

Antes de generar se confirma el envio de observaciones a Google Gemini. No se agrega la ficha del alumno ni su CI al prompt; los comentarios libres pueden contener datos personales y deben revisarse. El modelo no recibe herramientas, no modifica la base de datos y no toma decisiones academicas. Se valida el JSON y el limite de 200 caracteres; no se corta silenciosamente un texto mas largo. Limite local: una solicitud cada 30 segundos y 60 por docente al dia.

## Produccion (no desplegada)

`functions/index.js` prepara la callable equivalente con Firebase Authentication, autorizacion y limite de uso persistido. Antes de desplegar, configurar `GEMINI_API_KEY` con Secret Manager y `GEMINI_MODEL` con un modelo disponible. La clave local no se sube con la aplicacion. El despliegue de Cloud Functions y sus posibles costos deben aprobarse por separado. No desplegar solo por activar la prueba local.

Referencias: [Gemini generateContent](https://ai.google.dev/api/generate-content), [callables Firebase](https://firebase.google.com/docs/functions/callable), [secretos de Functions](https://firebase.google.com/docs/functions/config-env).
