import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { generarConGemini, validarAccesoInforme, validarAccesoInicial } from "./informe-core.js";
import { generarCriteriosGemini, validarAccesoActividad, validarBorradorCriterios } from "./criterios-core.js";

initializeApp();
const apiKey = defineSecret("GEMINI_API_KEY");
const model = defineString("GEMINI_MODEL");
const db = getFirestore();
export const generarCriteriosInicial = onCall({ region: "us-central1", secrets: [apiKey], timeoutSeconds: 90, maxInstances: 2, concurrency: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesion para generar criterios.");
  const input = request.data, uid = request.auth.uid;
  let draft;
  if (input?.borrador) {
    try { draft = validarBorradorCriterios(input.borrador); } catch (error) { throw new HttpsError("invalid-argument", error.message); }
    if (input.actividadId) throw new HttpsError("invalid-argument", "Selecciona un borrador o una actividad guardada.");
  }
  if (!input || !/^20\d{2}$/.test(input.gestionId || "") || !draft && (typeof input.actividadId !== "string" || !input.actividadId || input.actividadId.includes("/"))) throw new HttpsError("invalid-argument", "Selecciona una actividad valida.");
  const path = `gestiones/${input.gestionId}`;
  const [profile, system, annual, assignment, activity] = await db.getAll(db.doc(`usuarios/${uid}`), db.doc("configuracion/sistema"), db.doc(path), db.doc(`${path}/asignaciones/${uid}`), ...(draft ? [] : [db.doc(`${path}/actividades_inicial/${input.actividadId}`)]));
  try {
    validarAccesoInicial({ uid, input, profile: profile.data(), config: { ...system.data(), gestionHabilitada: annual.data()?.ano === Number(input.gestionId) }, assignment: assignment.data(), year: new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/La_Paz" }).format(new Date()) });
    if (!draft) validarAccesoActividad(activity.data(), uid, input);
  } catch { throw new HttpsError("permission-denied", "No puedes generar criterios para esta actividad."); }
  const limit = db.doc(`usuarios/${uid}/limites_ia/criterios`), now = Date.now(), day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  await db.runTransaction(async (tx) => {
    const old = (await tx.get(limit)).data() || {}, count = old.dia === day ? old.cantidad || 0 : 0;
    if (count >= 60 || now - (old.ultimaSolicitud?.toMillis?.() || 0) < 30000) throw new HttpsError("resource-exhausted", "Espera 30 segundos entre solicitudes. Limite diario: 60.");
    tx.set(limit, { dia: day, cantidad: count + 1, ultimaSolicitud: Timestamp.fromMillis(now) });
  });
  try { return await generarCriteriosGemini({ activity: draft || activity.data(), apiKey: apiKey.value(), model: model.value() }); }
  catch { throw new HttpsError("unavailable", "Gemini no pudo proponer criterios. Intenta mas tarde."); }
});
export const generarInformeInicial = onCall({ region: "us-central1", secrets: [apiKey], timeoutSeconds: 90, maxInstances: 2, concurrency: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesion para generar el informe.");
  const input = request.data;
  if (!input || !/^20\d{2}$/.test(input.gestionId || "") || !["inicial", "preinicial"].includes(input.cursoId) || typeof input.alumnoId !== "string" || !input.alumnoId || input.alumnoId.includes("/") || !["t1", "t2", "t3"].includes(input.trimestreId)) throw new HttpsError("invalid-argument", "Selecciona curso, alumno y trimestre validos.");
  const uid = request.auth.uid;
  const yearPath = `gestiones/${input.gestionId}`;
  const [profile, system, annual, assignment, enrollment] = await db.getAll(db.doc(`usuarios/${uid}`), db.doc("configuracion/sistema"), db.doc(yearPath), db.doc(`${yearPath}/asignaciones/${uid}`), db.doc(`${yearPath}/matriculas/${input.alumnoId}`));
  const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/La_Paz" }).format(new Date());
  try { validarAccesoInforme({ uid, input, year, profile: profile.data(), config: { ...system.data(), gestionHabilitada: annual.data()?.ano === Number(input.gestionId) }, assignment: assignment.data(), enrollment: enrollment.data() }); }
  catch (error) { throw new HttpsError(error.message, "No puedes generar informes para esta asignacion."); }
  const rows = await db.collection(`${yearPath}/registros_inicial`).where("docenteUid", "==", uid).where("cursoId", "==", input.cursoId).where("trimestreId", "==", input.trimestreId).get();
  const records = rows.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.alumnoId === input.alumnoId && item.tipo !== "informe");
  if (!records.length) throw new HttpsError("failed-precondition", "Este estudiante aun no tiene registros en el trimestre.");
  const limit = db.doc(`usuarios/${uid}/limites_ia/informe`);
  const now = Date.now();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  await db.runTransaction(async (transaction) => {
    const previous = (await transaction.get(limit)).data() || {};
    const count = previous.dia === day ? previous.cantidad || 0 : 0;
    if (count >= 60 || now - (previous.ultimaSolicitud?.toMillis?.() || 0) < 30000) throw new HttpsError("resource-exhausted", "Espera 30 segundos entre solicitudes. Limite diario: 60 informes.");
    transaction.set(limit, { dia: day, cantidad: count + 1, ultimaSolicitud: Timestamp.fromMillis(now) });
  });
  try { return await generarConGemini({ records, apiKey: apiKey.value(), model: model.value() }); }
  catch (error) { throw new HttpsError("unavailable", error.message.includes("Gemini") || error.message.includes("informe") || error.message.includes("registros") ? error.message : "No se pudo generar el informe. Intenta de nuevo."); }
});
