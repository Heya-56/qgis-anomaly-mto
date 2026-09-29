/* Atlas Pacifica — Worker Cloudflare.
   Les fichiers du site (dossier site/) sont servis directement par Cloudflare ; ce Worker ne répond qu'aux routes /api/.
   - /api/cyclones-actifs : relais GDACS (UE / ONU), cyclones actifs des dernières 48 h, cache 15 min
   - /api/enso-type       : gradient Niño3 − Niño4 des 3 derniers mois (NOAA CPC), cache 12 h
   - /api/mjo             : oscillation de Madden-Julian (indice ROMI temps réel, NOAA PSL), 40 derniers jours, cache 6 h
   - /api/catalogue       : derniers produits de modèles disponibles, avec leur traçabilité (base D1)
   - /donnees/<clé>       : fichiers de produits stockés dans R2 (images, grilles)
   Tâche planifiée (toutes les 5 minutes, copie progressive) : recopie dans R2 les produits publiés par GitHub Actions
   (release « donnees-modeles »), vérifie leurs empreintes SHA-256 et les inscrit au catalogue D1.
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

/* ================= Catalogue des produits de modèles (D1 + R2) ================= */
const DEPOT = "Heya-56/qgis-anomaly-mto";
const RELEASE = `https://github.com/${DEPOT}/releases/download/donnees-modeles/`;
const RUNS_GARDES = 8;
const CLE_SURE = /^modeles\/[a-z0-9-]+\/\d{10}\/[a-z0-9_]+\.(png|json)$/;

