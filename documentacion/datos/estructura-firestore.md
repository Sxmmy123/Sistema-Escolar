# Estructura de Firestore - Modelo 2

Estado: implementado en el cliente local y verificado en emuladores. Las nuevas
reglas e indices estan en firestore.rules y firestore.indexes.json. Falta
publicarlos en Firebase antes de activar el modelo en la base real. No se migro,
borro ni creo ningun registro real automaticamente durante esta implementacion.

## Criterios

- Separar identidad permanente, cuenta de acceso y registros de cada gestion.
- Mantener un perfil unico en usuarios, sin copias completas por rol.
- Guardar preferencias pequenas como campos mapa, no como colecciones nuevas.
- Agrupar avisos vistos y seguimientos bajo el usuario al que pertenecen.
- Guardar comunicados compartidos una sola vez y conservar historial de avisos.
- Mantener las formulas y reglas actuales de notas, asistencia y regularizacion.

## Arbol

```text
Firestore / (default)
|-- configuracion
|   |-- institucion                  [documento: datos de la escuela]
|   `-- sistema                      [documento: gestion activa y limites]
|
|-- catalogos
|   `-- escolar                      [documento: version del catalogo]
|       |-- cursos
|       |   `-- cuarto_a             [documento: nombre, grado, paralelo]
|       `-- materias
|           `-- matematica           [documento: nombre, abreviatura, color]
|
|-- usuarios
|   `-- UID_USUARIO                  [documento: cuenta y perfil unico]
|       |-- preferencias             [campo mapa, no subcoleccion]
|       |   `-- trimestresPorGestion  [campo mapa: 2026 -> t2]
|       `-- seguimientos
|           `-- 2026_t2_ID_ALUMNO     [documento: vistos y faltas atendidas]
|
|-- alumnos
|   `-- ID_ALUMNO                    [documento: identidad estable]
|       `-- avisos
|           `-- ID_AVISO             [documento: mensaje y estado]
|
|-- indice_accesos
|   `-- USUARIO_NORMALIZADO          [documento: solo uid y authEmail]
|
|-- gestiones
|   `-- 2026                         [documento: ano y datos de creacion]
|       |-- matriculas
|       |   `-- ID_ALUMNO             [documento: curso de ese ano]
|       |-- asignaciones
|       |   `-- UID_DOCENTE           [documento: cursos y materias]
|       |-- horarios
|       |   `-- cuarto_a              [documento: clases por periodo y dia]
|       |-- actividades
|       |   `-- ID_ACTIVIDAD          [documento: actividad agendada]
|       |-- asistencias
|       |   `-- FECHA_CURSO_ALUMNO    [documento: asistencia de un dia]
|       |-- calificaciones
|       |   `-- ACTIVIDAD_ALUMNO      [documento: resultado por alumno]
|       `-- comunicados
|           `-- ID_COMUNICADO         [documento: mensaje compartido]
|
`-- auditoria
    `-- ID_EVENTO                    [documento: actor, accion y contexto]
```

Son seis grupos funcionales y una coleccion tecnica de auditoria. Authentication
sigue separado: conserva UID y credenciales. El administrador existente mantiene
su UID. Las colecciones contienen documentos; las subcolecciones pertenecen a un
documento, no directamente a otra coleccion.

## Identidades y relaciones

| Identificador | Significado |
| --- | --- |
| uid | Cuenta de Firebase Authentication |
| alumnoId | Persona registrada, con ID generado independiente del CI |
| gestionId | Ano escolar, por ejemplo 2026 |
| cursoId | Curso del catalogo, por ejemplo cuarto_a |
| materiaId | Materia del catalogo, por ejemplo matematica |
| actividadId | Actividad unica, con ID generado independiente de su titulo |

Una matricula por alumno y gestion: gestiones/2026/matriculas/ID_ALUMNO y
gestiones/2027/matriculas/ID_ALUMNO son documentos distintos. Cambiar de ano no
reescribe el curso del ano anterior. Antes de implementar traslados dentro de una
gestion, definir y registrar su historial sin reescribir los registros academicos.

