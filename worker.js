/* Atlas Pacifica — Worker Cloudflare.
   Les fichiers du site (dossier site/) sont servis directement par Cloudflare ; ce Worker ne répond qu'aux routes /api/.
   - /api/cyclones-actifs : relais GDACS (UE / ONU), cyclones actifs des dernières 48 h, cache 15 min
   - /api/enso-type       : gradient Niño3 − Niño4 des 3 derniers mois (NOAA CPC), cache 12 h
   Sécurité : lecture seule (GET/HEAD), limitation de débit par adresse IP, textes externes nettoyés, en-têtes stricts. */

const GDACS_LISTE = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC";
const CPC_NINO = "https://www.cpc.ncep.noaa.gov/data/indices/sstoi.indices";
const FENETRE_ACTIFS_MS = 48 * 3600 * 1000;
const SEUIL_EST = 0.5, SEUIL_CENTRE = 0.0;   // mêmes seuils que scripts/config.py

const ENTETES_API = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-resource-policy": "same-origin",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'"
};

function repondre(corps, statut = 200, extra = {}) {
  return new Response(JSON.stringify(corps), { status: statut, headers: { ...ENTETES_API, ...extra } });
}

/* Texte venant d'un service externe : on retire tout ce qui pourrait être interprété comme du HTML. */
function propre(s, max = 200) {
  return String(s == null ? "" : s).replace(/[<>&"'`]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
function lienSur(u, domaine) {
  try { const x = new URL(u); return x.protocol === "https:" && x.hostname.endsWith(domaine) ? x.toString() : ""; }
  catch (e) { return ""; }
}
function nombre(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

async function lireJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" }, cf: { cacheTtl: 900 } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* Met en cache la réponse d'une route au plus près du visiteur (réduit les appels aux services externes). */
async function avecCache(request, ctx, cle, dureeS, produire) {
  const cache = caches.default;
  const req = new Request(new URL(cle, request.url).toString());
  const trouve = await cache.match(req);
  if (trouve) return trouve;
  const reponse = await produire();
  if (reponse.status === 200) {
    reponse.headers.set("cache-control", `public, max-age=${dureeS}`);
    ctx.waitUntil(cache.put(req, reponse.clone()));
  }
  return reponse;
}

async function cyclonesActifs() {
  let liste;
  try { liste = await lireJson(GDACS_LISTE); }
  catch (e) { return repondre({ erreur: "GDACS indisponible" }, 502); }

  const maintenant = Date.now();
  const actifs = (liste.features || []).filter((f) => {
    const p = f.properties || {};
    const courant = p.iscurrent === true || p.iscurrent === "true";
    const fin = Date.parse(p.todate || "");
    return courant && Number.isFinite(fin) && maintenant - fin <= FENETRE_ACTIFS_MS;
  });

  const cyclones = await Promise.all(actifs.slice(0, 12).map(async (f) => {
    const p = f.properties;
    let geometrie = null;
    const urlGeo = lienSur(p.url && p.url.geometry, "gdacs.org");
    if (urlGeo) {
      try {
        const g = await lireJson(urlGeo);
        geometrie = {
          type: "FeatureCollection",
          features: (g.features || [])
            .filter((x) => x.geometry && x.properties && x.properties.Class !== "Point_Centroid")
            .slice(0, 400)
            .map((x) => ({ type: "Feature", geometry: x.geometry,
              properties: { classe: propre(x.properties.Class, 30), libelle: propre(x.properties.polygonlabel, 60),
                date: propre(x.properties.polygondate, 30) } }))
        };
      } catch (e) { /* géométrie facultative */ }
    }
    const pos = f.geometry && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates.slice(0, 2).map(nombre) : null;
    return {
      id: nombre(p.eventid), episode: nombre(p.episodeid),
      nom: propre(p.name || p.eventname, 60).replace(/^Tropical Cyclone\s+/i, ""),
      alerte: ["Green", "Orange", "Red"].includes(p.alertlevel) ? p.alertlevel : "",
      vent_kmh: p.severitydata ? Math.round(nombre(p.severitydata.severity) || 0) || null : null,
      texte: propre(p.severitydata && p.severitydata.severitytext, 200),
      debut: propre(p.fromdate, 30), fin: propre(p.todate, 30),
      pays: propre(p.country, 120), rapport: lienSur(p.url && p.url.report, "gdacs.org"),
      position: pos && pos.every((v) => v !== null) ? pos : null, geometrie
    };
  }));

  return repondre({ source: "GDACS (Commission européenne / ONU)", fenetre_h: 48,
    mise_a_jour: new Date().toISOString(), cyclones });
}

/* Type d'El Niño en cours d'évolution : Niño3 − Niño4 (Kug et al. 2009), moyenne des 3 derniers mois.
   Le type officiel de l'atlas reste calculé sur déc.-fév. ; ceci n'est qu'une tendance. */
async function ensoType() {
  let texte;
  try {
    const r = await fetch(CPC_NINO, { cf: { cacheTtl: 43200 } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    texte = await r.text();
  } catch (e) { return repondre({ erreur: "NOAA CPC indisponible" }, 502); }

  const lignes = texte.trim().split(/\r?\n/).slice(1)
    .map((l) => l.trim().split(/\s+/).map(Number))
    .filter((c) => c.length >= 10 && c.every(Number.isFinite));
  if (lignes.length < 3) return repondre({ erreur: "Fichier NOAA CPC illisible" }, 502);

  const der = lignes.slice(-3).map((c) => ({ mois: `${c[0]}-${String(c[1]).padStart(2, "0")}`, n3: c[5], n4: c[7], n34: c[9] }));
  const moy = (k) => der.reduce((s, x) => s + x[k], 0) / der.length;
  const gradient = Math.round((moy("n3") - moy("n4")) * 100) / 100;
  const tendance = gradient > SEUIL_EST ? "Est" : gradient < SEUIL_CENTRE ? "Centre" : "Mixte";
  return repondre({ source: "NOAA CPC (sstoi.indices)", methode: "Niño3 − Niño4, moyenne des 3 derniers mois (Kug et al. 2009)",
    seuils: { est: SEUIL_EST, centre: SEUIL_CENTRE }, mois: der, gradient, tendance, mise_a_jour: new Date().toISOString() });
}

const ROUTES = {
  "/api/cyclones-actifs": { duree: 900, produire: cyclonesActifs },
  "/api/enso-type": { duree: 43200, produire: ensoType }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return repondre({ erreur: "Méthode non autorisée" }, 405, { allow: "GET, HEAD" });
    }

    const route = ROUTES[url.pathname];
    if (route) {
      if (env.LIMITEUR) {
        const ip = request.headers.get("cf-connecting-ip") || "inconnu";
        const { success } = await env.LIMITEUR.limit({ key: ip });
        if (!success) return repondre({ erreur: "Trop de requêtes, réessayez dans une minute." }, 429, { "retry-after": "60" });
      }
      return avecCache(request, ctx, url.pathname, route.duree, route.produire);
    }
    if (url.pathname.startsWith("/api/")) return repondre({ erreur: "Route inconnue" }, 404);
    return env.ASSETS.fetch(request);
  }
};
