import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { resetStudentPassword } from "../functions/student-password-core.js";
import { resetStudentPasswordAsAdmin } from "../src/services/adminStudentPassword.js";
import { changeOwnPassword } from "../src/services/accountSettings.js";

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
    await resetStudentPasswordAsAdmin({ student: { id: pupilId, authUid: pupilUid }, temporaryPassword: "Temporal2026", adminPassword: "Administrador2026" }, {
      authClient: adminClient,
      call: async (data, token) => {
        const decoded = await auth.verifyIdToken(token, true);
        return resetStudentPassword({ auth: { uid: decoded.uid, token: decoded }, data }, { db, auth });
      }
    });
    await assert.rejects(signInWithEmailAndPassword(studentClient, "alumno-reset@example.test", "Anterior2026"));
    const temporary = await signInWithEmailAndPassword(studentClient, "alumno-reset@example.test", "Temporal2026");
    assert.equal(temporary.user.uid, pupilUid);
    await changeOwnPassword({ currentPassword: "Temporal2026", newPassword: "Personal2026", confirmPassword: "Personal2026" }, { authClient: studentClient });
    await signOut(studentClient);
    await assert.rejects(signInWithEmailAndPassword(studentClient, "alumno-reset@example.test", "Temporal2026"));
    const personal = await signInWithEmailAndPassword(studentClient, "alumno-reset@example.test", "Personal2026");
    assert.equal(personal.user.uid, pupilUid);
    assert.deepEqual((await db.getAll(db.doc(`usuarios/${pupilUid}`), db.doc(`alumnos/${pupilId}`), grade, attendance)).map((item) => item.data()), before);
    assert.equal(adminClient.currentUser.uid, adminUid);
  } finally {
    await Promise.all(apps.map(deleteApp)); await db.terminate(); await deleteAdmin(serverApp);
  }
});
