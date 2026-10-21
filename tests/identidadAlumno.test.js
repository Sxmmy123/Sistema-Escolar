import assert from "node:assert/strict";
import test from "node:test";
import { generateStudentPassword, normalizeStudentAccessKey, studentIdFromProfile, studentPasswordForNewAccess } from "../src/services/identidadAlumno.js";

test("la identidad del alumno viene de un perfil autenticado, activo y vinculado", () => {
  assert.equal(studentIdFromProfile({ rol: "alumno", activo: true, alumnoId: "alumno-a" }), "alumno-a");
  for (const profile of [{}, { rol: "docente", activo: true, alumnoId: "a" }, { rol: "alumno", activo: false, alumnoId: "a" }, { rol: "alumno", activo: true }]) {
    assert.throws(() => studentIdFromProfile(profile));
  }
});

test("los usuarios se normalizan sin cambiar la identidad academica", () => {
  assert.equal(normalizeStudentAccessKey(" 123 AbC "), "123abc");
  assert.equal(normalizeStudentAccessKey(null), "");
});

test("las contrasenas nuevas usan aleatoriedad criptografica y no el CI", () => {
  const first = generateStudentPassword();
  assert.equal(first.length, 16);
  assert.match(first, /^[A-Za-z2-9!@#$]+$/);
  assert.notEqual(first, generateStudentPassword());
  assert.throws(() => generateStudentPassword({}), /seguras/);
});

test("la contrasena temporal tiene suficiente longitud sin depender de datos del alumno", () => {
  const password = generateStudentPassword();
  assert.equal(password.length, 16);
  assert.notEqual(password, "12345678");
});

test("las cuentas nuevas usan 123456 por defecto y permiten una clave inicial distinta", () => {
  assert.equal(studentPasswordForNewAccess("abc123"), "abc123");
  assert.equal(studentPasswordForNewAccess(" Clave temporal "), " Clave temporal ");
  assert.equal(studentPasswordForNewAccess(), "123456");
  assert.equal(studentPasswordForNewAccess(""), "123456");
  for (const value of ["12345", 123456, null]) {
    assert.throws(() => studentPasswordForNewAccess(value), /al menos 6 caracteres/);
  }
});
