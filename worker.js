/* Atlas Climat Pacifique — Worker Cloudflare.
   Sert le site (dossier site/) et le relais /api/cyclones-actifs vers GDACS (UE / ONU), mis en cache 15 minutes. */
const LISTE = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC";

async function json(url) {
  const r = await fetch(url, { headers: { accept: "application/json" }, cf: { cacheTtl: 900 } });
  if (!r.ok) throw new Error(`GDACS ${r.status}`);
  return r.json();
}

async function cyclonesActifs(request, ctx) {
  const cache = caches.default;
  const cle = new Request(new URL("/api/cyclones-actifs", request.url).toString());
  const enCache = await cache.match(cle);
  if (enCache) return enCache;

  let corps;
  try {
    const liste = await json(LISTE);
    const actifs = (liste.features || []).filter((f) => f.properties && (f.properties.iscurrent === true || f.properties.iscurrent === "true"));
    const cyclones = await Promise.all(actifs.slice(0, 12).map(async (f) => {
      const p = f.properties;
      let geometrie = null;
      try {
        const g = await json(p.url.geometry);
        geometrie = {
          type: "FeatureCollection",
          features: (g.features || [])
            .filter((x) => x.geometry && x.properties && x.properties.Class !== "Point_Centroid")
            .map((x) => ({ type: "Feature", geometry: x.geometry,
              properties: { classe: x.properties.Class || "", libelle: x.properties.polygonlabel || "", date: x.properties.polygondate || "" } }))
        };
      } catch (e) { /* géométrie facultative */ }
      return {
        id: p.eventid, episode: p.episodeid,
        nom: String(p.name || p.eventname || "").replace(/^Tropical Cyclone\s+/i, ""),
        alerte: p.alertlevel, vent_kmh: p.severitydata ? Math.round(p.severitydata.severity) : null,
        texte: p.severitydata ? p.severitydata.severitytext : "", debut: p.fromdate, fin: p.todate,
        pays: p.country || "", rapport: p.url ? p.url.report : "",
        position: f.geometry && f.geometry.coordinates, geometrie
      };
    }));
    corps = { source: "GDACS (Commission européenne / ONU)", mise_a_jour: new Date().toISOString(), cyclones };
  } catch (e) {
    return new Response(JSON.stringify({ erreur: "GDACS indisponible", detail: String(e) }), {
      status: 502, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  const reponse = new Response(JSON.stringify(corps), { headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=900" } });
  ctx.waitUntil(cache.put(cle, reponse.clone()));
  return reponse;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/cyclones-actifs") return cyclonesActifs(request, ctx);
    return env.ASSETS.fetch(request);
  }
};
