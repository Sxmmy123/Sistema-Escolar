# Activar los accesos protegidos

## Estado de esta implementacion

Los cambios estan preparados y probados en la carpeta local. No se han creado
cuentas nuevas de alumnos en el proyecto real ni enviado estos cambios a GitHub.
Las reglas de `firestore.rules` ya fueron publicadas y verificadas en la consola
del proyecto `sistema-colegio-6b1b7` despues de vaciar los datos de prueba.
La validacion local paso 31 pruebas de logica, 20 de seguridad y la compilacion.

## Inicio desde cero

Los datos de prueba fueron eliminados con autorizacion del administrador. Se
conservo en Authentication la cuenta `smichmev@gmail.com`, UID
`6GJAf3WiBaVBXypSDDR1xKLalnq2`. No es necesario migrar datos anteriores.

1. Entrar como administrador al cliente local. Esta cuenta conserva el acceso
   aunque Firestore no tenga todavia su perfil.
2. Registrar los cursos, materias y docentes con sus asignaciones.
3. En Alumnos, seleccionar el curso e importar los nombres y CI reales.
4. Abrir **Crear accesos**, revisar la seleccion y confirmar. Importar alumnos no
   crea automaticamente sus credenciales.
5. Descargar **Credenciales privadas** y entregar cada acceso solo a su familia.
   Las contrasenas temporales no se guardan en documentos de Firestore ni en cache.
6. El alumno ingresa con su usuario y contrasena desde cualquier dispositivo.
   Firebase autentica su cuenta y el sistema toma su identidad del perfil privado,
   no de una identificacion guardada en el navegador.
7. Publicar el cliente actualizado y comprobar un acceso real antes de
   entregar el enlace de GitHub Pages a las familias.

El cliente nuevo exige Firebase Authentication para todos los roles. Un alumno con
el acceso anterior no puede entrar en este cliente hasta que administracion prepare
su cuenta. En este reinicio no quedan cuentas antiguas de alumnos que migrar.

## Que cambia

- El alumno entra con una cuenta de Firebase Authentication y un perfil privado en
  `usuarios/{uid}` que indica su `alumnoId`.
- La identidad no se acepta desde `sessionStorage` ni desde el navegador del alumno.
- El alumno solo puede leer su registro, notas, asistencias y actividades de su curso.
- El docente consulta sus cursos completos para el boletin, pero solo escribe
  calificaciones y actividades de las materias que tiene asignadas.
- El director conserva las consultas generales y sus comunicados y advertencias.
- Retirar o habilitar un alumno actualiza su registro y acceso en un mismo lote.
- No cambian los identificadores de los alumnos, actividades, notas ni asistencias,
  ni los calculos academicos.

## Orden para una migracion con datos anteriores

Esta seccion solo aplica a otro entorno que conserve alumnos y accesos antiguos.
Para el proyecto reiniciado, seguir Inicio desde cero.

1. Respaldar los datos reales antes de cualquier migracion. Este cambio no crea un
   respaldo automaticamente.
2. Entrar como administrador al cliente local. En Alumnos, elegir un curso y abrir
   **Crear accesos**. Abrir el modal no modifica datos.
3. Elegir los alumnos pendientes. Las cuentas nuevas reciben una contrasena temporal
   aleatoria; las cuentas ya vinculadas no cambian de contrasena.
4. El administrador confirma **Crear accesos**. Descargar las credenciales
   privadas y entregarlas a cada familia de manera individual. No publicar esa
   descarga, enviarla al repositorio ni compartirla con todo el curso.
5. Repetir por todos los cursos activos. Comprobar desde el cliente local el ingreso
   de un alumno por curso y que su boleta y asistencia sean las mismas. La opcion de
   cambiar la contrasena ya existente en Cuenta sigue disponible.
6. Revisar las asignaciones docentes antes de publicar las reglas. La forma utilizada
   por el administrador actual es `asignaciones/{uid}.cursos` como mapa:

   ```json
   {
     "cursos": {
       "cuarto_a": { "materias": ["matematica", "lenguaje"] }
     }
   }
   ```

   Las reglas tambien admiten el mapa antiguo `asignaciones` y materias como listas
   o mapas de valores booleanos. No admiten cursos como una lista de objetos.
   Si existe ese formato antiguo, revisar y guardar las mismas asignaciones desde
   administracion antes del despliegue. No cambiar materias ni cursos por accidente.
7. Publicar el cliente actualizado y verificar el acceso de alumno, docente,
   director y administrador. Todavia no publicar reglas restrictivas si quedan
   alumnos sin una cuenta autenticada.
8. Publicar el archivo completo `firestore.rules` en el proyecto correcto. Comprobar
   Autoevaluacion, Calificar, Finalizar revision, Notas, Boletin, Asistencia,
   regularizacion, comunicados y advertencias con cuentas de cada rol.

## Datos de acceso

La preparacion conserva el usuario del alumno y agrega `authUid` y `authEmail` a su
registro. Crea el perfil autenticado y reemplaza el documento de `accesos_alumnos`
por metadatos sin contrasena. El mapa publico de acceso solo contiene `uid` y
`authEmail`; no contiene notas, nombres del alumno ni contrasenas.

Las nuevas claves solo permanecen en memoria mientras esta abierto el modal y en
la descarga privada que decide realizar el administrador. No se guardan en
Firestore, localStorage, auditoria ni en archivos del proyecto. Firebase
Authentication se encarga del almacenamiento de credenciales.

Si ya existe una cuenta con ese usuario pero pertenece a otra persona, la migracion
se detiene sin sobrescribirla. Si falla la vinculacion, se intenta eliminar solo la
cuenta nueva creada por ese intento. Si no se puede revertir, el modal pide revisar
Authentication antes de volver a intentarlo. No borrar ni reiniciar cuentas antiguas
para resolver un conflicto sin comprobar primero a quien pertenecen.

Las cuentas creadas con una clave temporal no fuerzan automaticamente un cambio en
el siguiente acceso; la familia debe cambiarla desde Cuenta. Implementar un cambio
obligatorio seria un paso adicional.

## Pruebas sin tocar Firebase real

```powershell
npm test
npm run build
npm run test:seguridad
```

Las pruebas de seguridad requieren Firebase CLI y Java compatibles. Utilizan los
emuladores locales de Auth y Firestore con el proyecto ficticio
`demo-sistema-seguridad`, puertos 9194 y 8184. El propio archivo de pruebas rechaza
otro proyecto o servidores que no sean esos emuladores. La prueba de migracion crea
cuentas ficticias, no cuentas reales.

En Windows con certificados corporativos, Node puede necesitar el almacen de
certificados del sistema; no desactivar la validacion TLS:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
$env:FIREBASE_EMULATORS_PATH = Join-Path (Get-Location) '.emuladores'
npm run test:seguridad
```

`.emuladores/`, `.firebase/`, los logs y `accesos-privados-*.txt` estan excluidos de Git.

## Limites pendientes

Esta etapa no agrega un servicio de administracion en el servidor, App Check ni
limites de frecuencia. El alta de cuentas utiliza la aplicacion secundaria de Auth
que ya utiliza el sistema para docentes; los perfiles y la vinculacion siguen
protegidos por permisos de administrador. Las consultas del director y la division
del controlador grande del docente son trabajos separados, no parte de esta
migracion.
