import { generarConGemini, validarAccesoInforme, validarAccesoInicial } from "./informe-core.js";
import { generarCriteriosGemini, validarAccesoActividad, validarBorradorCriterios } from "./criterios-core.js";
import * as tls from "node:tls";

function decode(value = {}) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return { seconds: Date.parse(value.timestampValue) / 1000 };
  if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
}
const fields = (document) => Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, decode(value)]));
export function geminiDevPlugin(env, firebase) {
  const limits = new Map();
  return { name: "gemini-inicial-local", apply: "serve", configureServer(server) {
    // Honor the operating system's trusted CAs without disabling TLS validation.
    if (tls.setDefaultCACertificates && tls.getCACertificates) tls.setDefaultCACertificates([...new Set([...tls.getCACertificates("default"), ...tls.getCACertificates("system")])]);
    server.middlewares.use("/api/inicial", async (request, response) => {
      const send = (status, body) => { response.statusCode = status; response.setHeader("Content-Type", "application/json"); response.setHeader("Cache-Control", "no-store"); response.end(JSON.stringify(body)); };
      const criteria = request.url === "/criterios";
      if (request.url && !["/informe", "/criterios"].includes(request.url)) return send(404, { error: "Ruta no disponible." });
      if (request.method !== "POST") return send(405, { error: "Metodo no permitido." });
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) return send(403, { error: "Gemini de prueba solo esta disponible desde este equipo." });
      try { if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) return send(403, { error: "Origen no permitido." }); }
      catch { return send(403, { error: "Origen no permitido." }); }
      const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) return send(401, { error: "Inicia sesion para generar el informe." });
      if (!env.GEMINI_API_KEY) return send(503, { error: "Configura Gemini en el servidor local." });
      try {
        let body = "";
        for await (const chunk of request) { body += chunk; if (body.length > 5000) return send(413, { error: "Solicitud demasiado grande." }); }
        const input = JSON.parse(body);
        let draft;
        if (criteria && input.borrador) {
          try { draft = validarBorradorCriterios(input.borrador); }
          catch (error) { return send(400, { error: error.message }); }
          if (input.actividadId) return send(400, { error: "Selecciona un borrador o una actividad guardada, no ambos." });
        }
        const target = criteria ? input.actividadId : input.alumnoId;
        if (!/^20\d{2}$/.test(input.gestionId || "") || !["inicial", "preinicial"].includes(input.cursoId) || !["t1", "t2", "t3"].includes(input.trimestreId) || !draft && (typeof target !== "string" || !target || target.includes("/"))) return send(400, { error: "Selecciona curso, actividad o alumno y trimestre validos." });
        const authResult = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebase.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(15000) });
        if (!authResult.ok) return send(401, { error: "La sesion vencio. Vuelve a iniciar sesion." });
        const uid = (await authResult.json()).users?.[0]?.localId;
        if (!uid) return send(401, { error: "Sesion no valida." });
        const base = `https://firestore.googleapis.com/v1/projects/${firebase.projectId}/databases/(default)/documents`;
        const headers = { authorization: `Bearer ${token}`, "Content-Type": "application/json" };
        const get = async (path) => { const result = await fetch(`${base}/${path}`, { headers, signal: AbortSignal.timeout(15000) }); if (!result.ok) throw new Error("permission-denied"); return fields(await result.json()); };
        const path = `gestiones/${input.gestionId}`;
        const [profile, system, annual, assignment, targetData] = await Promise.all([get(`usuarios/${uid}`), get("configuracion/sistema"), get(path), get(`${path}/asignaciones/${uid}`), draft ? Promise.resolve(draft) : get(`${path}/${criteria ? "actividades_inicial" : "matriculas"}/${target}`)]);
        const config = { ...system, gestionHabilitada: annual.ano === Number(input.gestionId) };
        const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/La_Paz" }).format(new Date());
        const access = { uid, input, year, profile, config, assignment };
        if (criteria) { validarAccesoInicial(access); if (!draft) validarAccesoActividad(targetData, uid, input); }
        else validarAccesoInforme({ ...access, enrollment: targetData });
        const limitKey = `${uid}:${criteria ? "criterios" : "informe"}`;
        const now = Date.now(), day = new Date().toISOString().slice(0, 10), previous = limits.get(limitKey) || {};
        const count = previous.day === day ? previous.count : 0;
        if (now - (previous.time || 0) < 30000 || count >= 60) return send(429, { error: "Espera 30 segundos entre solicitudes. Limite diario: 60." });
        limits.set(limitKey, { day, time: now, count: count + 1 });
        if (criteria) return send(200, await generarCriteriosGemini({ activity: targetData, apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }));
        const filters = [["docenteUid", uid], ["cursoId", input.cursoId], ["trimestreId", input.trimestreId]].map(([fieldPath, value]) => ({ fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue: value } } }));
        const result = await fetch(`${base}/${path}:runQuery`, { method: "POST", headers, signal: AbortSignal.timeout(15000), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "registros_inicial" }], where: { compositeFilter: { op: "AND", filters } } } }) });
        if (!result.ok) throw new Error("No se pudieron consultar los registros del estudiante.");
        const records = (await result.json()).filter((row) => row.document).map(({ document }) => ({ id: document.name.split("/").at(-1), ...fields(document) })).filter((row) => row.alumnoId === input.alumnoId && row.tipo !== "informe");
        send(200, await generarConGemini({ records, apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }));
      } catch (error) { const denied = ["permission-denied", "failed-precondition"].includes(error.message); send(denied ? 403 : 500, { error: denied ? "No tienes permiso para generar este informe." : error.message === "fetch failed" ? "No se pudo conectar con Gemini." : error.message }); }
    });
  } };
}
