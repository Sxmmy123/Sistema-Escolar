import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase/client.js";

export async function solicitarAccesoEscolar(payload) {
  if (import.meta.env?.DEV) {
    const response = await fetch("/api/acceso-escolar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || "No se pudo conectar con el servicio de acceso."), { code: result.code || "unavailable" });
    return result;
  }
  return (await httpsCallable(getFunctions(app, "us-central1"), "accesoEscolar", { timeout: 30000 })(payload)).data;
}
