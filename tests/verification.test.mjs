/* Atlas Pacifica — tests automatiques lancés à chaque modification (GitHub Actions « Vérification »).
   Ils attrapent les erreurs de cohérence AVANT qu'elles n'arrivent sur le site : fichier oublié,
   couche sans produit, fiche manquante, route du Worker cassée.   Lancer à la main : node --test tests/*.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const racine = new URL("../", import.meta.url);
const lire = (f) => fs.readFileSync(new URL(f, racine), "utf8");
const existe = (f) => fs.existsSync(new URL(f, racine));

function charger(fichier) {
  const bac = { window: {} };
  vm.runInNewContext(lire(fichier), bac);
  return bac.window;
}
const { COUCHES } = charger("site/assets/couches.js");
const { FICHES } = charger("site/assets/fiches.js");

test("chaque fichier référencé par la page existe", () => {
  const html = lire("site/index.html");
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]).filter((r) => !r.startsWith("http"));
  for (const r of refs) assert.ok(existe("site/" + r), `index.html référence ${r}, introuvable`);
});

test("chaque fichier mis en cache par le service worker existe", () => {
  const sw = lire("site/sw.js");
  const liste = [...sw.matchAll(/"((?:assets|vendor|icones|data)\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(liste.length > 10);
  for (const f of liste) assert.ok(existe("site/" + f), `sw.js met en cache ${f}, introuvable`);
});

test("chaque couche de modèle correspond à un produit calculé par le pipeline", () => {
  const py = lire("pipeline/modeles_ecmwf.py");
  for (const c of COUCHES.filter((x) => x.modele)) {
    assert.ok(py.includes(`"${c.modele}": dict(`), `la couche ${c.id} attend le produit ${c.modele}, absent de modeles_ecmwf.py`);
  }
});

test("chaque couche NASA est autorisée par le Worker", () => {
  const w = lire("worker.js");
  for (const c of COUCHES.filter((x) => x.gibs)) assert.ok(w.includes(`"${c.gibs}"`), `${c.gibs} absent de COUCHES_GIBS (worker.js)`);
});

test("chaque bouton « Pourquoi ? » renvoie vers une fiche complète", () => {
  const refs = new Set([...COUCHES.map((c) => c.fiche).filter(Boolean),
    ...[...lire("site/index.html").matchAll(/data-fiche="([^"]+)"/g)].map((m) => m[1])]);
  for (const id of refs) {
    const f = FICHES[id];
    assert.ok(f, `fiche « ${id} » introuvable`);
    for (const k of ["titre", "definition", "importance", "lecture", "limites"]) assert.ok(f[k], `fiche ${id} : champ ${k} vide`);
    if (f.couche) assert.ok(COUCHES.some((c) => c.id === f.couche), `fiche ${id} renvoie vers la couche ${f.couche}, inexistante`);
  }
});

test("chaque couche a un nom, un groupe et une source", () => {
  const ids = new Set();
  for (const c of COUCHES) {
    assert.ok(!ids.has(c.id), `identifiant en double : ${c.id}`); ids.add(c.id);
    assert.ok(c.nom && c.groupe, `couche ${c.id} : nom ou groupe manquant`);
    if (c.gibs || c.modele) assert.ok(c.source, `couche ${c.id} : source (crédit) manquante`);
  }
});

/* ---------------- Worker : routes testées avec des réponses simulées ---------------- */
const { default: worker } = await import(new URL("worker.js", racine));
globalThis.caches = { default: { match: async () => null, put: async () => {} } };
const ctx = { waitUntil: () => {} };
const appel = (chemin, env = { ASSETS: { fetch: async () => new Response("asset") } }, methode = "GET") =>
  worker.fetch(new Request("https://atlas.test" + chemin, { method: methode }), env, ctx);

test("Worker : dernière image NASA lue dans DescribeDomains", async () => {
  globalThis.fetch = async () => new Response("<Domain>2026-09-01/2026-09-20/P1D,2026-09-22/2026-09-25/P1D</Domain>");
  const r = await appel("/api/gibs-dispo?couche=GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).derniere, "2026-09-25");
  assert.equal((await appel("/api/gibs-dispo?couche=inconnue")).status, 400);
});

test("Worker : cyclones en cours filtrés sur 48 h et textes nettoyés", async () => {
  const maintenant = new Date().toISOString();
  globalThis.fetch = async (u) => String(u).includes("geteventlist")
    ? new Response(JSON.stringify({ features: [
      { properties: { iscurrent: "true", todate: maintenant, eventid: 1, name: "Tropical Cyclone <b>A</b>", alertlevel: "Red", url: { report: "javascript:x" } }, geometry: { coordinates: [178, -17] } },
      { properties: { iscurrent: "true", todate: "2020-01-01T00:00:00", eventid: 2, name: "VIEUX" }, geometry: { coordinates: [0, 0] } }] }))
    : new Response("{}");
  const j = await (await appel("/api/cyclones-actifs")).json();
  assert.equal(j.cyclones.length, 1);
  assert.ok(!/[<>]/.test(j.cyclones[0].nom));
  assert.equal(j.cyclones[0].rapport, "");
});

test("Worker : MJO convertie en phase RMM", async () => {
  globalThis.fetch = async () => new Response("2026  9 20  0     -1.00000     0.10000     1.00500\n");
  const j = await (await appel("/api/mjo")).json();
  assert.ok(j.dernier.phase >= 1 && j.dernier.phase <= 8);
  assert.equal(j.dernier.active, true);
});

test("Worker : lecture seule et routes inconnues refusées", async () => {
  assert.equal((await appel("/", undefined, "POST")).status, 405);
  assert.equal((await appel("/api/nexiste-pas")).status, 404);
  assert.equal((await appel("/donnees/prive/secret.txt", { ASSETS: {}, DONNEES: { get: async () => new Response("secret") } })).status, 404);
});