```text
Authentication uid -> usuarios/uid.alumnoId -> alumnos/alumnoId
                         -> gestiones/gestionId/matriculas/alumnoId
```

El navegador no decide la identidad mediante sessionStorage.

## Datos principales

| Documento | Campos |
| --- | --- |
| configuracion/institucion | nombre, distrito, nivel, turno y updatedAt; reservada para gestion institucional |
| configuracion/sistema | gestionActivaId, limiteFaltasDirector, versionModelo y revisionAlumnos para coordinar importaciones |
| usuarios/uid | nombre, usuario, authEmail, rol, activo, correoRecuperacion, alumnoId si corresponde y preferencias |
| alumnos/alumnoId | nombre, ci, activo, authUid y authEmail si tiene cuenta, createdAt y updatedAt |
| indice_accesos/usuario | Solo uid y authEmail; nunca nombre, notas o contrasenas |
| gestiones/gestionId | ano, createdBy y createdAt |
| matriculas/alumnoId | alumnoId, cursoId, numeroAgregacion, estado, createdAt y updatedAt |
| asignaciones/uid | Mapa cursos -> materias del docente |
| horarios/cursoId | clases y updatedAt; el curso se obtiene del ID, y los periodos del catalogo del cliente |
| actividades/actividadId | cursoId, materiaId, trimestreId, titulo, fecha, tipo, maximo, estadoRevision y campos existentes necesarios |
| asistencias/registroId | alumnoId, cursoId, trimestreId, fecha, estado, observacion y registradoPorUid |
| calificaciones/registroId | actividadId, alumnoId, cursoId, materiaId, trimestreId, valor, nota, maximo, entrega cuando corresponda y calificadoPorUid |
| comunicados/comunicadoId | titulo, motivo, fechaEvento, horaEvento, destinatariosRol, activo y creadoPorUid |
| alumnos/alumnoId/avisos/avisoId | gestionId, trimestreId, alumnoId, cursoId, mensaje, activa, creadaPorUid, createdAt, updatedAt, cerradoPorUid y cerradoAt; contexto de asistencia |
| usuarios/uid/seguimientos/estadoId | gestionId, trimestreId, alumnoId, avisosVistos, ultimaFaltaAtendida y updatedAt |
| auditoria/eventoId | tipo, accion, detalle, datos, usuarioUid, usuario, rol, gestionId, fecha, hora y createdAt |

La gestion se determina por la ruta. cursoId, materiaId y trimestreId permanecen
en los registros donde sirven para consultas y permisos. Si gestionId tambien
se guarda como campo para consultas transversales, debe coincidir con la ruta.

No se eliminan campos de entrega, revision, materiales o autoevaluacion por razones
esteticas. Primero se revisan todos sus lectores y escritores. No se crean copias
de notas para cada modulo: Notas, Boletin y Boleta siguen calculando los resultados.

## Colecciones reorganizadas

| Anterior | Implementado |
| --- | --- |
| configuracion_director/asistencia | configuracion/sistema.limiteFaltasDirector |
| preferencias_docente/uid | usuarios/uid.preferencias.trimestresPorGestion |
| avisos_docente_vistos y seguimientos_docente | usuarios/uid/seguimientos, por alumno, gestion y trimestre |
| comunicados_docentes | gestiones/gestionId/comunicados; destinatariosRol: [docente] |
| alumnos/alumnoId.advertenciaAsistencia | alumnos/alumnoId/avisos; conservar y cerrar el aviso anterior |
| Copias completas en usuarios, docentes y director | Un perfil en usuarios; listas consultadas por rol |
| usuarios_por_nombre | indice_accesos, con datos minimos para todos los roles |
| accesos_alumnos | Ya no se usa; vinculos privados en usuarios y alumnos |
| cursos y materias_escuela | catalogos/escolar/cursos y catalogos/escolar/materias |
| Registros academicos en la raiz | Subcolecciones de gestiones/gestionId |

