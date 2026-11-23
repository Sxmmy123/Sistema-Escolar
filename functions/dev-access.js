import { createLocalAdminClients } from "./dev-admin.js";
import { schoolAccess, createAccessLimiter, firebasePasswordGateway, SchoolAccessError } from "./access-core.js";
import { changeTemporaryPassword } from "./own-password-core.js";
import { resetPasswordWithCode } from "./recovery-password-core.js";

export function accessDevPlugin(env, firebase) {
  const clients = createLocalAdminClients(env, firebase);
  return { name: "acceso-escolar-local", apply: "serve", configureServer(server) {
    const handler = (ownPassword = false) => async (request, response) => {
      const send = (status, data) => { response.statusCode = status; response.setHeader("Content-Type", "application/json"); response.setHeader("Cache-Control", "no-store"); response.end(JSON.stringify(data)); };
      if (request.url && request.url !== "/") return send(404, { error: "Ruta no disponible." });
      if (request.method !== "POST") return send(405, { code: "invalid-argument", error: "Metodo no permitido." });
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) return send(403, { error: "Solo disponible desde este equipo." });
      try { if (!request.headers.origin || new URL(request.headers.origin).host !== request.headers.host) return send(403, { error: "Origen no permitido." }); }
      catch { return send(403, { error: "Origen no permitido." }); }
      try {
        let body = "";
        for await (const chunk of request) { body += chunk; if (body.length > 8192) return send(413, { error: "Solicitud demasiado grande." }); }
        let input;
        try { input = JSON.parse(body); } catch { return send(400, { error: "Solicitud no valida." }); }
        const { db, auth } = await clients();
        const dependencies = { db, auth, ...firebasePasswordGateway(firebase.apiKey), takeLimit: createAccessLimiter(db, request.socket.remoteAddress) };
        let actor;
        if (ownPassword) {
          const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
          try { actor = await auth.verifyIdToken(token || "", true); }
          catch { throw new SchoolAccessError("unauthenticated", "Vuelve a ingresar."); }
        }
        const result = ownPassword ? await changeTemporaryPassword({ auth: actor, data: input }, dependencies) : input?.accion === "restablecer" ? await resetPasswordWithCode(input, dependencies) : await schoolAccess(input, dependencies);
        send(200, result);
      } catch (error) {
        const codes = { "invalid-argument": 400, unauthenticated: 401, "not-found": 404, aborted: 409, "resource-exhausted": 429, unavailable: 503 };
        send(error instanceof SchoolAccessError ? codes[error.code] || 503 : 503, { code: error.code || "unavailable", error: error instanceof SchoolAccessError ? error.message : "Configura la credencial administrativa local para el acceso por usuario." });
      }
    };
    server.middlewares.use("/api/cambiar-clave-temporal", handler(true));
    server.middlewares.use("/api/acceso-escolar", handler());
  } };
}
