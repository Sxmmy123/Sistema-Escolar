import { getFunctions, httpsCallable } from "firebase/functions";
import { getDoc } from "firebase/firestore";
import { app, auth, firestore } from "../firebase/client.js";
import { cursoInicial, registrosAlumnoInicial } from "./modeloInicial.js";
import { documentoGestion } from "./rutasFirestore.js";
import { listarRegistrosInicial } from "./registrosInicial.js";
import { exigirTrimestreDocente } from "./relevoDocente.js";
import { generarConGemini, validarTextoInforme } from "../../functions/informe-core.js";
import { generarCriteriosGemini, validarAccesoActividad, validarCriteriosActividad, validarBorradorCriterios } from "../../functions/criterios-core.js";

// Conexion directa para la demostracion estatica: esta clave es visible en el navegador.
const geminiDirecto = {
  apiKey: import.meta.env?.VITE_GEMINI_API_KEY || "",
  model: import.meta.env?.VITE_GEMINI_MODEL || "gemini-2.5-flash"
};

export async function generarCriteriosConIA(context, input) {
  if (!geminiInicialDisponible()) throw new Error("Gemini esta pendiente de activar en el servidor.");
  if (auth.currentUser?.uid !== context.uid) throw new Error("La sesion cambio.");
  cursoInicial(context, input.cursoId); exigirTrimestreDocente(context, input.trimestreId);
  const payload = { gestionId: context.gestionId, cursoId: input.cursoId, trimestreId: input.trimestreId, ...(input.borrador ? { borrador: validarBorradorCriterios(input.borrador) } : { actividadId: input.actividadId }) };
  let result;
  if (geminiDirecto.apiKey) {
    if (input.borrador && input.actividadId) throw new Error("Selecciona un borrador o una actividad guardada.");
    let activity = payload.borrador;
    if (!activity) {
      if (typeof input.actividadId !== "string" || !input.actividadId || input.actividadId.includes("/")) throw new Error("Selecciona una actividad valida.");
      const snapshot = await getDoc(documentoGestion(firestore, "actividades_inicial", input.actividadId));
      activity = snapshot.data();
      try { validarAccesoActividad(activity, context.uid, input); }
      catch { throw new Error("No puedes generar criterios para esta actividad."); }
      activity = validarBorradorCriterios(activity);
    }
    if (auth.currentUser?.uid !== context.uid) throw new Error("La sesion cambio.");
    result = await generarCriteriosGemini({ activity, ...geminiDirecto });
  } else if (import.meta.env?.DEV) {
    const response = await fetch("/api/inicial/criterios", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, body: JSON.stringify(payload) });
    result = await response.json(); if (!response.ok) throw new Error(result.error || "No se pudieron generar los criterios.");
  } else {
    result = (await httpsCallable(getFunctions(app, "us-central1"), "generarCriteriosInicial", { timeout: 90000 })(payload)).data;
  }
  if (auth.currentUser?.uid !== context.uid) throw new Error("La sesion cambio.");
  return { criterios: validarCriteriosActividad(result?.criterios) };
}

export const geminiInicialDisponible = () => Boolean(geminiDirecto.apiKey) || import.meta.env?.VITE_INFORMES_IA_HABILITADA === "true";
export async function generarInformeConIA(context, input) {
  if (!geminiInicialDisponible()) throw new Error("Gemini esta pendiente de activar en el servidor.");
  if (auth.currentUser?.uid !== context.uid) throw new Error("La sesion cambio.");
  cursoInicial(context, input.cursoId);
  exigirTrimestreDocente(context, input.trimestreId);
  if (geminiDirecto.apiKey) {
    if (typeof input.alumnoId !== "string" || !input.alumnoId || input.alumnoId.includes("/")) throw new Error("Selecciona un estudiante valido.");
    const rows = await listarRegistrosInicial(context, input.cursoId, input.trimestreId, { fresh: true });
    if (auth.currentUser?.uid !== context.uid) throw new Error("La sesion cambio.");
    const records = registrosAlumnoInicial(rows, input.alumnoId);
    const result = await generarConGemini({ records, ...geminiDirecto });
    if (auth.currentUser?.uid !== context.uid) throw new Error("La sesion cambio.");
    return result;
  }
  if (import.meta.env?.DEV) {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch("/api/inicial/informe", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ gestionId: context.gestionId, cursoId: input.cursoId, trimestreId: input.trimestreId, alumnoId: input.alumnoId }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo generar el informe.");
    if (auth.currentUser?.uid !== context.uid) throw new Error("La sesion cambio.");
    return { texto: validarTextoInforme(result.texto), fuentesFirma: result.fuentesFirma };
  }
  const call = httpsCallable(getFunctions(app, "us-central1"), "generarInformeInicial", { timeout: 90000 });
  try {
    const result = await call({ gestionId: context.gestionId, cursoId: input.cursoId, trimestreId: input.trimestreId, alumnoId: input.alumnoId });
    if (auth.currentUser?.uid !== context.uid) throw new Error("La sesion cambio.");
    const texto = validarTextoInforme(result.data?.texto);
    if (!/^[0-9]+-[a-f0-9]+$/.test(result.data?.fuentesFirma || "")) throw new Error("Las fuentes del informe no son validas.");
    return { texto, fuentesFirma: result.data.fuentesFirma };
  } catch (error) {
    if (error.code === "functions/unauthenticated" || error.code === "functions/permission-denied") throw new Error("Tu cuenta no tiene permiso para generar este informe.");
    if (error.code === "functions/not-found" || error.code === "functions/internal") throw new Error("No se pudo conectar con Gemini. Verifica la configuracion del servidor.");
    throw error;
  }
}