Solo se guarda el estado personal que no se puede recalcular: que vio o atendio
el docente. Las alertas se calculan desde asistencia y actividades. avisosVistos
distingue pendiente de no presentado, conservando las claves y la logica actuales.
Su crecimiento se limita por alumno, gestion y trimestre. Ver un aviso no modifica
una nota ni acredita una entrega. Cerrar un aviso no borra la asistencia original.

El estado de matricula no sustituye el estado de cuenta. Retirar un alumno mantiene
sus notas e identidad, marca su matricula como retirado y desactiva identidad y
cuenta. Reactivar hace los cambios inversos en un solo lote. No se reactiva a un
alumno retirado mediante una importacion accidental.

## Activar en Firebase

1. Publicar el contenido completo de firestore.rules en Firestore > Reglas.
2. Crear el indice de grupo de colecciones avisos: gestionId ascendente y activa
   ascendente, alcance COLLECTION_GROUP. Tambien puede publicarse desde la CLI:

   ```powershell
   firebase deploy --only "firestore:rules,firestore:indexes" --project sistema-colegio-6b1b7
   ```

3. Abrir el cliente nuevo e ingresar con el administrador existente. La bienvenida
   muestra el ano escolar actual segun la fecha de Bolivia. Seleccionar ese ano y
   pulsar Confirmar ano y continuar; no hay un campo para escribir un ano arbitrario.
4. Esta accion crea configuracion, catalogos y el documento de la gestion solo si
   falta cada uno. Conserva el UID del administrador y completa su perfil privado
   si no existe. No borra datos ni crea alumnos o docentes automaticamente.
5. Cargar alumnos desde Admin > Alumnos: nombre completo y carnet opcional,
   separados con tabulador. Cada importacion admite hasta 200 filas. Despues,
   preparar sus accesos desde Crear accesos.
6. Crear docentes con el asistente y sus asignaciones. El alta guarda perfil,
   indice y asignaciones en una transaccion; si falla, revierte la cuenta Auth
   recien creada. Las credenciales temporales solo se entregan en pantalla.
7. Configurar horarios y crear la cuenta del director. La gestion activa determina las rutas
   de guardado y las caches. Cambiarla no copia matriculas, asignaciones ni notas
   del ano anterior. Para una gestion nueva deben prepararse sus propios registros.

El cliente requiere modelo 2 para abrir modulos academicos. Hasta prepararlo,
administracion solo puede entrar a su panel. Las reglas nuevas niegan las rutas
antiguas: publicar cliente y reglas de forma coordinada y actualizar las PWA.
Los datos anteriores, si todavia existen, no aparecen en el modelo 2. Su migracion
o borrado debe tratarse expresamente; no se incluye en este cambio.

## Gestion del ano escolar

- Confirmar el ano es el primer paso administrativo obligatorio. Hasta que exista
  el documento anual habilitado, los accesos de registro estan bloqueados y las
  URL directas regresan al Panel. Tampoco se cargan los contadores de esos modulos.
- Tras habilitar un ano nuevo, una guia animada muestra Alumnos, Docentes, Horarios
  y Director. Empezar a registrar abre Alumnos. El aviso pendiente se guarda solo
  durante la sesion, por administrador y ano, para sobrevivir la recarga inicial;
  al comenzar o cerrar la guia se elimina. No crea otra coleccion en Firestore ni
  se vuelve a abrir por navegar entre modulos o iniciar sesion nuevamente.
- La bienvenida se muestra solamente mientras el sistema no esta preparado.
  Despues, el panel indica la gestion activa sin un editor permanente ni un boton
  Cambiar gestion. Entrar al panel no crea ni modifica documentos.
- Cuando cambia el ano del calendario, aparece Iniciar seguido del nuevo ano.
  El administrador confirma antes de crearlo; no se cambia la gestion
  automaticamente. No se permite iniciar una gestion futura ni crear una
  gestion anterior inexistente.
- Si existen varias gestiones ya creadas, un selector compacto permite volver a
  ellas. Esta seleccion tambien requiere confirmacion y afecta la gestion activa
  de todo el sistema, no solo una vista de consulta del administrador.
