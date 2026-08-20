export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

  window.addEventListener("load", () => {
    const swUrl = new URL("service-worker.js", document.baseURI).toString();
    navigator.serviceWorker.register(swUrl).catch((error) => {
      console.warn("No se pudo registrar la PWA", error);
    });
  });
}
