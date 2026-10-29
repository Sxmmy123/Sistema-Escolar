# Sistema Colegio

Proyecto nuevo del sistema escolar construido con Vite, Tailwind, JavaScript y Firebase.

## Carpetas principales

- `src/`: codigo fuente de la aplicacion.
- `src/modules/`: pantallas por rol.
- `src/services/`: funciones que leen y guardan en Firebase.
- `src/firebase/`: configuracion e inicializacion de Firebase.
- `src/data/`: catalogos oficiales como cursos, materias, dias y periodos.
- `src/ui/`: componentes visuales compartidos.
- `public/`: archivos estaticos que Vite copia al compilar.
- `public/images/`: fondo de login, logo e iconos PWA.

## Archivos importantes

- `index.html`: entrada principal de Vite.
- `package.json`: comandos y dependencias.
- `vite.config.js`: configuracion de Vite.
- `tailwind.config.js`: configuracion de Tailwind.
- `postcss.config.js`: configuracion de estilos.
- `public/manifest.json`: datos para instalacion PWA.
- `firestore.rules`: reglas recomendadas para Firestore.
- `.gitignore`: evita subir carpetas generadas como `node_modules/` y `dist/`.

## Comandos

```bash
npm run dev
npm run build
```

## Notas

### Gemini en desarrollo y GitHub Pages

GitHub Pages solo aloja la web compilada. No ejecuta los endpoints locales de Vite (`/api/inicial/criterios` y `/api/inicial/informe`) ni lee el archivo `.env.local` de este equipo. En produccion, la web llama a `generarCriteriosInicial` y `generarInformeInicial` de Firebase Functions en `us-central1`.

Por eso subir el repositorio no activa Gemini. Se necesita publicar el backend por separado y despues habilitar los botones en la compilacion de la web:

1. Comprobar que Firebase tenga un plan compatible con Cloud Functions (Blaze). Activar la facturacion requiere una decision del propietario; este proyecto no la cambia automaticamente.
2. Ejecutar `npm ci --prefix functions`.
3. Configurar la clave solo en el servidor con `firebase functions:secrets:set GEMINI_API_KEY --project sistema-colegio-6b1b7`. El comando la solicita de forma interactiva; no ponerla en el comando, el navegador ni variables con prefijo `VITE_`.
4. Publicar el backend con `firebase deploy --only functions:informes-inicial --project sistema-colegio-6b1b7`. Al solicitar `GEMINI_MODEL`, indicar un modelo disponible para esa clave. Este codebase tambien contiene el restablecimiento administrativo de claves de alumnos.
5. Comprobar que ambas funciones de Gemini esten activas. En GitHub > Settings > Secrets and variables > Actions > Variables, crear la variable de repositorio `VITE_INFORMES_IA_HABILITADA` con valor `true`. Esta variable no contiene ninguna clave.
6. Ejecutar de nuevo `Deploy GitHub Pages` desde Actions. Probar la generacion con un docente de Inicial asignado a un curso.

El flujo de Pages ejecuta las pruebas y compila con esa variable; si no existe, la IA permanece desactivada. Para desactivarla otra vez, cambiarla a `false` y volver a publicar. Las funciones verifican la sesion, el curso y el trimestre antes de consultar Gemini; publicar la web no hace publica la clave.

Referencias: [Cloud Functions y despliegue](https://firebase.google.com/docs/functions/get-started), [configuracion y secretos](https://firebase.google.com/docs/functions/config-env).

### Restablecimiento de claves de alumnos

En Administracion > Alumnos > Alumnos, el icono de llave junto al acceso abre el restablecimiento. El administrador confirma su propia contrasena y asigna una clave temporal; el alumno puede cambiarla luego desde su cuenta. Las claves no se guardan en Firestore ni en auditoria.

Para desarrollo local:

1. Ejecutar `npm install --prefix functions`.
2. Guardar fuera del repositorio una credencial de servicio del mismo proyecto o una credencial de usuario autorizada (ADC) para desarrollo local. En este ultimo caso, `quota_project_id` debe coincidir con el proyecto Firebase.
3. Indicar su ruta absoluta en `GOOGLE_APPLICATION_CREDENTIALS` dentro de `.env.local` (sin prefijo `VITE_`) y reiniciar `npm run dev`.

La ruta `/api/admin/alumnos/restablecer-clave` solo acepta solicitudes del mismo origen desde este equipo, con token Firebase verificado y administrador autenticado recientemente. No se deben copiar credenciales privadas a `src/`, `public/` o GitHub.

En una web publicada se necesita desplegar la funcion `restablecerClaveAlumno` de `functions/index.js`, con Firebase Authentication y Firestore en el mismo proyecto. La pagina estatica por si sola no puede hacer operaciones administrativas de Authentication. El despliegue de Cloud Functions requiere un plan Firebase compatible; no se cambia la facturacion automaticamente.

- `dist/` no se edita manualmente. Se crea automaticamente con `npm run build`.
- `node_modules/` no se edita manualmente. Son dependencias instaladas.
- `frontend/` no pertenece al proyecto actual. Si Windows permite borrarla, se puede eliminar; actualmente esta vacia.
- El respaldo antiguo esta fuera de este proyecto, en `C:\Users\Sxmy\Documents\Programacion\APK asistncia Cole`.
