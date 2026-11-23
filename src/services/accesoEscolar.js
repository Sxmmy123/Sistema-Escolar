import { getFunctions, httpsCallable } from "firebase/functions";

export async function solicitarAccesoEscolar(payload, { firebaseApp } = {}) {
  if (import.meta.env?.DEV) {
    const response = await fetch("/api/acceso-escolar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || "No se pudo conectar con el servicio de acceso."), { code: result.code || "unavailable" });
    return result;
  }
  const app = firebaseApp || (await import("../firebase/client.js")).app;
  return (await httpsCallable(getFunctions(app, "us-central1"), "accesoEscolar", { timeout: payload.accion === "restablecer" ? 60000 : 30000 })(payload)).data;
}
