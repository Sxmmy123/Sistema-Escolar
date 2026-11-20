import { createLocalAdminClients } from "./dev-admin.js";
import { schoolAccess, createAccessLimiter, firebasePasswordGateway, SchoolAccessError } from "./access-core.js";

export function accessDevPlugin(env, firebase) {
  const clients = createLocalAdminClients(env, firebase);
  return { name: "acceso-escolar-local", apply: "serve", configureServer(server) {
    server.middlewares.use("/api/acceso-escolar", async (request, response) => {
      const send = (status, data) => { response.statusCode = status; response.setHeader("Content-Type", "application/json"); response.setHeader("Cache-Control", "no-store"); response.end(JSON.stringify(data)); };
      if (request.url && request.url !== "/") return send(404, { error: "Ruta no disponible." });
      if (request.method !== "POST") return send(405, { code: "invalid-argument", error: "Metodo no permitido." });
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) return send(403, { error: "Solo disponible desde este equipo." });
      try { if (!request.headers.origin || new URL(request.headers.origin).host !== request.headers.host) return send(403, { error: "Origen no permitido." }); }
      catch { return send(403, { error: "Origen no permitido." }); }
      try {
        let body = "";
        for await (const chunk of request) { body += chunk; if (body.length > 4096) return send(413, { error: "Solicitud demasiado grande." }); }
        let input;
        try { input = JSON.parse(body); } catch { return send(400, { error: "Solicitud no valida." }); }
        const { db } = await clients();
        const result = await schoolAccess(input, { db, ...firebasePasswordGateway(firebase.apiKey), takeLimit: createAccessLimiter(db, request.socket.remoteAddress) });
        send(200, result);
      } catch (error) {
        const codes = { "invalid-argument": 400, unauthenticated: 401, "resource-exhausted": 429, unavailable: 503 };
        send(error instanceof SchoolAccessError ? codes[error.code] || 503 : 503, { code: error.code || "unavailable", error: error instanceof SchoolAccessError ? error.message : "Configura la credencial administrativa local para el acceso por usuario." });
      }
    });
  } };
}
