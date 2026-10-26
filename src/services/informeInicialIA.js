import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "../firebase/client.js";
import { cursoInicial } from "./modeloInicial.js";
import { exigirTrimestreDocente } from "./relevoDocente.js";
import { validarTextoInforme } from "../../functions/informe-core.js";
import { validarCriteriosActividad, validarBorradorCriterios } from "../../functions/criterios-core.js";

export async function generarCriteriosConIA(context, input) {
  if (!geminiInicialDisponible()) throw new Error("Gemini esta pendiente de activar en el servidor.");
  if (auth.currentUser?.uid !== context.uid) throw new Error("La sesion cambio.");
  cursoInicial(context, input.cursoId); exigirTrimestreDocente(context, input.trimestreId);
  const payload = { gestionId: context.gestionId, cursoId: input.cursoId, trimestreId: input.trimestreId, ...(input.borrador ? { borrador: validarBorradorCriterios(input.borrador) } : { actividadId: input.actividadId }) };
  let result;
  if (import.meta.env?.DEV) {
    const response = await fetch("/api/inicial/criterios", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, body: JSON.stringify(payload) });
    result = await response.json(); if (!response.ok) throw new Error(result.error || "No se pudieron generar los criterios.");
  } else {
    result = (await httpsCallable(getFunctions(app, "us-central1"), "generarCriteriosInicial", { timeout: 90000 })(payload)).data;
  }
  if (auth.currentUser?.uid !== context.uid) throw new Error("La sesion cambio.");
  return { criterios: validarCriteriosActividad(result?.criterios) };
}

export const geminiInicialDisponible = () => import.meta.env?.VITE_INFORMES_IA_HABILITADA === "true";
export async function generarInformeConIA(context, input) {
  if (!geminiInicialDisponible()) throw new Error("Gemini esta pendiente de activar en el servidor.");
  if (auth.currentUser?.uid !== context.uid) throw new Error("La sesion cambio.");
  cursoInicial(context, input.cursoId);
  exigirTrimestreDocente(context, input.trimestreId);
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
