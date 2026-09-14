export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

  if (import.meta.env.DEV) {
    window.addEventListener("load", async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ("caches" in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys
            .filter((key) => key.startsWith("ue-ecologica-nb"))
            .map((key) => caches.delete(key)));
        }
      } catch (error) {
        console.warn("No se pudo limpiar la cache PWA de desarrollo", error);
      }
    });
    return;
  }

  window.addEventListener("load", () => {
    const swUrl = new URL("service-worker.js", document.baseURI).toString();
    navigator.serviceWorker.register(swUrl).catch((error) => {
      console.warn("No se pudo registrar la PWA", error);
    });
  });
}
