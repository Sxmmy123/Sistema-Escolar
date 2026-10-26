# Correo y recuperacion de acceso

## Nuevas cuentas del personal

Docentes, director y administradores requieren un correo real obligatorio. Ese correo se usa en Firebase Authentication y en `usuarios/{uid}.authEmail` y `correoRecuperacion`. El indice del usuario asignado apunta al mismo correo, por lo que conserva el ingreso por usuario o correo.

El correo debe ser distinto para cada cuenta. No se aceptan los alias internos del sistema en nuevos registros del personal. Esto valida su formato, no verifica que la persona controle la bandeja de entrada.

## Alumnos

Su registro no cambia: conserva la tabla, el correo opcional y las opciones actuales de contrasena. Si ya tienen un correo real asociado a Authentication pueden usar el mismo formulario de recuperacion. Los alias internos no tienen una bandeja donde recibir enlaces.

## Olvide mi contrasena

El login ofrece un formulario para usuario o correo. Firebase envia el enlace de restablecimiento a la direccion realmente asociada a Authentication; el cambio de clave se completa en la pagina segura incluida en el enlace. No se guardan contrasenas ni codigos de recuperacion en Firestore.

La respuesta publica es generica para no confirmar si una cuenta existe. Los fallos de conexion y limites de solicitudes permiten reintentar. La pantalla no envia nada automaticamente al abrirse y evita solicitudes simultaneas desde su boton.

Los enlaces se prueban en Auth Emulator, incluyendo su uso unico y la conservacion del UID y de las asignaciones. La entrega real en una bandeja de correo requiere una prueba manual; los emuladores no envian correos.

## Pagina de restablecimiento para docentes

`restablecer.html` es una entrada publica independiente con la identidad del colegio. Valida el enlace con Firebase antes de habilitar el formulario, pide y confirma la nueva contrasena y muestra el resultado. Un enlace vencido o usado remite a solicitar otro desde el ingreso. Los errores de conexion permiten reintentar.

No carga Firestore ni los modulos de los roles, no modifica la sesion abierta en otra pestana y no guarda contrasenas o codigos. Retira los parametros sensibles de la direccion y excluye estos enlaces de la cache del service worker.

El diseno se dirige a docentes, pero la plantilla de correo de Firebase es comun al proyecto: el enlace autoriza la recuperacion de su cuenta, no comprueba un rol en el navegador. Otros tipos de acciones de correo se derivan al manejador predeterminado de Firebase, sin usar destinos proporcionados por el enlace.

### Activacion despues de publicar

1. Publicar el proyecto y comprobar que existe `https://sxmmy123.github.io/Sistema-Escolar/restablecer.html`. Sin parametros debe mostrar que se necesita un enlace valido.
2. En Firebase Console, abrir Authentication > Plantillas > Restablecer contrasena > Personalizar URL de accion.
3. Configurar `https://sxmmy123.github.io/Sistema-Escolar/restablecer.html` como URL de accion. No usar localhost ni confundir esta opcion con la URL de continuacion.
4. Solicitar un enlace desde Olvide mi contrasena con una cuenta docente de prueba que tenga correo real. Comprobar recepcion, cambio de clave e ingreso con la nueva clave. Revisar tambien el correo no deseado.

La URL de la plantilla no se ha cambiado desde el codigo. Hasta publicar y realizar estos pasos, Firebase seguira abriendo el formulario que tenga configurado actualmente.

Referencia: [manejadores de acciones de correo personalizados de Firebase](https://firebase.google.com/docs/auth/custom-email-handler).

## Cuentas existentes y despliegue

No se cambian correos ni contrasenas existentes automaticamente. Una cuenta que aun usa un alias interno debe vincular un correo real antes de poder recibir el enlace; un valor guardado solamente en `correoRecuperacion` no basta. No es necesario borrar ni recrear la cuenta.

Esta funcion usa Firebase Authentication y no requiere abrir permisos de Firestore ni nuevas colecciones. Las plantillas de restablecimiento se administran en Firebase Authentication. No incluye un restablecimiento administrativo para cuentas sin correo.
