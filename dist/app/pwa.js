export function registerServiceWorker() {
    if (!("serviceWorker" in navigator))
        return;
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((err) => {
            console.warn("[PWA] Service worker registration failed:", err);
        });
    });
}
