import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { accessDevPlugin } from "../functions/dev-access.js";
import { schoolAccess, firebasePasswordGateway, createAccessLimiter } from "../functions/access-core.js";
import { cacheVigente, CACHE_MAX_AGE, limpiarDatosPrivados } from "../src/services/cachePrivada.js";
import { crearCacheCalificar } from "../src/services/datosCalificarDocente.js";
import { listAudit } from "../src/services/auditData.js";
import { listDirectorRecentAttendanceDays } from "../src/services/directorData.js";
import { firestore } from "../src/firebase/client.js";
import { icons } from "../src/ui/icons.js";
import { authEmailForLogin } from "../src/services/users.js";

function accessFixture(profile = { rol: "docente", activo: true }) {
  const documents = new Map([["indice_accesos/yola000", { uid: "yola", authEmail: "privado@example.test" }], ["usuarios/yola", profile]]);
  const sent = [], passwords = [];
  return { documents, sent, passwords, dependencies: { db: { doc: (path) => ({ get: async () => ({ data: () => documents.get(path) }) }) },
    verifyPassword: async (email, password) => { passwords.push(password); if (password !== "clave-correcta") throw Object.assign(new Error("Usuario o contrasena incorrectos."), { code: "unauthenticated" }); return { uid: "yola", email }; },
    sendReset: async (email) => sent.push(email), takeLimit: async () => {} } };
}
test("resolver un usuario exige su clave correcta y nunca devuelve correos al fallar", async () => {
  const fixture = accessFixture();
  await assert.rejects(schoolAccess({ accion: "ingresar", login: "Yola000", password: "mala" }, fixture.dependencies), (error) => error.code === "unauthenticated" && !error.message.includes("privado@"));
  assert.deepEqual(await schoolAccess({ accion: "ingresar", login: "Yola000", password: "clave-correcta" }, fixture.dependencies), { email: "privado@example.test" });
  assert.equal(fixture.documents.get("indice_accesos/yola000").password, undefined);
});
test("un perfil deshabilitado, inexistente o un vinculo de otro UID no habilita el acceso", async () => {
  for (const profile of [null, { rol: "docente", activo: false }, { rol: "desconocido", activo: true }]) {
    const fixture = accessFixture(profile);
    await assert.rejects(schoolAccess({ accion: "ingresar", login: "yola000", password: "clave-correcta" }, fixture.dependencies), { code: "unauthenticated" });
  }
  const fixture = accessFixture(); fixture.documents.get("indice_accesos/yola000").uid = "otro";
  await assert.rejects(schoolAccess({ accion: "ingresar", login: "yola000", password: "clave-correcta" }, fixture.dependencies), { code: "unauthenticated" });
});
test("alumnos necesitan su propio vinculo y las cuentas antiguas no cambian su clave", async () => {
  const fixture = accessFixture({ rol: "alumno", activo: true, alumnoId: "alumno-a" });
  await assert.rejects(schoolAccess({ accion: "ingresar", login: "yola000", password: "clave-correcta" }, fixture.dependencies), { code: "unauthenticated" });
  fixture.documents.set("alumnos/alumno-a", { authUid: "yola", activo: true });
  await schoolAccess({ accion: "ingresar", login: "yola000", password: "clave-correcta" }, fixture.dependencies);
  assert.deepEqual(fixture.passwords, ["clave-correcta", "clave-correcta"]);
});
test("recuperar devuelve la misma respuesta sin revelar correo ni existencia y omite alias internos", async () => {
  const fixture = accessFixture();
  for (const login of ["yola000", "noexiste", "6952974"]) assert.deepEqual(await schoolAccess({ accion: "recuperar", login }, fixture.dependencies), { ok: true });
  assert.deepEqual(fixture.sent, ["privado@example.test"]);
});
test("el navegador no consulta un indice publico ni resuelve usuarios sin enviar su clave al servicio", async () => {
  let received;
  assert.equal(await authEmailForLogin("Yola000", { password: "existente", solicitar: async (payload) => { received = payload; return { email: "privado@example.test" }; } }), "privado@example.test");
  assert.deepEqual(received, { accion: "ingresar", login: "Yola000", password: "existente" });
  assert.equal(await authEmailForLogin("PERSONA@example.test", { password: "existente", solicitar: async () => ({ email: "persona@example.test" }) }), "persona@example.test");
  const source = readFileSync(new URL("../src/services/users.js", import.meta.url), "utf8");
  assert.doesNotMatch(source.slice(source.indexOf("export async function authEmailForLogin"), source.indexOf("export function formatUsername")), /getDoc|indice_accesos/);
});
test("limitar intentos es atomico, no guarda usuario ni IP y se libera tras diez minutos", async () => {
  const saved = new Map(); let clock = 1000;
  const db = { doc: (path) => path, runTransaction: async (callback) => { const pending = []; const result = await callback({ get: async (ref) => ({ data: () => saved.get(ref) }), set: (ref, value) => pending.push([ref, value]) }); pending.forEach(([key, value]) => saved.set(key, value)); return result; } };
  const take = createAccessLimiter(db, "192.0.2.1", { now: () => clock });
  for (let i = 0; i < 10; i++) await take("yola000", "ingresar");
  const before = JSON.stringify([...saved]);
  await assert.rejects(take("yola000", "ingresar"), { code: "resource-exhausted" });
  assert.equal(JSON.stringify([...saved]), before);
  assert.doesNotMatch(before, /yola000|192\.0\.2\.1/);
  clock += 600000; await take("yola000", "ingresar");
  assert.ok([...saved.values()].every((value) => value.cantidad === 1));
});
test("Auth REST nunca propaga contrasenas, tokens ni mensajes internos al usuario", async () => {
  const calls = [];
  const gateway = firebasePasswordGateway("clave-web", async (url, request) => { calls.push(JSON.parse(request.body)); return { ok: true, json: async () => ({ localId: "uid", email: "persona@example.test", idToken: "privado", refreshToken: "privado" }) }; });
  assert.deepEqual(await gateway.verifyPassword("persona@example.test", "secreto"), { uid: "uid", email: "persona@example.test" });
  assert.equal(calls[0].password, "secreto");
  const failed = firebasePasswordGateway("clave-web", async () => ({ ok: false, json: async () => ({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }) }));
  await assert.rejects(failed.verifyPassword("persona@example.test", "secreto"), { code: "unauthenticated" });
});

