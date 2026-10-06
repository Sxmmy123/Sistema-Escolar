import assert from "node:assert/strict";
import test from "node:test";
import { parseStudentsBulk } from "../src/services/parsearAlumnos.js";
import { claveCache, establecerConfiguracion, rutaGestion, validarGestion } from "../src/services/rutasFirestore.js";

test("un apellido nunca se convierte en carnet", () => {
  assert.deepEqual(parseStudentsBulk("JUAN PEREZ MAMANI", "cuarto_a"), [{ nombre: "JUAN PEREZ MAMANI", ci: "", cursoId: "cuarto_a" }]);
});
test("pegar desde Excel conserva columnas y admite carnet numerico al final", () => {
  const alumnos = parseStudentsBulk(" Juan   Perez\t1234567\nMaria Quispe  7654321\nAlan Mamani 9988776", "cuarto_a");
  assert.deepEqual(alumnos.map((item) => [item.nombre, item.ci]), [["JUAN PEREZ", "1234567"], ["MARIA QUISPE", "7654321"], ["ALAN MAMANI", "9988776"]]);
});
test("se rechazan carnets y nombres sin carnet repetidos en una misma carga", () => {
  assert.throws(() => parseStudentsBulk("Juan\t12345\nMaria\t12345", "cuarto_a"), /repetido/);
  assert.throws(() => parseStudentsBulk("Juan Perez\nJuan Perez", "cuarto_a"), /repetido/);
  assert.throws(() => parseStudentsBulk("Juan\t12345\tOtro", "cuarto_a"), /fila/);
});
test("las rutas y caches incluyen gestion, usuario y version del modelo", () => {
  establecerConfiguracion({ gestionActivaId: "2026", versionModelo: 2 });
  assert.deepEqual(rutaGestion("actividades"), ["gestiones", "2026", "actividades"]);
  const anterior = claveCache("notas", "docente-a", "cuarto_a", "t2");
  establecerConfiguracion({ gestionActivaId: "2027", versionModelo: 2 });
  assert.notEqual(anterior, claveCache("notas", "docente-a", "cuarto_a", "t2"));
  assert.notEqual(claveCache("notas", "docente-a"), claveCache("notas", "docente-b"));
  assert.throws(() => rutaGestion("alumnos"), /desconocida/);
});
test("no se aceptan rutas arbitrarias como gestion", () => {
  assert.equal(validarGestion(2026), "2026");
  for (const valor of ["", "2026/actividades", "t2", 99]) assert.throws(() => validarGestion(valor));
});
