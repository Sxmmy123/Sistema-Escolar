# Reemplazo de docentes por trimestre

En Administracion > Docentes, usar Reemplazo de docente, seleccionar al anterior y el segundo o tercer trimestre de inicio. Ingresar los datos de la nueva cuenta, revisar sus cursos y materias heredados y confirmar. No se trasladan registros ni se comparte una cuenta.

La transaccion crea el perfil, indice de acceso y asignacion del nuevo docente y limita los trimestres del anterior. Si falla, se revierte la nueva cuenta de Authentication. Si otro administrador ya reemplazo al mismo docente o cambio su asignacion, se cancela la operacion. Ambos docentes quedan activos hasta que administracion decida lo contrario.

Ejemplo en `gestiones/2026/asignaciones`:

```text
docenteA
  cursos: { cuarto_a: { materias: [...] } }
  trimestres: [t1]
  reemplazadoPorUid: docenteB
docenteB
  cursos: { cuarto_a: { materias: [...] } }
  trimestres: [t2, t3]
  reemplazoDeUid: docenteA
  trimestreInicio: t2
```

Las asignaciones anteriores sin `trimestres` conservan acceso a los tres. No necesitan migracion. Un segundo relevo puede dejar A en primero, B en segundo y C en tercero. Este flujo es un reemplazo completo por trimestre; no cubre sustituciones temporales, a mitad de trimestre ni solo de algunas materias.

El nuevo docente consulta la boleta anterior, pero las reglas impiden editar, borrar o reclasificar notas y asistencias de trimestres ajenos. El boletin sigue calculandose por curso, alumno, materia y trimestre, independientemente del autor. Los horarios no se duplican: pertenecen al curso. Inicial y Preinicial siguen separados y conservan sus registros cualitativos privados por autor.

Deshabilitar con el switch y confirmar cambia `usuarios/{uid}.activo` a `false`. No elimina Authentication, notas, actividades ni asistencias. Las reglas bloquean el acceso y la aplicacion cierra la sesion docente abierta. Volver a habilitar conserva sus limites por trimestre.

Es necesario publicar la version actualizada de `firestore.rules` antes de utilizar esta funcion en produccion. Sin esas reglas, la interfaz por si sola no garantiza el aislamiento de los trimestres. Las pruebas de seguridad usan exclusivamente emuladores.
