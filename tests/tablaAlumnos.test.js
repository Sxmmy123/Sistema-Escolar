import assert from "node:assert/strict";
import test from "node:test";
import { generateStudentPin, initialStudentPassword, normalizeStudentSex } from "../src/services/identidadAlumno.js";
import { hasStudentData, newStudentRow, pasteStudentCells, sortStudentsByName, validateStudentRows } from "../src/services/tablaAlumnos.js";
import { registrarTablaAlumnos } from "../src/services/registroAlumnos.js";

test("la clave inicial sigue el CI y tambien admite 123456 o seis digitos", () => {
  assert.equal(initialStudentPassword(" 06952974 "), "06952974");
  assert.equal(initialStudentPassword("6952974", "default"), "123456");
  assert.equal(initialStudentPassword(""), "123456");
  assert.match(initialStudentPassword("6952974", "random"), /^\d{6}$/);
  assert.equal(generateStudentPin({ getRandomValues: (array) => { array[0] = 42; } }), "000042");
  assert.throws(() => generateStudentPin({}), /aleatorias/);
  assert.equal(hasStudentData(newStudentRow()), false);
});

test("pegar nombre y CI completa la contrasena sin perder ceros iniciales", () => {
  const source = [newStudentRow()];
  const rows = pasteStudentCells(source, "Alan Quispe\t06952974\r\nBanesa Lorena\t6952975\r\n", 0, 0);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => [row.nombre, row.ci, row.password]), [["Alan Quispe", "06952974", "06952974"], ["Banesa Lorena", "6952975", "6952975"]]);
  assert.equal(source[0].nombre, "");
  assert.equal(validateStudentRows(rows).errors.size, 0);
});

test("las columnas pegadas reconocen encabezados, comillas y correo opcional", () => {
  const rows = pasteStudentCells([newStudentRow()], 'Nombre completo\tCI\tContrasena\tCorreo\n"Alan ""A"" Quispe"\t6952974\t654321\tALAN@EXAMPLE.COM\nBanesa Lorena\t6952975\t\t', 0, 0);
  assert.equal(rows[0].nombre, 'Alan "A" Quispe');
  assert.equal(rows[0].password, "654321");
  assert.equal(rows[0].autoPassword, false);
  assert.equal(rows[1].password, "6952975");
  assert.equal(validateStudentRows(rows).entries[0].correo, "alan@example.com");
});

test("pegar desde CI conserva el nombre y no cambia una clave manual", () => {
  const row = { ...newStudentRow(), nombre: "ALAN QUISPE", password: "abc123", autoPassword: false };
  const rows = pasteStudentCells([row], "6952974\n6952975", 0, 1);
  assert.equal(rows[0].nombre, "ALAN QUISPE");
  assert.equal(rows[0].password, "abc123");
  assert.equal(rows[1].password, "6952975");
  assert.ok(validateStudentRows(rows).errors.has(rows[1].key));
});

test("no permite sobrescribir filas guardadas, desbordar columnas o superar 200 filas", () => {
  assert.throws(() => pasteStudentCells([{ ...newStudentRow(), saved: true }], "Alumno\t1234567", 0, 0), /guardada/);
  assert.throws(() => pasteStudentCells([newStudentRow()], "a\tb\tc\td\te\tf", 0, 0), /columnas/);
  assert.throws(() => pasteStudentCells([newStudentRow()], "a\nb", 199, 0), /200/);
  assert.throws(() => pasteStudentCells([newStudentRow()], '"campo incompleto', 0, 0), /comillas/);
});

test("valida carnets, correos duplicados y claves antes de escribir", () => {
  const rows = [
    { ...newStudentRow(), nombre: "Alan Quispe", ci: "ABC123", correo: "alan@example.com" },
    { ...newStudentRow(), nombre: "Banesa Lorena", ci: "abc123", correo: "ALAN@example.com" },
    { ...newStudentRow(), nombre: "Mauro Solis", ci: "CI/INVALIDO", correo: "correo-mal", password: "12" }
  ];
  const result = validateStudentRows(rows);
  assert.equal(result.errors.size, 3);
  assert.match(result.errors.get(rows[0].key).join(" "), /CI repetido.*correo/);
  assert.match(result.errors.get(rows[2].key).join(" "), /CI valido.*6 caracteres.*correo/);
});

test("la lista alfabetica no modifica los IDs ni numeros de agregacion", () => {
  const students = [{ id: "enrique", nombre: "Enrique Solomeo", numeroAgregacion: 1 }, { id: "banesa", nombre: "Banesa Lorena", numeroAgregacion: 2 }, { id: "mauro", nombre: "Mauro Solis", numeroAgregacion: 3 }, { id: "alan", nombre: "Alan Quispe", numeroAgregacion: 4 }];
  assert.deepEqual(sortStudentsByName(students).map((student) => student.id), ["alan", "banesa", "enrique", "mauro"]);
  assert.equal(sortStudentsByName(students)[0].numeroAgregacion, 4);
  assert.equal(students[0].id, "enrique");
});

