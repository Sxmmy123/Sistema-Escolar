import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { resetStudentPassword } from "../functions/student-password-core.js";
import { resetStudentPasswordAsAdmin } from "../src/services/adminStudentPassword.js";
import { changeTemporaryPassword } from "../functions/own-password-core.js";
import { firebasePasswordGateway, createAccessLimiter } from "../functions/access-core.js";
import { resetPasswordWithCode } from "../functions/recovery-password-core.js";
import { confirmarRestablecimiento, verificarEnlaceRestablecimiento } from "../src/services/restablecimientoContrasena.js";
import { passwordChangeBlocksAccess } from "../functions/password-policy.js";

const projectId = "demo-sistema-seguridad";
if (process.env.GCLOUD_PROJECT !== projectId || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") || !/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || "")) {
  throw new Error("Esta prueba solo puede ejecutarse con Authentication y Firestore emulados del proyecto demo-sistema-seguridad.");
}
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } = require("firebase-admin/app");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

test("administrador restablece en Authentication, alumno ingresa con temporal y luego cambia a personal sin perder datos", async () => {
  const serverApp = initializeAdmin({ projectId }, "prueba-reset-administrador");
  const auth = getAdminAuth(serverApp), db = getFirestore(serverApp);
  const apps = [];
  const webAuth = (name) => {
    const app = initializeApp({ projectId, apiKey: "demo-api-key" }, name); apps.push(app);
    const client = getAuth(app); connectAuthEmulator(client, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true }); return client;
  };
  const adminClient = webAuth("reset-admin"), studentClient = webAuth("reset-alumno");
  const adminUid = "admin-reset-emulador", pupilUid = "alumno-reset-emulador", pupilId = "alumno-reset-demo";
  try {
    await auth.createUser({ uid: adminUid, email: "admin-reset@example.test", password: "Administrador2026" });
    await auth.createUser({ uid: pupilUid, email: "alumno-reset@example.test", password: "Anterior2026" });
    const batch = db.batch();
    batch.set(db.doc(`usuarios/${adminUid}`), { rol: "admin", activo: true });
    batch.set(db.doc(`usuarios/${pupilUid}`), { rol: "alumno", alumnoId: pupilId, activo: true });
    batch.set(db.doc(`alumnos/${pupilId}`), { nombre: "ALUMNO DEMO", ci: "990001", authUid: pupilUid, activo: true });
    const grade = db.doc("gestiones/2026/calificaciones/reset-prueba");
    const attendance = db.doc("gestiones/2026/asistencias/reset-prueba");
    batch.set(grade, { alumnoId: pupilId, nota: 82 }); batch.set(attendance, { alumnoId: pupilId, estado: "presente" });
    await batch.commit();
    const before = (await db.getAll(db.doc(`usuarios/${pupilUid}`), db.doc(`alumnos/${pupilId}`), grade, attendance)).map((item) => item.data());
    await signInWithEmailAndPassword(adminClient, "admin-reset@example.test", "Administrador2026");
    await resetStudentPasswordAsAdmin({ student: { id: pupilId, authUid: pupilUid }, temporaryPassword: "TemporalSegura2026", adminPassword: "Administrador2026" }, {
      authClient: adminClient,
      call: async (data, token) => {
        const decoded = await auth.verifyIdToken(token, true);
        return resetStudentPassword({ auth: { uid: decoded.uid, token: decoded }, data }, { db, auth });
      }
    });
    await assert.rejects(signInWithEmailAndPassword(studentClient, "alumno-reset@example.test", "Anterior2026"));
    const temporary = await signInWithEmailAndPassword(studentClient, "alumno-reset@example.test", "TemporalSegura2026");
    assert.equal(temporary.user.uid, pupilUid);
    assert.equal((await db.doc(`usuarios/${pupilUid}`).get()).data().passwordChangeRequired, true);
    const token = await auth.verifyIdToken(await temporary.user.getIdToken());
    const gateway = firebasePasswordGateway("demo-api-key", (url, options) => fetch(url.replace("https://identitytoolkit.googleapis.com", `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com`), options));
    await changeTemporaryPassword({ auth: { uid: token.uid }, data: { currentPassword: "TemporalSegura2026", newPassword: "PersonalSegura2026" } }, { db, auth, ...gateway, takeLimit: createAccessLimiter(db, "127.0.0.1") });
    assert.equal((await db.doc(`usuarios/${pupilUid}`).get()).data().passwordChangeRequired, false);
    await signOut(studentClient);
    await assert.rejects(signInWithEmailAndPassword(studentClient, "alumno-reset@example.test", "TemporalSegura2026"));
    const personal = await signInWithEmailAndPassword(studentClient, "alumno-reset@example.test", "PersonalSegura2026");
    assert.equal(personal.user.uid, pupilUid);
    assert.deepEqual((await db.getAll(db.doc(`alumnos/${pupilId}`), grade, attendance)).map((item) => item.data()), before.slice(1));
    assert.equal(adminClient.currentUser.uid, adminUid);
  } finally {
    await Promise.all(apps.map(deleteApp)); await db.terminate(); await deleteAdmin(serverApp);
  }
});