- Al volver a un ano anterior se conservan sus datos. Al iniciar un nuevo ano no
  se copian matriculas, asignaciones, asistencias ni calificaciones anteriores.
- La lista de gestiones se consulta una vez por sesion y ano de calendario y se
  reutiliza al navegar. Una activacion invalida esa copia. Repetir la preparacion
  de una gestion ya activa y completa no realiza escrituras innecesarias.
- Estas opciones usan las rutas y permisos existentes del modelo 2. No necesitan
  reglas adicionales de Firestore.

## Implementacion y pruebas

- rutasFirestore.js: gestion activa, rutas y claves de cache versionadas.
- configuracionSistema.js: inicializacion explicita, sin escrituras al navegar.
- matriculas.js: une identidad y matricula para conservar las vistas existentes.
- parsearAlumnos.js: conserva nombres completos y separadores de Excel.
- Los servicios de docente, alumno, director y administrador usan las nuevas rutas.
- Notas, Boletin y Resumen siguen usando cache local hasta Cargar/Actualizar.
- Impresiones de notas y boletin usan la gestion activa, sin ano fijo.
- npm test verifica calculos, revision, alertas, identidad, parser y claves.
- npm run test:seguridad usa solo demo-sistema-seguridad, Firestore 8185 y Auth
  9195 en localhost; verifica permisos, altas, retiro, aislamiento y reversion.

La importacion verifica carnets repetidos y matriculas en otro curso antes de
guardar. revisionAlumnos funciona como control de concurrencia: si otra carga
termina, vuelve a leer y validar antes de guardar; el lote es atomico. Este control
coordina las importaciones del sistema, no escrituras manuales desde la consola.
Cambiar un CI de la identidad no cambia alumnoId
ni sus relaciones academicas. Los traslados dentro de una gestion requieren una
politica y una pantalla especificas antes de habilitarlos.

Los docentes conservan lectura de sus cursos y escritura de sus materias asignadas.
Los alumnos solo leen su identidad, matriculas, notas, asistencia y avisos propios,
y actividades de sus cursos autorizados en la gestion consultada. No pueden
cambiar rol, alumnoId, matricula o asignaciones. El estado de avisos es privado
del UID propietario. indice_accesos permite get para ingreso, pero no list publico.

Los permisos de documentos padre no se heredan automaticamente. Las reglas deben
declarar y validar las subcolecciones; nunca abrir permisos generales temporales.
El docente solo puede escribir en la gestion activa; una asignacion antigua no
habilita edicion historica. Ademas debe ser el ano actual del calendario boliviano,
con modelo 2 y documento anual habilitado por administracion. Administracion conserva permisos de mantenimiento.

## Habilitacion del ano escolar

- Solo administracion crea `gestiones/{ano}` y establece `configuracion/sistema`.
  La existencia del documento anual, con `ano` coincidente, habilita esa gestion;
  no se agrega un campo duplicado de habilitacion en cada registro.
- Los docentes no pueden registrar ni modificar asistencia, agenda, calificaciones,
  regularizacion, criterios SER, autoevaluacion o trimestre hasta que el administrador
  habilite el ano actual. Pueden seguir consultando y usando Cargar/Actualizar e imprimir.
- Al cambiar el ano del calendario no se crea ni activa una gestion automaticamente.
  El Panel de administracion ofrece habilitar el ano nuevo. Las gestiones anteriores
  solo se seleccionan si ya existen; para el docente son de consulta.
- Las reglas usan la hora del servidor con desfase UTC-4 para validar el ano,
  no el reloj del navegador. Tambien verifican el ano de las fechas academicas.
- Cada sesion observa solo `configuracion/sistema` y el documento de su gestion.
  Si administracion cambia la gestion, la pantalla solicita recargar y bloquea
  el registro con la configuracion anterior. No observa todas las notas o asistencias.
- `gestionHabilitada` es un estado temporal del cliente, calculado desde esos
  documentos; nunca se almacena en Firestore.
