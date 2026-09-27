/* Atlas Pacifica — application installable (PWA) : enregistrement du service worker,
   bandeau hors ligne et bouton « Installer l'application ». */
(() => {
  "use strict";
  const bandeau = document.getElementById("hors-ligne");
  const installer = document.getElementById("installer");

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  function majConnexion() {
    if (!bandeau) return;
    bandeau.hidden = navigator.onLine;
  }
  window.addEventListener("online", majConnexion);
  window.addEventListener("offline", majConnexion);
  majConnexion();

  let invite = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    invite = e;
    if (installer) installer.hidden = false;
  });
  if (installer) {
    installer.addEventListener("click", async () => {
      if (!invite) return;
      invite.prompt();
      await invite.userChoice.catch(() => null);
      invite = null;
      installer.hidden = true;
    });
  }
  window.addEventListener("appinstalled", () => { if (installer) installer.hidden = true; });
})();