test("recuperar por correo consume el enlace una sola vez y permite volver a entrar sin marca temporal ni perdida de registros", async () => {
  const serverApp = initializeAdmin({ projectId }, "prueba-recuperacion-correo");
  const auth = getAdminAuth(serverApp), db = getFirestore(serverApp);
  const app = initializeApp({ projectId, apiKey: "demo-api-key" }, "correo-recuperacion");
  const client = getAuth(app); connectAuthEmulator(client, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const uid = "docente-recuperacion-emulador", email = "correo.recuperacion@example.test";
  const profile = db.doc(`usuarios/${uid}`), assignment = db.doc(`gestiones/2026/asignaciones/${uid}`);
  const grade = db.doc("gestiones/2026/calificaciones/recuperacion-correo"), attendance = db.doc("gestiones/2026/asistencias/recuperacion-correo");
  try {
    await auth.createUser({ uid, email, password: "AnteriorTemporal2026" });
    const previousProfile = { rol: "docente", activo: true, usuario: "docentecorreo", passwordChangeRequired: true, passwordChangeVersion: "v1" };
    const batch = db.batch();
    batch.set(profile, previousProfile); batch.set(assignment, { cursos: { cuarto_a: { materias: ["matematica"] } } });
    batch.set(grade, { alumnoId: "alumno-correo", nota: 79 }); batch.set(attendance, { alumnoId: "alumno-correo", estado: "presente" });
    await batch.commit();
    const before = (await db.getAll(assignment, grade, attendance)).map(item => item.data());
    const link = new URL(await auth.generatePasswordResetLink(email)), code = link.searchParams.get("oobCode");
    assert.ok(code);
    const gateway = firebasePasswordGateway("demo-api-key", (url, options) => fetch(url.replace("https://identitytoolkit.googleapis.com", `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com`), options));
    const dependencies = { db, auth, ...gateway, takeLimit: createAccessLimiter(db, "127.0.0.1") };
    const confirm = (_auth, code, password) => resetPasswordWithCode({ accion: "restablecer", code, password }, dependencies);
    await assert.rejects(confirmarRestablecimiento({ auth: client, code, password: "123456", confirmation: "123456" }, confirm));
    assert.equal(await verificarEnlaceRestablecimiento(client, code), email);
    const lock = db.doc(`operaciones_clave/${uid}`);
    await lock.set({ id: "reset-administrativo", expiresAt: Date.now() + 60000 });
    await assert.rejects(confirm(client, code, "PersonalRecuperada2026"), { code: "resource-exhausted" });
    assert.equal(await verificarEnlaceRestablecimiento(client, code), email);
    await lock.delete();
    await confirmarRestablecimiento({ auth: client, code, password: "PersonalRecuperada2026", confirmation: "PersonalRecuperada2026" }, confirm);
    assert.deepEqual((await profile.get()).data(), { ...previousProfile, passwordChangeRequired: false });
    assert.equal(passwordChangeBlocksAccess((await profile.get()).data()), false);
    await assert.rejects(signInWithEmailAndPassword(client, email, "AnteriorTemporal2026"));
    assert.equal((await signInWithEmailAndPassword(client, email, "PersonalRecuperada2026")).user.uid, uid);
    await assert.rejects(confirm(client, code, "OtraClavePersonal2026"), { code: "not-found" });
    assert.deepEqual((await db.getAll(assignment, grade, attendance)).map(item => item.data()), before);
    assert.ok(!JSON.stringify((await profile.get()).data()).includes("PersonalRecuperada2026"));
    await signOut(client);
  } finally {
    await deleteApp(app); await db.terminate(); await deleteAdmin(serverApp);
  }
});
