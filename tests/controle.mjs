/* Atlas Pacifica — contrôle de santé du site en ligne.
   Vérifie que chaque couche et chaque source affiche des données récentes, pas seulement que le site répond.
   Usage : node tests/controle.mjs [URL]   (sortie en Markdown ; code de sortie 1 si un problème bloquant est trouvé)
   Lancé chaque jour par .github/workflows/controle.yml, qui ouvre un ticket GitHub en cas de problème. */
import fs from "node:fs";
import vm from "node:vm";

const BASE = (process.argv[2] || "https://qgis-anomaly-mto.hinovadigital.workers.dev").replace(/\/$/, "");
const H = 3600e3, J = 24 * H;
const erreurs = [], alertes = [], ok = [];

async function obtenir(chemin, type = "json") {
  const r = await fetch(BASE + chemin, { headers: { "user-agent": "atlas-pacifica-controle" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return type === "json" ? r.json() : r.text();
}
async function verifier(nom, fn, bloquant = true) {
  try { const m = await fn(); ok.push(`${nom} : ${m}`); }
  catch (e) { (bloquant ? erreurs : alertes).push(`${nom} : ${e.message}`); }
}
const age = (d) => Date.now() - new Date(d).getTime();
const jours = (ms) => `${(ms / J).toFixed(1)} j`;

// Catalogue des couches, lu directement dans le code du site
const bac = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../site/assets/couches.js", import.meta.url), "utf8"), bac);
const COUCHES = bac.window.COUCHES;

// 1. Le site et ses fichiers essentiels répondent
await verifier("Page d'accueil", async () => {
  const html = await obtenir("/", "text");
  if (!html.includes("Atlas Pacifica")) throw new Error("titre absent");
  return "OK";
});
for (const f of ["/sw.js", "/manifest.webmanifest", "/assets/app.js", "/assets/couches.js", "/assets/fiches.js",
  "/assets/export.js", "/data/cyclones.json", "/data/saisons.json", "/data/oni.json", "/data/terres-pacifique.geojson"]) {
  await verifier(`Fichier ${f}`, async () => { await obtenir(f, "text"); return "OK"; });
}

// 2. Chaque couche NASA : la dernière image publiée doit être récente
const RETARD_MAX = { "10min": 6 * H, "30min": 18 * H, "1j": 5 * J };
for (const c of COUCHES.filter((x) => x.gibs)) {
  await verifier(`Couche NASA « ${c.nom} »`, async () => {
    const j = await obtenir(`/api/gibs-dispo?couche=${encodeURIComponent(c.gibs)}`);
    const a = age(j.derniere.length === 10 ? j.derniere + "T00:00:00Z" : j.derniere);
    if (a > RETARD_MAX[c.pas]) throw new Error(`dernière image le ${j.derniere} (il y a ${jours(a)}) : la NASA ne met peut-être plus à jour ce produit`);
    return `dernière image ${j.derniere}`;
  });
}

// 3. Couches de modèle ECMWF : run récent et tous les produits présents
await verifier("Modèle ECMWF (catalogue)", async () => {
  const cat = await obtenir("/api/catalogue");
  const s = (cat.sources || []).find((x) => x.source && x.source.id === "ecmwf-ifs");
  if (!s) throw new Error("aucun run complet dans le catalogue");
  const a = age(s.run_utc.replace("Z", ":00Z"));
  if (a > 30 * H) throw new Error(`dernier run ${s.run_utc}, il y a ${jours(a)} (GitHub Actions ou la copie vers R2 est bloquée)`);
  const manquants = COUCHES.filter((c) => c.modele && !(s.produits && s.produits[c.modele])).map((c) => c.modele);
  if (manquants.length) throw new Error(`produits absents du dernier run : ${manquants.join(", ")}`);
  const erreurCopie = (cat.journal || []).find((l) => l.statut === "erreur" && age(l.quand) < 6 * H);
  if (erreurCopie) alertes.push(`Copie ECMWF : ${erreurCopie.message} (${erreurCopie.quand})`);
  return `run ${s.run_utc}, ${Object.keys(s.produits).length} produits`;
});
await verifier("Image de modèle servie", async () => {
  const cat = await obtenir("/api/catalogue");
  const f = cat.sources[0].fichiers.find((x) => x.type === "image/png");
  const r = await fetch(BASE + f.url);
  if (!r.ok || !(r.headers.get("content-type") || "").includes("image/png")) throw new Error(`${f.url} : HTTP ${r.status}`);
  return "OK";
});

// 4. Indices climatiques et cyclones en cours
await verifier("MJO (NOAA PSL)", async () => {
  const j = await obtenir("/api/mjo");
  const a = age(j.dernier.date + "T00:00:00Z");
  if (a > 14 * J) throw new Error(`dernière valeur le ${j.dernier.date}`);
  return `phase ${j.dernier.phase}, amplitude ${j.dernier.amplitude} (${j.dernier.date})`;
});
await verifier("Type d'El Niño (NOAA CPC)", async () => {
  const j = await obtenir("/api/enso-type");
  if (typeof j.gradient !== "number") throw new Error("valeur absente");
  const der = j.mois[j.mois.length - 1].mois;
  if (age(der + "-15T00:00:00Z") > 75 * J) throw new Error(`dernier mois ${der}`);
  return `Niño3 − Niño4 ${j.gradient} °C (${der})`;
});
await verifier("Cyclones en cours (GDACS)", async () => {
  const j = await obtenir("/api/cyclones-actifs");
  return `${j.cyclones.length} système(s)`;
});
await verifier("ONI dans l'atlas", async () => {
  const j = await obtenir("/data/oni.json");
  const der = j.mois[j.mois.length - 1][0];
  if (age(der + "-15T00:00:00Z") > 120 * J) throw new Error(`dernier mois ${der} : relancer le pipeline 02 → 07 sur le PC`);
  return `dernier mois ${der}`;
}, false);

// Rapport
const lignes = [`# Contrôle Atlas Pacifica — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, "", `Site : ${BASE}`, ""];
if (erreurs.length) lignes.push("## Problèmes", ...erreurs.map((e) => `- ❌ ${e}`), "");
if (alertes.length) lignes.push("## À surveiller", ...alertes.map((e) => `- ⚠️ ${e}`), "");
lignes.push("## Vérifications réussies", ...ok.map((e) => `- ✅ ${e}`));
console.log(lignes.join("\n"));
process.exit(erreurs.length ? 1 : 0);
