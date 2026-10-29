import { readFile } from "node:fs/promises";
import { resetStudentPassword, StudentPasswordError } from "./student-password-core.js";

export function adminDevPlugin(env, firebase) {
  let clients;
  const getClients = async () => {
    if (!clients) {
      clients = (async () => {
        const { applicationDefault, cert, initializeApp, getApps } = await import("firebase-admin/app");
        const { getAuth } = await import("firebase-admin/auth");
        const { getFirestore } = await import("firebase-admin/firestore");
        const file = env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (!file) throw new Error("missing-credentials");
        const credential = JSON.parse(await readFile(file, "utf8"));
        const userCredential = credential.type === "authorized_user";
        if ((userCredential ? credential.quota_project_id : credential.project_id) !== firebase.projectId) throw new Error("wrong-project");
        // Local ADC can use an existing authorized user without a service-account key.
        if (userCredential) process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
        const app = getApps().find((item) => item.name === "admin-local-reset") || initializeApp({ credential: userCredential ? applicationDefault() : cert(credential), projectId: firebase.projectId }, "admin-local-reset");
        return { auth: getAuth(app), db: getFirestore(app) };
      })().catch((error) => { clients = null; throw error; });
    }
    return clients;
  };
  return { name: "admin-alumnos-local", apply: "serve", configureServer(server) {
    server.middlewares.use("/api/admin/alumnos/restablecer-clave", async (request, response) => {
      const send = (status, body) => { response.statusCode = status; response.setHeader("Content-Type", "application/json"); response.setHeader("Cache-Control", "no-store"); response.end(JSON.stringify(body)); };
      if (request.url && request.url !== "/") return send(404, { error: "Ruta no disponible." });
      if (request.method !== "POST") return send(405, { error: "Metodo no permitido." });
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) return send(403, { error: "Esta operacion local solo esta disponible desde este equipo." });
      try { if (!request.headers.origin || new URL(request.headers.origin).host !== request.headers.host) return send(403, { error: "Origen no permitido." }); }
      catch { return send(403, { error: "Origen no permitido." }); }
      const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) return send(401, { error: "Inicia sesion como administrador." });
      let input;
      try {
        let body = "";
        for await (const chunk of request) { body += chunk; if (body.length > 4096) return send(413, { error: "Solicitud demasiado grande." }); }
        input = JSON.parse(body);
      } catch { return send(400, { error: "Solicitud no valida." }); }
      let backend;
      try { backend = await getClients(); }
      catch { return send(503, { error: "Configura la credencial administrativa del servidor local para restablecer claves." }); }
      let decoded;
      try { decoded = await backend.auth.verifyIdToken(token, true); }
      catch { return send(401, { error: "La sesion vencio. Vuelve a ingresar." }); }
      try {
        const result = await resetStudentPassword({ auth: { uid: decoded.uid, token: decoded }, data: input }, backend);
        send(200, result);
      } catch (error) {
        const statuses = { unauthenticated: 401, "permission-denied": 403, "invalid-argument": 400, "failed-precondition": 409, unavailable: 503 };
        send(error instanceof StudentPasswordError ? statuses[error.code] || 500 : 500, { error: error instanceof StudentPasswordError ? error.message : "No se pudo confirmar el restablecimiento. Revisa la conexion antes de reintentar." });
      }
    });
  } };
}
