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

- `dist/` no se edita manualmente. Se crea automaticamente con `npm run build`.
- `node_modules/` no se edita manualmente. Son dependencias instaladas.
- `frontend/` no pertenece al proyecto actual. Si Windows permite borrarla, se puede eliminar; actualmente esta vacia.
- El respaldo antiguo esta fuera de este proyecto, en `C:\Users\Sxmy\Documents\Programacion\APK asistncia Cole`.