test("registro tabular envia cada clave a Authentication, nunca al registro academico", async () => {
  const rows = pasteStudentCells([newStudentRow()], "Alan Quispe\t6952974\t\talan@example.com\tMasculino\nBanesa Lorena\t6952975\t654321\t\tF", 0, 0);
  const course = { id: "cuarto_a" }, calls = [];
  const results = await registrarTablaAlumnos(course, rows, {
    importar: async (selected, entries) => {
      assert.equal(selected, course);
      assert.ok(entries.every((entry) => !("password" in entry) && !("key" in entry)));
      assert.deepEqual(entries.map((entry) => entry.sexo), ["M", "F"]);
      return entries.map((entry, index) => ({ ...entry, id: `student-${index}` }));
    },
    crearAcceso: async (student, selected, clients, options) => { calls.push(options); return { uid: `uid-${student.id}`, created: true, authEmail: options.email }; }
  });
  assert.deepEqual(calls.map((options) => options.temporaryPassword), ["6952974", "654321"]);
  assert.equal(calls[0].email, "alan@example.com");
  assert.equal(results[0].success, true);
  assert.equal(results[0].student.authUid, "uid-student-0");
  assert.equal(results[1].student.sexo, "F");
});

test("sexo admite selectores y pegado con encabezados sin romper cargas anteriores", () => {
  assert.equal(normalizeStudentSex(" femenino "), "F");
  assert.equal(normalizeStudentSex("m"), "M");
  assert.equal(normalizeStudentSex(""), "");
  const rows = pasteStudentCells([newStudentRow()], "Nombre\tCI\tSexo\tCorreo\nAlan Quispe\t6952974\tMasculino\t\nBanesa Lorena\t6952975\tFemenino\tbanesa@example.com", 0, 0);
  assert.equal(validateStudentRows(rows).errors.size, 0);
  assert.deepEqual(rows.map((row) => row.sexo), ["M", "F"]);
  assert.equal(rows[1].correo, "banesa@example.com");
  assert.equal(rows[0].password, "6952974");
  const legacy = pasteStudentCells([newStudentRow()], "Alumno\t6952976\t654321\talumno@example.com", 0, 0);
  assert.equal(legacy[0].sexo, "");
  assert.equal(validateStudentRows(legacy).errors.size, 0);
});

test("sexo invalido queda marcado y no se asigna por el nombre", async () => {
  const rows = pasteStudentCells([newStudentRow()], "Nombre\tCI\tSexo\nAlumno\t6952974\tINVALIDO", 0, 0);
  assert.match(validateStudentRows(rows).errors.get(rows[0].key).join(" "), /Sexo/);
  await assert.rejects(registrarTablaAlumnos({ id: "cuarto_a" }, rows, {
    importar: () => assert.fail("No debe escribir"), crearAcceso: () => assert.fail("No debe crear")
  }), /Corrige/);
  assert.equal(hasStudentData({ ...newStudentRow(), sexo: "F" }), true);
});

test("las cuentas existentes no cambian su clave y un fallo queda pendiente sin duplicar", async () => {
  const rows = pasteStudentCells([newStudentRow()], "Alumno A\t6952974\nAlumno B\t6952975", 0, 0);
  let creations = 0;
  const results = await registrarTablaAlumnos({ id: "cuarto_a" }, rows, {
    importar: async (course, entries) => entries.map((entry, index) => ({ ...entry, id: `${index}`, ...(index === 0 ? { authUid: "ya-existe" } : {}) })),
    crearAcceso: async () => { creations++; throw new Error("Cuota excedida"); }
  });
  assert.equal(creations, 1);
  assert.equal(results[0].success, true);
  assert.equal(results[0].password, "");
  assert.equal(results[1].success, false);
  assert.equal(results[1].error, "Cuota excedida");
  assert.equal(results[1].student.id, "1");
});

test("datos invalidos y sesiones cerradas no comienzan a registrar", async () => {
  for (const [rows, isSessionActive] of [[[newStudentRow()], () => true], [pasteStudentCells([newStudentRow()], "Alumno\t6952974", 0, 0), () => false]]) {
    await assert.rejects(registrarTablaAlumnos({ id: "cuarto_a" }, rows, {
      importar: () => assert.fail("No debe escribir"), crearAcceso: () => assert.fail("No debe crear"), isSessionActive
    }));
  }
});