test("el servicio local de acceso rechaza otros origenes, rutas, metodos y cuerpos excesivos", async () => {
  let handler;
  accessDevPlugin({}, { projectId: "demo-sistema-seguridad" }).configureServer({ middlewares: { use: (_path, callback) => { handler = callback; } } });
  const request = async (changes = {}, body = "{}") => {
    const input = Readable.from([body]);
    Object.assign(input, { method: "POST", url: "/", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:5194", origin: "http://127.0.0.1:5194" }, ...changes });
    const response = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
    await handler(input, response); return response;
  };
  assert.equal((await request({ method: "GET" })).statusCode, 405);
  assert.equal((await request({ url: "/otra-ruta" })).statusCode, 404);
  assert.equal((await request({ socket: { remoteAddress: "192.0.2.1" } })).statusCode, 403);
  assert.equal((await request({ headers: { host: "127.0.0.1:5194", origin: "https://ajeno.test" } })).statusCode, 403);
  assert.equal((await request({}, "{" )).statusCode, 400);
  assert.equal((await request({}, "a".repeat(8193))).statusCode, 413);
});

test("Auth REST valida el codigo antes de confirmar y no devuelve tokens ni datos adicionales", async () => {
  const calls = [];
  const gateway = firebasePasswordGateway("clave-web", async (url, request) => {
    assert.match(url, /accounts:resetPassword/);
    calls.push(JSON.parse(request.body));
    return { ok: true, json: async () => ({ email: "persona@example.test", requestType: "PASSWORD_RESET", idToken: "privado" }) };
  });
  assert.deepEqual(await gateway.verifyReset("codigo"), { email: "persona@example.test", requestType: "PASSWORD_RESET" });
  await gateway.confirmReset("codigo", "PersonalNueva2026");
  assert.deepEqual(calls, [{ oobCode: "codigo" }, { oobCode: "codigo", newPassword: "PersonalNueva2026" }]);
  for (const [message, code] of [["EXPIRED_OOB_CODE", "not-found"], ["INVALID_OOB_CODE", "not-found"], ["WEAK_PASSWORD : privado", "invalid-argument"], ["USER_DISABLED", "not-found"], ["TOO_MANY_ATTEMPTS_TRY_LATER", "resource-exhausted"]]) {
    const failed = firebasePasswordGateway("clave-web", async () => ({ ok: false, json: async () => ({ error: { message } }) }));
    await assert.rejects(failed.confirmReset("codigo", "PersonalNueva2026"), error => error.code === code && !error.message.includes("privado"));
  }
});

function storage() {
  const values = new Map();
  return { get length() { return values.size; }, key: (i) => [...values.keys()][i], getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
test("salir borra expedientes y sesiones, conservando tema y preferencias de otras paginas", () => {
  const saved = storage();
  for (const key of ["escolar_v2_2026_uid_notas", "sesionUid", "docenteCursoId", "colegio-tema", "otra-aplicacion", "escolar_v2_2026_uid_director_avisos_vistos_t1"]) saved.setItem(key, "dato");
  limpiarDatosPrivados([saved]);
  assert.equal(saved.getItem("escolar_v2_2026_uid_notas"), null);
  assert.equal(saved.getItem("sesionUid"), null);
  assert.equal(saved.getItem("docenteCursoId"), null);
  assert.equal(saved.getItem("colegio-tema"), "dato");
  assert.equal(saved.getItem("otra-aplicacion"), "dato");
  assert.equal(saved.getItem("escolar_v2_2026_uid_director_avisos_vistos_t1"), "dato");
  assert.doesNotThrow(() => limpiarDatosPrivados([{ get length() { throw new Error("Bloqueado"); } }]));
});
test("cache caduca en memoria y almacenamiento y no reaparece tras una respuesta tardia", async () => {
  const saved = storage(), scope = { uid: "a", gestionId: "2026", trimestreId: "t1" }; let clock = 1000;
  const cache = crearCacheCalificar({ almacenamiento: () => saved, ahora: () => clock });
  cache.guardar(scope, "notas", "curso", [{ nota: 80 }]);
  assert.equal(cache.leer(scope, "notas", "curso")[0].nota, 80);
  clock += CACHE_MAX_AGE;
  assert.equal(cache.leer(scope, "notas", "curso"), null);
  assert.equal(cacheVigente(clock + 1, clock), false);
  let finish;
  const pending = cache.cargar(scope, "notas", "curso", () => new Promise((resolve) => { finish = resolve; }));
  await Promise.resolve();
  limpiarDatosPrivados([saved]);
  finish([{ nota: 99 }]);
  await assert.rejects(pending, /sesion cambio/);
  assert.equal(cache.leer(scope, "notas", "curso"), null);
});

test("auditoria filtra antes de limitar y avisa que quedan paginas aunque no haya coincidencias de texto", async () => {
  let filters;
  const docs = Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, data: () => ({ fecha: "2026-03-01", detalle: "sin coincidencia", createdAt: i }) }));
  const page = await listAudit({ fecha: "2026-03-01", tipo: "asistencia", buscar: "noexiste", pageSize: 3 }, { db: firestore, read: async (request) => { filters = request._query.filters; return { docs }; } });
  assert.equal(filters.length, 2);
  assert.equal(page.items.length, 0);
  assert.equal(page.scanned, 3); assert.equal(page.hasMore, true); assert.equal(page.cursor.id, "2");
});
test("la tendencia lee completos siete dias, aunque un solo dia tenga mas de 800 asistencias", async () => {
  const dates = Array.from({ length: 8 }, (_, i) => `2026-03-${String(20 - i).padStart(2, "0")}`);
  let calls = 0;
  const result = await listDirectorRecentAttendanceDays(7, { db: firestore, read: async (request) => {
    calls++;
    if (calls <= 7) return { docs: [{ id: `ancla-${calls}`, data: () => ({ fecha: dates[calls - 1] }) }] };
    assert.equal(request._query.limit, null);
    return { docs: dates.slice(0, 7).flatMap((date) => Array.from({ length: 901 }, (_, i) => ({ id: `${date}-${i}`, data: () => ({ fecha: date, estado: "presente" }) }))) };
  } });
  assert.equal(calls, 8); assert.equal(result.length, 6307);
});
test("Gemini filtra por alumno en el servidor sin exponer su clave ni consultar al proveedor desde el navegador", () => {
  const cloud = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  const local = readFileSync(new URL("../functions/dev-gemini.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/services/informeInicialIA.js", import.meta.url), "utf8");
  assert.match(cloud, /\.where\("alumnoId", "==", input.alumnoId\)/);
  assert.match(local, /\["alumnoId", input.alumnoId\]/);
  assert.doesNotMatch(client, /VITE_GEMINI_API_KEY|geminiDirecto|generarConGemini\(/);
});
test("los parametros de Functions no usan prefijos reservados por Firebase", () => {
  const cloud = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  const names = [...cloud.matchAll(/define(?:String|Secret)\("([A-Z_]+)"/g)].map((match) => match[1]);
  assert.ok(names.includes("SCHOOL_WEB_API_KEY"));
  for (const name of names) assert.doesNotMatch(name, /^(X_GOOGLE_|FIREBASE_|EXT_|KIT_)/);
});

test("no se importa todo el catalogo de Lucide y se conservan iconos de materias y controles", () => {
  const scan = (dir) => { for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) scan(path);
    else if (path.endsWith(".js") && !path.endsWith("icons.js")) assert.doesNotMatch(readFileSync(path, "utf8"), /import\s*\{[^}]*\bicons\b[^}]*\}\s*from\s*["']lucide["']/);
  } };
  scan(fileURLToPath(new URL("../src", import.meta.url)));
  for (const name of ["Calculator", "Leaf", "Palette", "Music", "Dumbbell", "CalendarDays", "ShieldCheck", "EyeOff", "ChevronDown"]) assert.ok(icons[name]);
  assert.ok(Object.keys(icons).length < 200);
});
