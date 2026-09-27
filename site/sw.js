/* Atlas Pacifica — service worker.
   - Coquille de l'application : mise en cache à l'installation, servie hors ligne.
   - Données (data/*.json, /api/*) : réseau d'abord, sinon dernière copie connue.
   - Tuiles satellite NASA GIBS : non stockées (réponses opaques trop lourdes pour le stockage d'un téléphone). */
const VERSION = "atlas-pacifica-v4";
const COQUILLE = `${VERSION}-coquille`;
const DONNEES = `${VERSION}-donnees`;

const FICHIERS = [
  "./", "manifest.webmanifest",
  "assets/app.css", "assets/app.js", "assets/couches.js", "assets/fiches.js", "assets/lieux.js", "assets/pwa.js",
  "vendor/leaflet/leaflet.css", "vendor/leaflet/leaflet.js", "vendor/chart.umd.js",
  "icones/icone-32.png", "icones/icone-192.png", "icones/logo-128.webp",
  "vendor/fonts/ibm-plex-sans-condensed-latin-400-normal.woff2", "vendor/fonts/ibm-plex-sans-condensed-latin-500-normal.woff2",
  "vendor/fonts/ibm-plex-sans-condensed-latin-600-normal.woff2", "vendor/fonts/ibm-plex-sans-condensed-latin-700-normal.woff2",
  "vendor/fonts/ibm-plex-mono-latin-400-normal.woff2", "vendor/fonts/ibm-plex-mono-latin-500-normal.woff2"
];

/* Données de l'atlas disponibles dès l'installation, même sans jamais les avoir ouvertes en ligne. */
const DONNEES_BASE = [
  "data/terres-pacifique.geojson", "data/oni.json", "data/saisons.json", "data/cyclones.json", "data/episodes.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(Promise.all([
    caches.open(COQUILLE).then((c) => c.addAll(FICHIERS)),
    caches.open(DONNEES).then((c) => c.addAll(DONNEES_BASE))
  ]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function reseauDabord(req, nomCache) {
  const cache = await caches.open(nomCache);
  try {
    const r = await fetch(req);
    if (r.ok) cache.put(req, r.clone());
    return r;
  } catch (e) {
    const copie = await cache.match(req);
    if (copie) {
      const h = new Headers(copie.headers);
      h.set("x-atlas-hors-ligne", "1");
      return new Response(copie.body, { status: 200, headers: h });
    }
    throw e;
  }
}

/* Copie en cache servie tout de suite, mise à jour en arrière-plan pour la visite suivante. */
async function cacheDabord(req, e) {
  const cache = await caches.open(COQUILLE);
  const trouve = await cache.match(req);
  const maj = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; });
  if (trouve) { e.waitUntil(maj.catch(() => {})); return trouve; }
  return maj;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/data/")) {
      e.respondWith(reseauDabord(req, DONNEES));
    } else if (req.mode === "navigate") {
      e.respondWith(fetch(req).then((r) => {
        if (r.ok && !r.redirected && url.pathname === "/") {
          const copie = r.clone();
          e.waitUntil(caches.open(COQUILLE).then((c) => c.put("./", copie)));
        }
        return r;
      }).catch(() => caches.match("./")));
    } else {
      e.respondWith(cacheDabord(req, e));
    }
    return;
  }
  // Tuiles NASA GIBS, Open-Meteo, NASA POWER, polices : réseau direct, sans cache (données toujours fraîches).
});