async function sha256(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function journal(env, source, statut, message) {
  await env.DB.prepare("INSERT INTO journal_donnees (quand, source_id, statut, message) VALUES (?, ?, ?, ?)")
    .bind(new Date().toISOString(), source, statut, String(message).slice(0, 500)).run();
}

/* Copie progressive : quelques fichiers par exécution, pour rester sous la limite de calcul
   de l'offre gratuite (10 ms par exécution). Le run est « partiel » tant que tous ses fichiers ne sont pas copiés. */
const FICHIERS_PAR_PASSAGE = 4;

async function synchroniser(env) {
  let cat;
  try {
    const r = await fetch(RELEASE + "catalogue.json", { cf: { cacheTtl: 0 } });
    if (!r.ok) throw new Error(`catalogue HTTP ${r.status}`);
    cat = await r.json();
  } catch (e) { await journal(env, "ecmwf-ifs", "erreur", e.message); return; }

  const source = String(cat.source_id || "");
  const runCompact = String(cat.run_utc || "").replace(/[^0-9]/g, "").slice(0, 10);
  if (!/^[a-z0-9-]+$/.test(source) || !/^\d{10}$/.test(runCompact) || !Array.isArray(cat.fichiers)) {
    await journal(env, source || "?", "erreur", "catalogue invalide"); return;
  }
  const runId = `${source}/${runCompact}`;
  const run = await env.DB.prepare("SELECT statut FROM runs WHERE id = ?").bind(runId).first();
  if (run && run.statut === "complet") return;
  if (!run) {
    await env.DB.prepare("INSERT OR IGNORE INTO runs (id, source_id, run_utc, recu_le, statut, manifeste) VALUES (?, ?, ?, ?, 'partiel', '{}')")
      .bind(runId, source, cat.run_utc, new Date().toISOString()).run();
    // Un run plus récent a remplacé la publication : les copies inachevées des runs précédents sont abandonnées et effacées.
    const abandonnes = await env.DB.prepare("SELECT id FROM runs WHERE source_id = ? AND statut = 'partiel' AND id != ?").bind(source, runId).all();
    for (const { id } of abandonnes.results || []) {
      const cles = ((await env.DB.prepare("SELECT cle FROM fichiers WHERE run_id = ?").bind(id).all()).results || []).map((x) => x.cle);
      if (cles.length) await env.DONNEES.delete(cles);
      await env.DB.batch([env.DB.prepare("DELETE FROM fichiers WHERE run_id = ?").bind(id), env.DB.prepare("DELETE FROM runs WHERE id = ?").bind(id)]);
      await journal(env, source, "abandon", `${id} : copie inachevée remplacée par ${runId}`);
    }
  }

  const faits = new Set(((await env.DB.prepare("SELECT cle FROM fichiers WHERE run_id = ?").bind(runId).all()).results || []).map((x) => x.cle));
  const attendus = cat.fichiers.slice(0, 45).map((f) => ({ f, cle: `modeles/${source}/${runCompact}/${String(f.nom || "")}` }));
  for (const { f, cle } of attendus) {
    if (!CLE_SURE.test(cle)) { await journal(env, source, "erreur", `nom refusé : ${f.nom}`); return; }
  }
  const restants = attendus.filter((x) => !faits.has(x.cle));

  const parPassage = Number(env.FICHIERS_PAR_PASSAGE) || FICHIERS_PAR_PASSAGE;
  for (const { f, cle } of restants.slice(0, parPassage)) {
    const r = await fetch(RELEASE + encodeURIComponent(f.nom), { cf: { cacheTtl: 0 } });
    if (!r.ok) { await journal(env, source, "erreur", `${f.nom} HTTP ${r.status}`); return; }
    const buf = await r.arrayBuffer();
    if ((await sha256(buf)) !== f.sha256) {
      await journal(env, source, "erreur", `${f.nom} : empreinte différente (publication en cours ?), nouvel essai plus tard`); return;
    }
    const type = f.type_mime === "image/png" ? "image/png" : "application/json";
    await env.DONNEES.put(cle, buf, { httpMetadata: { contentType: type } });
    await env.DB.prepare("INSERT OR REPLACE INTO fichiers (cle, run_id, produit, echeance_h, valide_utc, type_mime, octets, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(cle, runId, String(f.produit || ""), Number.isFinite(f.echeance_h) ? f.echeance_h : null, f.valide_utc || null, type, buf.byteLength, f.sha256).run();
  }

  if (restants.length > parPassage) {
    await journal(env, source, "en_cours", `${runId} : ${attendus.length - restants.length + parPassage}/${attendus.length} fichiers`);
    return;
  }

  const lignes = (await env.DB.prepare("SELECT cle, produit, echeance_h AS ech, valide_utc AS valide, type_mime AS type, octets, sha256 AS sha FROM fichiers WHERE run_id = ?").bind(runId).all()).results || [];
  const manifeste = { ...cat, fichiers: lignes.map((l) => ({ ...l, url: `/donnees/${l.cle}` })) };
  await env.DB.prepare("UPDATE runs SET statut = 'complet', manifeste = ?, recu_le = ? WHERE id = ?")
    .bind(JSON.stringify(manifeste), new Date().toISOString(), runId).run();
  await journal(env, source, "ok", `${runId} : ${lignes.length} fichiers`);

  // ménage : on garde les RUNS_GARDES derniers runs complets
  const vieux = await env.DB.prepare("SELECT id FROM runs WHERE source_id = ? ORDER BY run_utc DESC LIMIT -1 OFFSET ?")
    .bind(source, RUNS_GARDES).all();
  for (const { id } of vieux.results || []) {
    const cles = await env.DB.prepare("SELECT cle FROM fichiers WHERE run_id = ?").bind(id).all();
    const liste = (cles.results || []).map((x) => x.cle);
    if (liste.length) await env.DONNEES.delete(liste);
    await env.DB.batch([env.DB.prepare("DELETE FROM fichiers WHERE run_id = ?").bind(id), env.DB.prepare("DELETE FROM runs WHERE id = ?").bind(id)]);
  }
}

/* Secours si la tâche planifiée ne tourne pas : une consultation du catalogue relance une copie,
   au plus toutes les 4 minutes (horodatage conservé dans le journal). */
async function relancerSiBesoin(env, ctx) {
  const d = await env.DB.prepare("SELECT quand FROM journal_donnees ORDER BY id DESC LIMIT 1").first();
  if (d && Date.now() - Date.parse(d.quand) < 4 * 60 * 1000) return;
  await journal(env, "atlas", "relance", "copie déclenchée par une consultation");
  await env.DB.prepare("DELETE FROM journal_donnees WHERE id <= (SELECT MAX(id) - 500 FROM journal_donnees)").run();
  ctx.waitUntil(synchroniser(env).catch(() => {}));
}

async function catalogue(env, ctx) {
  if (!env.DB) return repondre({ erreur: "Catalogue non configuré" }, 503);
  if (env.DONNEES) await relancerSiBesoin(env, ctx).catch(() => {});
  const r = await env.DB.prepare(
    "SELECT r.id, r.source_id, r.run_utc, r.recu_le, r.manifeste, s.nom, s.licence, s.credit, s.url, s.frequence, s.limites " +
    "FROM runs r JOIN sources s ON s.id = r.source_id WHERE r.statut = 'complet' AND r.run_utc = " +
    "(SELECT MAX(run_utc) FROM runs r2 WHERE r2.source_id = r.source_id AND r2.statut = 'complet')").all();
  const sources = (r.results || []).map((x) => ({
    source: { id: x.source_id, nom: x.nom, licence: x.licence, credit: x.credit, url: x.url, frequence: x.frequence, limites: x.limites },
    run: { id: x.id, run_utc: x.run_utc, recu_le: x.recu_le }, ...JSON.parse(x.manifeste)
  }));
  const dernier = await env.DB.prepare("SELECT quand, source_id, statut, message FROM journal_donnees ORDER BY id DESC LIMIT 5").all();
  return repondre({ mise_a_jour: new Date().toISOString(), sources, journal: dernier.results || [] });
}

async function fichierDonnees(env, chemin) {
  const cle = chemin.replace(/^\/donnees\//, "");
  if (!CLE_SURE.test(cle) || !env.DONNEES) return repondre({ erreur: "Fichier inconnu" }, 404);
  const obj = await env.DONNEES.get(cle);
  if (!obj) return repondre({ erreur: "Fichier inconnu" }, 404);
  return new Response(obj.body, { headers: {
    "content-type": obj.httpMetadata?.contentType || "application/octet-stream",
    "cache-control": "public, max-age=86400, immutable",
    "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin", "etag": obj.httpEtag } });
}

/* MJO : indice ROMI temps réel (Kiladis et al. 2014), NOAA PSL. Colonnes : année mois jour heure PC1 PC2 amplitude.
   Conversion en équivalent RMM (Wheeler et Hendon 2004) indiquée par la NOAA : RMM1 ≈ PC2, RMM2 ≈ −PC1. */
const PSL_ROMI = "https://psl.noaa.gov/mjo/mjoindex/romi.cpcolr.1x.txt";
const REGIONS_MJO = { 1: "Afrique et ouest de l'océan Indien", 2: "Océan Indien", 3: "Océan Indien est",
  4: "Continent maritime (Indonésie)", 5: "Continent maritime (Indonésie)", 6: "Pacifique ouest",
  7: "Pacifique ouest et central", 8: "Hémisphère occidental et Afrique" };
function phaseRmm(x, y) {
  const a = Math.atan2(y, x) * 180 / Math.PI;   // −180..180
  return Math.min(8, Math.floor((a + 180) / 45) + 1);
}
async function mjo() {
  let texte;
  try {
    const r = await fetch(PSL_ROMI, { cf: { cacheTtl: 21600 } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    texte = await r.text();
  } catch (e) { return repondre({ erreur: "NOAA PSL indisponible" }, 502); }
  const jours = texte.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number))
    .filter((c) => c.length >= 7 && c.slice(0, 7).every(Number.isFinite) && c[6] < 50)
    .slice(-40).map((c) => {
      const rmm1 = c[5], rmm2 = -c[4], phase = phaseRmm(rmm1, rmm2);
      return { date: `${c[0]}-${String(c[1]).padStart(2, "0")}-${String(c[2]).padStart(2, "0")}`,
        rmm1: Math.round(rmm1 * 100) / 100, rmm2: Math.round(rmm2 * 100) / 100,
        amplitude: Math.round(c[6] * 100) / 100, phase };
    });
  if (!jours.length) return repondre({ erreur: "Fichier NOAA PSL illisible" }, 502);
  const d = jours[jours.length - 1];
  return repondre({ source: "NOAA PSL, indice ROMI temps réel (Kiladis et al. 2014)",
    methode: "Phase RMM équivalente : RMM1 = PC2, RMM2 = −PC1 ; MJO active si amplitude ≥ 1.",
    dernier: { ...d, active: d.amplitude >= 1, region: REGIONS_MJO[d.phase] }, jours, mise_a_jour: new Date().toISOString() });
}

/* Disponibilité réelle des couches NASA GIBS : date de la dernière image publiée (service DescribeDomains).
   Les produits quotidiens arrivent avec 1 à 3 jours de retard, variable : on demande plutôt que de deviner. */
const COUCHES_GIBS = new Set(["GOES-West_ABI_GeoColor", "GOES-West_ABI_Band13_Clean_Infrared", "IMERG_Precipitation_Rate_30min",
  "IMERG_Precipitation_Rate", "GHRSST_L4_MUR_Sea_Surface_Temperature", "GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies"]);
/* Liste les jours réellement publiés : la NASA laisse parfois des trous (ex. 25 et 27 publiés, pas le 26). */
function joursPublies(intervalles, depuis) {
  const jours = [];
  for (const iv of intervalles) {
    const [debut, fin, pas] = iv.split("/");
    if (!fin || pas !== "P1D") { if (/^\d{4}-\d{2}-\d{2}$/.test(iv)) jours.push(iv); continue; }
    for (let t = Math.max(Date.parse(debut.slice(0, 10) + "T00:00:00Z"), depuis); t <= Date.parse(fin.slice(0, 10) + "T00:00:00Z"); t += 864e5) {
      jours.push(new Date(t).toISOString().slice(0, 10));
    }
  }
  return [...new Set(jours)].sort();
}

async function gibsDispo(url) {
  const couche = url.searchParams.get("couche") || "";
  if (!COUCHES_GIBS.has(couche)) return repondre({ erreur: "Couche inconnue" }, 400);
  const j = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const debut = Date.now() - 45 * 864e5;
  // Même projection que la carte (Web Mercator, EPSG:3857) ; repli sur EPSG:4326.
  const essais = ["GoogleMapsCompatible_Level6", "GoogleMapsCompatible_Level7", "GoogleMapsCompatible_Level8"]
    .map((ms) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/${couche}/default/${ms}/all/${j(-45)}--${j(1)}.xml`)
    .concat(["2km", "1km"].map((ms) => `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/${couche}/default/${ms}/all/${j(-45)}--${j(1)}.xml`));
  for (const u of essais) {
    try {
      const r = await fetch(u, { cf: { cacheTtl: 1800 } });
      if (!r.ok) continue;
      const texte = await r.text();
      const dom = [...texte.matchAll(/<Domain>([^<]+)<\/Domain>/g)].map((m) => m[1]).join(",");
      const intervalles = dom.split(",").map((x) => x.trim()).filter(Boolean);
      if (!intervalles.length) continue;
      const dernier = intervalles[intervalles.length - 1].split("/");
      const fin = dernier.length >= 2 ? dernier[1] : dernier[0];
      if (!/^\d{4}-\d{2}-\d{2}/.test(fin)) continue;
      const jours = intervalles.some((x) => x.endsWith("/P1D")) ? joursPublies(intervalles, debut) : undefined;
      return repondre({ couche, derniere: fin, jours, source: "NASA GIBS DescribeDomains" });
    } catch (e) { /* essai suivant */ }
  }
  return repondre({ erreur: "NASA GIBS indisponible" }, 502);
}

const ROUTES = {
  "/api/cyclones-actifs": { duree: 900, produire: cyclonesActifs },
  "/api/enso-type": { duree: 43200, produire: ensoType },
  "/api/mjo": { duree: 21600, produire: mjo }
};

export default {
  async scheduled(evenement, env, ctx) {
    if (env.DB && env.DONNEES) ctx.waitUntil(synchroniser(env));
  },

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
    if (url.pathname === "/api/gibs-dispo") {
      if (env.LIMITEUR) {
        const { success } = await env.LIMITEUR.limit({ key: request.headers.get("cf-connecting-ip") || "inconnu" });
        if (!success) return repondre({ erreur: "Trop de requêtes, réessayez dans une minute." }, 429, { "retry-after": "60" });
      }
      const couche = url.searchParams.get("couche") || "";
      return avecCache(request, ctx, `/api/gibs-dispo?couche=${encodeURIComponent(couche)}`, 1800, () => gibsDispo(url));
    }
    if (url.pathname === "/api/catalogue" || url.pathname.startsWith("/donnees/")) {
      if (env.LIMITEUR) {
        const { success } = await env.LIMITEUR.limit({ key: request.headers.get("cf-connecting-ip") || "inconnu" });
        if (!success) return repondre({ erreur: "Trop de requêtes, réessayez dans une minute." }, 429, { "retry-after": "60" });
      }
      return url.pathname === "/api/catalogue" ? catalogue(env, ctx) : fichierDonnees(env, url.pathname);
    }
    if (url.pathname.startsWith("/api/")) return repondre({ erreur: "Route inconnue" }, 404);
    return env.ASSETS.fetch(request);
  }
};
