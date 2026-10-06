# Modulos del docente

La separacion conserva los cuerpos de las funciones, los selectores de la interfaz,
las rutas, el estado compartido y las llamadas a los servicios. No crea colecciones
ni cambia el calculo de notas o la politica de regularizacion.

| Archivo | Responsabilidad |
| --- | --- |
| ControladorDocente.js | Cargar contexto, elegir pantalla, pestañas generales y foco de notificaciones |
| PanelDocente.js | Panel y seleccion del trimestre activo |
| AsistenciaDocente.js | Lista de asistencia, guia y modal del alumno |
| AgendaDocente.js | Crear/editar actividades, materiales y calendario |
| CalificarDocente.js | Pendientes, hoy, siete dias y revision del curso |
| RegularizacionDocente.js | Buscar alumnos pendientes y recibir actividades despues |
| NotasDocente.js | Tabla de notas, criterios SER, autoevaluacion y edicion confirmada |
| BoletinDocente.js | Boletin de materias y trimestres |
| ResumenAsistenciaDocente.js | Resumen mensual y acceso a impresion |
| HorarioDocente.js | Visualizar y actualizar el horario |
| ComunDocente.js | Seleccion de curso, orden de alumnos y datos compartidos de actividad/entrega |
| EstadoDocente.js | Unico estado de la sesion docente |
| AcademicoDocente.js | Adaptacion visual y reexportacion de calculos compartidos |
| UtilidadesDocente.js | Fechas, encabezados, iconos y utilidades de interfaz |

El acceso a Firebase sigue en `src/services/teacherData.js`; rutas y caches siguen
en `rutasFirestore.js`. Los modulos de pantalla no importan el controlador y no
dependen unos de otros. Para agregar una pantalla, declarar su renderer y conectarlo
en el controlador. Las impresiones y notificaciones conservan sus archivos propios.

Los archivos `.bak_saber` son copias previas que no se importan ni se empaquetan.
No se han borrado, porque pueden ser respaldos conservados por el propietario.
