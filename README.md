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

### Inicial y Preinicial multigrado

Cuando una misma docente tiene asignados Inicial y Preinicial, su trabajo se presenta como un solo grupo: Panel, Asistencia, Actividades, Registro, Bitacora y Horario. Las actividades de cualquiera de ambos cursos son comunes al grupo y se crean una sola vez; conservan su identificador y curso de origen para no migrar ni duplicar documentos existentes.

Cada alumno conserva su matricula. Las asistencias, valoraciones de SER/SABER/HACER y comentarios se guardan con el curso real del alumno, aunque la actividad compartida tenga otro curso de origen. Seguimiento e Informe trimestral mantienen la seleccion de curso, y la generacion e impresion de informes usan solamente los alumnos y registros del curso seleccionado. Una docente con un solo curso conserva su funcionamiento individual; no se agrupa Primaria.

### Gemini en desarrollo y GitHub Pages

La demostracion publicada conecta directamente el navegador con Gemini, sin Cloud Functions ni Blaze. En GitHub > Settings > Secrets and variables > Actions > Variables se configuran `VITE_GEMINI_API_KEY` y `VITE_GEMINI_MODEL`. Al volver a publicar, Pages compila esos valores en la aplicacion y habilita la generacion de criterios e informes. No basta con modificar `.env.local` en el equipo.

Esta modalidad fue elegida para demostracion: la clave se puede extraer del navegador y consumir su cuota. No da acceso administrativo a Firebase. Los datos academicos conservan sus reglas, la docente revisa los criterios y los informes siguen siendo borradores de hasta 200 caracteres hasta que ella los apruebe.

Para compilar localmente con conexion directa se usan las mismas variables `VITE_GEMINI_API_KEY` y `VITE_GEMINI_MODEL`. Sin clave de navegador, el desarrollo conserva los endpoints locales de Vite con `GEMINI_API_KEY`, `GEMINI_MODEL` y `VITE_INFORMES_IA_HABILITADA=true` en `.env.local`.

#### Alternativa con clave privada en servidor

Si se retira `VITE_GEMINI_API_KEY`, se puede usar el backend preparado en Firebase. Pages no ejecuta los endpoints locales de Vite. Para esa alternativa se despliegan `generarCriteriosInicial` y `generarInformeInicial` en `us-central1`:

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