- El docente ve la gestion en la cabecera de todos sus modulos. Las fechas de
  consulta omiten el ano repetido; la base conserva ISO completo y los reportes
  impresos conservan su identificacion anual. Los campos de seleccion de fecha
  siguen siendo fechas completas para evitar ambiguedad.
- Un trimestre se aplica al estado local y al perfil solo despues de confirmar
  su guardado remoto. Si falla, se informa en el modal y se conserva el anterior.
- Publicar el archivo completo `firestore.rules` con el cliente actualizado.
  El bloqueo visual por si solo no sustituye las reglas del servidor.
- La expresion del ano usa las operaciones documentadas de
  [Timestamp](https://firebase.google.com/docs/reference/rules/rules.Timestamp_)
  y la conversion de [String](https://firebase.google.com/docs/reference/rules/rules.String).

## Referencias

- [Modelo de datos](https://firebase.google.com/docs/firestore/data-model)
- [Facturacion](https://firebase.google.com/docs/firestore/pricing)

Ordenar rutas no reduce lecturas automaticamente. Las consultas, la cache y los
listeners deben revisarse por separado. Borrar un documento padre no elimina sus
subcolecciones: una futura purga debe verificar y tratar la jerarquia expresamente.

## Proteccion de actividades calificadas

- La primera calificacion guarda `tieneCalificaciones: true` en la actividad,
  en el mismo lote de Firebase; las siguientes reutilizan esa proteccion. No se crean colecciones adicionales ni se cambian
  puntajes, pesos o estados de entrega.
- Despues de calificar se conservan curso, materia, trimestre, fecha, tipo,
  puntaje maximo y habilitacion de puntaje. Se puede corregir titulo y materiales.
- La interfaz no permite eliminar actividades con notas. Las actividades sin
  calificaciones siguen siendo editables y eliminables. No se borran notas en cascada.
- Para registros antiguos sin la marca, la edicion/eliminacion consulta como
  maximo una nota desde el servidor antes de decidir. Una correccion permitida
  incorpora la marca. No hay migracion masiva automatica.
- Las reglas impiden al docente quitar la marca, modificar los datos protegidos
  o borrar una actividad marcada. Administracion conserva mantenimiento autorizado.
- Publicar estas reglas completas junto con el cliente actualizado. Una version
  anterior que guarde notas sin la marca recibira permiso denegado; actualizar
  tambien las PWA antes de seguir calificando.
- Actualizar boletin carga alumnos una sola vez y reutiliza esa lista para los
  tres trimestres. Consultar o cambiar de trimestre sigue usando la copia local.

## Validacion de matriculas y puntajes

- El docente solo registra o modifica asistencia y notas de alumnos con matricula
  `activo` en ese curso y gestion. Una matricula `retirado` conserva su historial
  para consulta del docente y director, pero no acepta nuevas escrituras docentes.
  Administracion conserva sus permisos de mantenimiento.
- La nota normalizada debe coincidir con `valor / maximo * 100`, redondeada y con
  minimo de 35. Se rechazan escalas no positivas, valores fuera de escala y una
  `nota` que no corresponda al puntaje real. La autoevaluacion sobre 5 conserva su
  valor original y su peso de 5 puntos; no cambia el calculo trimestral.
- `Licencia` y `Permiso` se interpretan como el mismo estado (`permiso`) al leer y
  calcular, incluso desde copias locales antiguas. No se reescriben documentos
  existentes para normalizar los nombres. Totales, porcentaje, identificacion L e
  impresion de asistencia usan esta equivalencia.
- Estas validaciones requieren publicar el archivo completo de reglas actualizado.
  Las pruebas se ejecutaron solo en emuladores, no en la base de datos real.

## Organizacion del cliente docente

El controlador principal se divide en archivos por pantalla. La estructura y sus
responsabilidades estan descritas en [Modulos del docente](../codigo/modulos-docente.md).
El traslado conserva las rutas, las funciones de cada pantalla y su comportamiento;
Notas y Resumen siguen recuperando la copia local hasta pulsar Cargar/Actualizar.
