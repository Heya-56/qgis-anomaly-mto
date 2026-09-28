/* Atlas Pacifica — serveur auto-hébergé.
   Fait tourner EXACTEMENT le même code que le site public (worker.js + dossier site/) sur n'importe quelle machine
   avec Node.js 22, sans compte Cloudflare : les services Cloudflare sont remplacés par des équivalents locaux.
     - fichiers du site  → dossier site/            (+ en-têtes de sécurité lus dans site/_headers)
     - base D1           → SQLite local             (DONNEES_DIR/atlas.sqlite)
     - stockage R2       → dossier local            (DONNEES_DIR/r2/)
     - tâche planifiée   → toutes les 5 minutes     (copie des produits ECMWF publiés sur GitHub)
   Variables d'environnement : PORT (8080), HOTE (0.0.0.0), DONNEES_DIR (./donnees-locales),
   HTTPS_PROXY / HTTP_PROXY (proxy d'entreprise, pris en charge automatiquement). */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..");
const SITE = path.join(RACINE, "site");
const PORT = Number(process.env.PORT || 8080);
const HOTE = process.env.HOTE || "0.0.0.0";
const DONNEES_DIR = path.resolve(process.env.DONNEES_DIR || path.join(RACINE, "donnees-locales"));
const DIR_R2 = path.join(DONNEES_DIR, "r2");
fs.mkdirSync(DIR_R2, { recursive: true });

/* Proxy d'entreprise : les requêtes sortantes (NASA, NOAA, GDACS, GitHub) passent par HTTPS_PROXY s'il est défini. */
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy) {
  try {
    const { setGlobalDispatcher, EnvHttpProxyAgent } = await import("undici");
    setGlobalDispatcher(new EnvHttpProxyAgent());
    console.log("Proxy d'entreprise utilisé pour les requêtes sortantes.");
  } catch (e) {
    console.warn("Proxy défini mais module « undici » absent : lancez « npm install » dans auto-hebergement/.");
  }
}

/* ---------- Cache HTTP en mémoire (remplace caches.default de Cloudflare) ---------- */
const memoire = new Map();
globalThis.caches = {
  default: {
    async match(req) {
      const e = memoire.get(req.url);
      if (!e) return undefined;
      if (Date.now() > e.expire) { memoire.delete(req.url); return undefined; }
      return new Response(e.corps, { status: e.statut, headers: e.entetes });
    },
    async put(req, rep) {
      const m = /max-age=(\d+)/.exec(rep.headers.get("cache-control") || "");
      const duree = m ? Number(m[1]) * 1000 : 0;
      if (!duree) return;
      if (memoire.size > 500) memoire.delete(memoire.keys().next().value);
      memoire.set(req.url, { corps: await rep.arrayBuffer(), statut: rep.status, entetes: [...rep.headers], expire: Date.now() + duree });
    }
  }
};

/* ---------- D1 → SQLite ---------- */
const sqlite = new DatabaseSync(path.join(DONNEES_DIR, "atlas.sqlite"));
sqlite.exec(fs.readFileSync(path.join(RACINE, "migrations", "0001_catalogue.sql"), "utf8"));
function requete(sql) {
  let args = [];
  const st = () => sqlite.prepare(sql);
  const o = {
    bind(...a) { args = a.map((x) => (x === undefined ? null : x)); return o; },
    async run() { const r = st().run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
    async first() { return st().get(...args) ?? null; },
    async all() { return { results: st().all(...args), success: true }; },
    _executer() { return /^\s*(select|with)/i.test(sql) ? { results: st().all(...args) } : st().run(...args); }
  };
  return o;
}
const DB = {
  prepare: requete,
  async batch(liste) {
    sqlite.exec("BEGIN");
    try { const r = liste.map((q) => q._executer()); sqlite.exec("COMMIT"); return r; }
    catch (e) { sqlite.exec("ROLLBACK"); throw e; }
  }
};

/* ---------- R2 → dossier local ---------- */
const cheminObjet = (cle) => {
  const p = path.resolve(DIR_R2, cle);
  if (!p.startsWith(DIR_R2 + path.sep)) throw new Error("clé refusée");
  return p;
};
const DONNEES = {
  async put(cle, buf, options = {}) {
    const p = cheminObjet(cle);
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, Buffer.from(buf));
    await fsp.writeFile(p + ".meta.json", JSON.stringify(options.httpMetadata || {}));
  },
  async get(cle) {
    try {
      const p = cheminObjet(cle);
      const corps = await fsp.readFile(p);
      let meta = {};
      try { meta = JSON.parse(await fsp.readFile(p + ".meta.json", "utf8")); } catch (e) { /* sans métadonnées */ }
      return { body: corps, httpMetadata: meta, httpEtag: `"${corps.length}-${(await fsp.stat(p)).mtimeMs | 0}"` };
    } catch (e) { return null; }
  },
  async delete(cles) {
    for (const cle of [].concat(cles)) {
      const p = cheminObjet(cle);
      await fsp.rm(p, { force: true }); await fsp.rm(p + ".meta.json", { force: true });
    }
  }
};

