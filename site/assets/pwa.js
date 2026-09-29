/* Atlas Pacifica — application installable (PWA) : enregistrement du service worker,
   bandeau hors ligne, bouton « Installer l'application », notice cookies et fenêtre de confidentialité. */
(() => {
  "use strict";
  const bandeau = document.getElementById("hors-ligne");
  const installer = document.getElementById("installer");

  /* Mises à jour : l'application installée vérifie la présence d'une nouvelle version à chaque retour au premier plan
     et toutes les 30 min. Si la page est en arrière-plan, elle se recharge seule ; sinon un bandeau propose la mise à jour. */
  const bandeauMaj = document.getElementById("maj-dispo");
  let rechargement = false;
  function recharger() { if (rechargement) return; rechargement = true; location.reload(); }
  if ("serviceWorker" in navigator && window.isSecureContext) {
    const controlait = !!navigator.serviceWorker.controller;
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").then((reg) => {
      const verifier = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") verifier(); });
      setInterval(verifier, 30 * 60 * 1000);
    }).catch(() => {}));
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!controlait) return;                       // première installation : rien à recharger
      if (document.visibilityState === "hidden") recharger();
      else if (bandeauMaj) bandeauMaj.hidden = false;
    });
  }
  document.getElementById("maj-appliquer")?.addEventListener("click", recharger);
  /* Bouton « Actualiser » : indispensable en mode application, où le navigateur n'offre pas de bouton de rechargement. */
  document.getElementById("actualiser")?.addEventListener("click", async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.update();
      if ("caches" in window) {
        const cles = await caches.keys();
        await Promise.all(cles.filter((k) => k.endsWith("-donnees")).map((k) => caches.delete(k)));
      }
    } catch (e) { /* rechargement simple */ }
    recharger();
  });

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

  /* Notice d'information (pas de consentement à recueillir : aucun traceur). Mémorisée sur l'appareil. */
  const CLE = "atlas-pacifica-notice-lue";
  const notice = document.getElementById("notice");
  const fenetre = document.getElementById("confidentialite");
  const lire = () => { try { return localStorage.getItem(CLE) === "1"; } catch (e) { return false; } };
  const ecrire = () => { try { localStorage.setItem(CLE, "1"); } catch (e) { /* stockage indisponible */ } };
  function fermerNotice() { ecrire(); if (notice) notice.hidden = true; }
  function ouvrirFenetre() {
    if (!fenetre) return;
    if (typeof fenetre.showModal === "function") fenetre.showModal(); else fenetre.setAttribute("open", "");
  }
  if (notice && !lire()) notice.hidden = false;
  document.getElementById("notice-ok")?.addEventListener("click", fermerNotice);
  document.getElementById("notice-plus")?.addEventListener("click", () => { fermerNotice(); ouvrirFenetre(); });
  document.getElementById("ouvrir-confidentialite")?.addEventListener("click", ouvrirFenetre);
  document.getElementById("fermer-confidentialite")?.addEventListener("click", () => fenetre.close ? fenetre.close() : fenetre.removeAttribute("open"));
  fenetre?.addEventListener("click", (e) => { if (e.target === fenetre && fenetre.close) fenetre.close(); });
})();
