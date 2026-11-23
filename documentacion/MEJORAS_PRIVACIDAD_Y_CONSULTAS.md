# Privacidad, consultas completas y despliegue

## Cambios

- Los expedientes cacheados usan sessionStorage, con vigencia de cinco minutos. Salir borra las copias academicas antiguas de localStorage y sessionStorage; conserva tema y los identificadores de avisos vistos.
- Las respuestas iniciadas antes de cerrar sesion no pueden repoblar las caches.
- El acceso por usuario o CI resuelve el correo en el servidor solo despues de comprobar la contrasena existente. El navegador termina el ingreso con Firebase Authentication, conservando UID y el proveedor de contrasena.
- La recuperacion por usuario envia el correo desde el servidor y siempre devuelve una respuesta generica. Los alias internos sin buzon no reciben mensajes.
- El servicio aplica limites atomicos por IP y usuario. Los contadores almacenan hashes e informacion de ventana, nunca claves ni correos.
- El indice de acceso queda restringido a administracion y al propio titular autenticado.
- Auditoria filtra fecha y tipo en Firestore, pagina por cursor y distingue coincidencias de texto de movimientos revisados. Cargar mas conserva el cursor aunque una pagina no contenga coincidencias.
- La tendencia de direccion obtiene siete fechas distintas y lee los dias completos, sin el antiguo corte de 800 documentos. Esto puede leer mas documentos que el corte anterior, pero evita totales parciales.
- Preparar un informe de Gemini consulta solo los registros del alumno, curso, docente y trimestre elegidos. No reduce por si solo los tokens de Gemini: el contenido enviado sigue siendo el expediente pertinente del alumno.
- El registro de iconos importa un subconjunto explicito de Lucide, no todo el catalogo.

## Orden de publicacion

1. Ejecutar npm test, npm run test:seguridad y npm run build.
2. Desplegar primero functions:accesoEscolar y firestore:indexes en sistema-colegio-6b1b7. Esperar que los indices terminen de construirse.
3. Comprobar el nuevo servicio con una cuenta autorizada, sin imprimir credenciales. Una clave incorrecta no debe revelar el correo. No enviar correos de recuperacion reales sin una prueba autorizada.
4. Publicar la interfaz actualizada en GitHub Pages y esperar el despliegue correcto. Verificar acceso por usuario y por correo.
5. Publicar firestore:rules, incluyendo los controles de auditoria y el cierre del indice. No cerrar el indice antes de verificar el nuevo acceso.
6. Desplegar tambien las funciones actualizadas de informes y restablecimiento si se desea aplicar en produccion el filtrado de informes y la politica de claves del servidor.
7. Recargar las pestanas anteriores para que no sigan usando el flujo antiguo.

No ejecutar borrados de cuentas, cambios de claves existentes ni importaciones academicas para publicar estos cambios. No incluir .env, JSON administrativos ni credenciales locales en Git.

## Gemini y claves temporales

- Se retiro el modo directo y las variables VITE de Gemini del proceso de compilacion. La pagina invoca funciones autenticadas; el desarrollo local usa sus rutas de servidor.
- Las claves que estuvieron en compilaciones antiguas deben rotarse. Retirarlas del navegador no revoca copias anteriores. Antes de rotar, comprobar si otras aplicaciones usan la misma clave.
- Las altas nuevas y los restablecimientos administrativos marcan passwordChangeRequired. Las cuentas existentes con clave debil se marcan al ingresar por usuario o correo, sin cambiar su contrasena.
- Las sesiones antiguas no se marcan masivamente: la deteccion de una clave debil ocurre en el siguiente ingreso por el formulario. Authentication no permite consultar la clave anterior.
- La pantalla obligatoria no abre modulos privados hasta completar el cambio. Firestore bloquea los permisos academicos de los perfiles pendientes; estos pueden leer su propio perfil y configuracion general, pero no quitarse la marca desde el navegador.
- cambiarClaveTemporal comprueba la clave actual contra Authentication, exige una nueva diferente de 12 a 128 caracteres y serializa los cambios por cuenta con el restablecimiento administrativo.
- No se guardan claves en Firestore, caches ni auditoria. Un identificador de operacion y vencimiento impide cambios simultaneos; la marca se limpia solo al terminar.
- Si Authentication cambia la clave pero Firestore falla al confirmar, la marca permanece y el mensaje indica volver a ingresar con la nueva clave. No se finge un exito ni se abre el panel.
- La pantalla muestra el acierto y cierra la sesion tras el cambio; el siguiente ingreso usa la nueva clave. El formulario normal de Cuenta tambien exige el minimo de 12 caracteres.

Publicar primero cambiarClaveTemporal, despues la interfaz, luego accesoEscolar/restablecerClaveAlumno y las reglas. No desplegar la deteccion automatica antes de que la pagina pueda resolverla. No probar cambios de claves reales sin autorizacion; el ciclo completo se verifica en emuladores.