/* ---------- Limitation de débit (60 requêtes / minute / adresse IP) ---------- */
const compteurs = new Map();
const LIMITEUR = {
  async limit({ key }) {
    const t = Math.floor(Date.now() / 60000);
    const c = compteurs.get(key);
    if (!c || c.t !== t) { compteurs.set(key, { t, n: 1 }); if (compteurs.size > 10000) compteurs.clear(); return { success: true }; }
    c.n += 1;
    return { success: c.n <= 60 };
  }
};

/* ---------- Fichiers du site + en-têtes de sécurité (site/_headers) ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".geojson": "application/geo+json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8" };
const REGLES = [];
{
  let courante = null;
  for (const ligne of fs.readFileSync(path.join(SITE, "_headers"), "utf8").split(/\r?\n/)) {
    if (!ligne.trim()) continue;
    if (!/^\s/.test(ligne)) { courante = { motif: ligne.trim(), entetes: [] }; REGLES.push(courante); continue; }
    const i = ligne.indexOf(":");
    if (courante && i > 0) courante.entetes.push([ligne.slice(0, i).trim(), ligne.slice(i + 1).trim()]);
  }
}
function entetesPour(chemin) {
  const h = new Headers();
  for (const r of REGLES) {
    const ok = r.motif.endsWith("*") ? chemin.startsWith(r.motif.slice(0, -1)) : chemin === r.motif;
    if (ok) r.entetes.forEach(([k, v]) => h.set(k, v));
  }
  return h;
}
const ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const p = path.resolve(SITE, "." + rel);
    if (!p.startsWith(SITE + path.sep) || path.basename(p).startsWith("_")) return new Response("Introuvable", { status: 404 });
    try {
      const corps = await fsp.readFile(p);
      const h = entetesPour(url.pathname);
      h.set("content-type", TYPES[path.extname(p)] || "application/octet-stream");
      if (!h.has("cache-control")) h.set("cache-control", "public, max-age=0, must-revalidate");
      return new Response(request.method === "HEAD" ? null : corps, { headers: h });
    } catch (e) {
      return new Response("Introuvable", { status: 404 });
    }
  }
};

/* ---------- Le Worker lui-même, inchangé ---------- */
const { default: worker } = await import(path.join(RACINE, "worker.js"));
// Pas de limite de calcul ici (contrairement à l'offre gratuite Cloudflare) : un run complet est copié en une fois.
const env = { ASSETS, DB, DONNEES, LIMITEUR, FICHIERS_PAR_PASSAGE: process.env.FICHIERS_PAR_PASSAGE || "60" };
const enAttente = new Set();
const ctx = { waitUntil(p) { const x = Promise.resolve(p).catch((e) => console.error("tâche de fond :", e.message)); enAttente.add(x); x.finally(() => enAttente.delete(x)); } };

async function tache() {
  try { await new Promise((ok) => worker.scheduled({}, env, { waitUntil: (p) => Promise.resolve(p).finally(ok) })); }
  catch (e) { console.error("tâche planifiée :", e.message); }
}
tache();
setInterval(tache, 5 * 60 * 1000);

const serveur = http.createServer(async (req, res) => {
  try {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "inconnu";
    const hote = req.headers.host || `localhost:${PORT}`;
    const request = new Request(`http://${hote}${req.url}`, {
      method: req.method, headers: { ...Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === "string")), "cf-connecting-ip": ip }
    });
    const rep = await worker.fetch(request, env, ctx);
    const entetes = {};
    rep.headers.forEach((v, k) => { entetes[k] = v; });
    res.writeHead(rep.status, entetes);
    res.end(rep.body ? Buffer.from(await rep.arrayBuffer()) : undefined);
  } catch (e) {
    console.error(e);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }); res.end("Erreur interne");
  }
});
serveur.listen(PORT, HOTE, () => console.log(`Atlas Pacifica auto-hébergé : http://${HOTE === "0.0.0.0" ? "localhost" : HOTE}:${PORT}  (données : ${DONNEES_DIR})`));
