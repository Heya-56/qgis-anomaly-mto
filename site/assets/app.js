/* Atlas Pacifica — atlas climatologique du Pacifique en direct (JAMstack + Worker Cloudflare, sans clé d'API) */
(() => {
  "use strict";

  const COUCHES = window.COUCHES;
  const SRC = window.SOURCES;
  const $ = (id) => document.getElementById(id);
  const TZ = "Pacific/Tahiti";
  const fJour = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  const fHeure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const fJourUTC = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const fCourt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  const MOIS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const COUL = { texte: "#e8eef0", texte2: "#9bb0b8", accent: "#f2b445", pluie: "#6fb7d6", chaud: "#e5604a", froid: "#4f97de" };
  const PHASES = { "El Niño fort": "#e5604a", "El Niño": "#f09a84", "Neutre": "#7d8b91", "La Niña": "#8fbde9", "La Niña forte": "#4f97de" };

  const normLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
  const signe = (v, d = 1) => (v > 0 ? "+" : "") + v.toFixed(d).replace(".", ",");
  const nombre = (v, d = 0) => v.toFixed(d).replace(".", ",");
  const lib = (s) => `${s - 1}-${String(s).slice(2)}`;
  async function lireJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  /* ================= Carte ================= */
  const carte = L.map("carte", {
    center: [-15, -150], zoom: 4, minZoom: 2, maxZoom: 9, worldCopyJump: true, zoomControl: false
  });
  L.control.zoom({ position: "topright" }).addTo(carte);
  carte.attributionControl.setPrefix(false);
  [["donnees", 300], ["episodes", 350], ["reperes", 390]].forEach(([n, z]) => {
    carte.createPane(n);
    carte.getPane(n).style.zIndex = z;
  });
  carte.getPane("reperes").style.pointerEvents = "none";

  function wms(couche, options = {}) {
    return L.tileLayer.wms(SRC.gibsWms, Object.assign({
      layers: couche, format: "image/png", transparent: true, version: "1.3.0", uppercase: true,
      pane: "donnees", attribution: '<a href="https://www.earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a>'
    }, options));
  }

  wms("BlueMarble_ShadedRelief_Bathymetry", { format: "image/jpeg", transparent: false, pane: "tilePane" }).addTo(carte);
  const reperes = L.layerGroup([wms("Coastlines_15m", { pane: "reperes" }), wms("Reference_Labels_15m", { pane: "reperes" })]).addTo(carte);

  /* Fond de carte hors ligne : terres du Pacifique (Natural Earth 1:10 M, domaine public), stocké sur l'appareil.
     Affiché à la place des images NASA quand il n'y a pas de réseau. */
  carte.createPane("horsligne");
  carte.getPane("horsligne").style.zIndex = 250;
  const horsLigne = { calque: null };
  async function majFondHorsLigne() {
    const actif = !navigator.onLine;
    document.body.classList.toggle("sans-reseau", actif);
    if (!actif) { if (horsLigne.calque) carte.removeLayer(horsLigne.calque); return; }
    if (!horsLigne.calque) {
      let terres;
      try { terres = await lireJson("data/terres-pacifique.geojson"); } catch (e) { return; }
      horsLigne.calque = L.geoJSON(terres, {
        pane: "horsligne", interactive: false,
        style: { color: "#9fc1cc", weight: 1, fillColor: "#35505c", fillOpacity: 1 }
      });
    }
    horsLigne.calque.addTo(carte);
  }
  window.addEventListener("online", majFondHorsLigne);
  window.addEventListener("offline", majFondHorsLigne);
  carte.attributionControl.addAttribution('Prévisions <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · Normales <a href="https://power.larc.nasa.gov" target="_blank" rel="noopener">NASA POWER</a>');

  /* ================= Couches et animation ================= */
  const etat = { couche: null, dates: [], index: 0, calques: [], lecture: false, minuterie: null };

  function pasMs(p) { return p === "10min" ? 6e5 : p === "30min" ? 18e5 : 864e5; }
  /* Dernière image réellement publiée par la NASA (Worker /api/gibs-dispo), mémorisée 30 min. */
  const dispo = {};
  async function derniereDispo(c) {
    const m = dispo[c.gibs];
    if (m && Date.now() - m.t < 18e5) return m.d;
    try {
      const ctrl = new AbortController(); const minut = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`api/gibs-dispo?couche=${encodeURIComponent(c.gibs)}`, { signal: ctrl.signal });
      clearTimeout(minut);
      if (!r.ok) return null;
      const j = await r.json();
      const d = new Date(j.derniere.length === 10 ? j.derniere + "T00:00:00Z" : j.derniere);
      if (isNaN(d)) return null;
      d.jours = Array.isArray(j.jours) ? j.jours : null;   // jours réellement publiés (produits quotidiens)
      dispo[c.gibs] = { d, t: Date.now() };
      return d;
    } catch (e) { return null; }
  }
  function datesCouche(c, fin) {
    const out = [];
    // Produits quotidiens : uniquement les jours que la NASA a réellement publiés (elle laisse parfois des trous).
    if (c.pas === "1j" && fin && fin.jours && fin.jours.length) {
      return fin.jours.slice(-c.images).map((x) => new Date(x + "T00:00:00Z"));
    }
    if (c.pas === "1j") {
      const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - c.latence_j);
      if (fin) { const f = new Date(fin); f.setUTCHours(0, 0, 0, 0); if (f < d) d.setTime(f.getTime()); }
      for (let i = c.images - 1; i >= 0; i--) { const x = new Date(d); x.setUTCDate(d.getUTCDate() - i); out.push(x); }
    } else {
      const p = pasMs(c.pas);
      let limite = Date.now() - c.latence_min * 6e4;
      if (fin) limite = Math.min(limite, fin.getTime());
      const dernier = Math.floor(limite / p) * p;
      for (let i = c.images - 1; i >= 0; i--) out.push(new Date(dernier - i * p));
    }
    return out;
  }
  /* Couches de modèles : produits pré-calculés (GitHub Actions → R2), décrits par /api/catalogue. */
  const modeles = { catalogue: null, promesse: null };
  function lireCatalogue() {
    if (!modeles.promesse) modeles.promesse = lireJson("api/catalogue").then((j) => (modeles.catalogue = j)).catch((e) => { modeles.promesse = null; throw e; });
    return modeles.promesse;
  }
  async function preparerModele(c) {
    const cat = await lireCatalogue();
    for (const s of cat.sources || []) {
      const p = s.produits && s.produits[c.modele];
      if (!p) continue;
      const images = s.fichiers.filter((f) => f.produit === c.modele && f.type === "image/png" && f.ech !== null)
        .sort((a, b) => a.ech - b.ech);
      if (!images.length) continue;
      return { produit: p, source: s, images };
    }
    return null;
  }
  const libelleEcheance = (f, run) => {
    const d = new Date(f.valide.replace("Z", ":00Z"));
    return `${f.ech === 0 ? "Analyse" : `Prévision +${f.ech} h`} · ${fJour.format(d)} ${fHeure.format(d)} Tahiti · run ${run.slice(8, 10)}/${run.slice(5, 7)} ${run.slice(11, 13)} h UTC`;
  };

  const tempsWms = (c, d) => (c.pas === "1j" ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 19) + "Z");
  const libelleDate = (c, d) => (c.pas === "1j"
    ? fJourUTC.format(d)
    : `${fJour.format(d)} · ${fHeure.format(d)} Tahiti · ${d.toISOString().slice(11, 16)} UTC`);

  function construireBoutons() {
    const box = $("couches");
    let groupe = null;
    COUCHES.forEach((c) => {
      if (c.groupe && c.groupe !== groupe) {
        groupe = c.groupe;
        const h = document.createElement("p");
        h.className = "couches-groupe"; h.textContent = groupe;
        box.appendChild(h);
      }
      const b = document.createElement("button");
      b.className = "couche"; b.type = "button"; b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", "false"); b.dataset.id = c.id;
      b.innerHTML = `<strong>${c.nom}</strong><small>${c.detail}</small><span class="pastille" aria-hidden="true"></span>`;
      b.addEventListener("click", () => {
        choisirCouche(c.id);
        // Sur téléphone, on referme le panneau pour montrer la carte tout de suite.
        if (window.matchMedia("(max-width: 820px)").matches) fermerRail();
      });
      box.appendChild(b);
    });
  }

  function viderCalques() {
    arreter();
    etat.calques.forEach((l) => l && carte.removeLayer(l));
    etat.calques = [];
  }

  function choisirCouche(id) {
    const c = COUCHES.find((x) => x.id === id);
    document.querySelectorAll(".couche").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === id)));
    viderCalques();
    etat.couche = c;
    $("rail-ouvrir-couche").textContent = c.gibs || c.modele ? "· " + c.nom : "";
    if (c.modele) { choisirModele(c); return; }
    if (!c.gibs) { $("temps").hidden = true; majLegende(); majGlobeDonnees(); return; }
    choisirGibs(c);
  }

  async function choisirGibs(c) {
    $("temps").hidden = false;
    majEtat("Recherche de la dernière image publiée par la NASA…");
    const fin = await derniereDispo(c);
    if (etat.couche !== c) return;
    // Couche que la NASA ne met plus à jour : on le dit clairement au lieu d'afficher une carte vide.
    const retardMax = c.pas === "1j" ? 10 * 864e5 : 2 * 864e5;
    if (fin && Date.now() - fin.getTime() > retardMax) {
      etat.dates = []; etat.calques = [];
      $("temps-date").textContent = c.nom;
      majEtat(`La NASA ne publie plus cette couche depuis le ${fJourUTC.format(fin)}. Choisissez une autre couche.`);
      majLegende();
      return;
    }
    etat.dates = datesCouche(c, fin);
    etat.calques = new Array(etat.dates.length).fill(null);
    const cur = $("temps-curseur");
    cur.max = String(etat.dates.length - 1);
    cur.value = cur.max;
    $("temps").hidden = false;
    afficher(etat.dates.length - 1);
    majLegende();
  }

  async function choisirModele(c) {
    etat.modele = null;
    $("temps").hidden = false;
    $("temps-date").textContent = c.nom;
    majEtat("Chargement du catalogue des modèles…");
    let m = null;
    try { m = await preparerModele(c); } catch (e) { m = null; }
    if (etat.couche !== c) return;
    if (!m) { majEtat("Produit pas encore disponible : il arrive automatiquement après le prochain run du modèle."); majLegende(); return; }
    etat.modele = m;
    etat.dates = m.images.map((f) => new Date(f.valide.replace("Z", ":00Z")));
    etat.calques = new Array(etat.dates.length).fill(null);
    const cur = $("temps-curseur");
    cur.max = String(etat.dates.length - 1);
    cur.value = "0";
    afficher(0);
    majLegende();
    majGlobeDonnees();
  }

  function calque(i) {
    if (etat.calques[i]) return etat.calques[i];
    const c = etat.couche;
    if (c.modele) {
      const l = L.imageOverlay(etat.modele.images[i].url, etat.modele.produit.bornes,
        { pane: "donnees", opacity: 0, interactive: false, className: "image-modele" });
      l._erreurs = 0; l._charge = false;
      l.on("load", () => { l._charge = true; if (i === etat.index) majEtat(); });
      l.on("error", () => { l._erreurs++; if (i === etat.index) majEtat(); });
      l.addTo(carte);
      etat.calques[i] = l;
      return l;
    }
    const l = wms(c.gibs, { time: tempsWms(c, etat.dates[i]), format: c.format, opacity: 0 });
    l._erreurs = 0; l._charge = false;
    l.on("loading", () => { l._erreurs = 0; l._charge = false; });
    l.on("tileerror", () => { l._erreurs++; if (i === etat.index) majEtat(); });
    l.on("load", () => { l._charge = true; if (i === etat.index) majEtat(); });
    l.addTo(carte);
    etat.calques[i] = l;
    return l;
  }

  function afficher(i) {
    etat.index = i;
    const l = calque(i);
    etat.calques.forEach((x) => x && x.setOpacity(x === l ? 1 : 0));
    $("temps-curseur").value = String(i);
    $("temps-date").textContent = etat.couche.modele
      ? libelleEcheance(etat.modele.images[i], etat.modele.source.run_utc) : libelleDate(etat.couche, etat.dates[i]);
    majEtat();
    if (vueGlobe()) majGlobeDonnees();
  }

  function majEtat(texte) {
    const e = $("temps-etat");
    if (texte) { e.textContent = texte; return; }
    const l = etat.calques[etat.index];
    if (l && l._erreurs > 0) e.textContent = etat.couche && etat.couche.modele
      ? "Image indisponible pour cette échéance." : "Image pas encore publiée par la NASA : reculez d'un cran.";
    else if (l && !l._charge) e.textContent = "Chargement…";
    else e.textContent = `${etat.index + 1} / ${etat.dates.length}`;
  }

  function iconeLecture(pause) {
    $("lecture-icone").setAttribute("d", pause ? "M7 5h4v14H7zM13 5h4v14h-4z" : "M8 5v14l11-7z");
    $("lecture").setAttribute("aria-label", pause ? "Mettre l'animation en pause" : "Lancer l'animation");
  }

  async function lancer() {
    if (!etat.couche || (!etat.couche.gibs && !(etat.couche.modele && etat.modele))) return;
    etat.lecture = true; iconeLecture(true);
    const n = etat.dates.length;
    if (!vueGlobe()) for (let i = 0; i < n; i++) calque(i);
    const t0 = Date.now();
    while (!vueGlobe() && etat.lecture && Date.now() - t0 < 25000) {
      const prets = etat.calques.filter((l) => l && (l._charge || l._erreurs > 0)).length;
      majEtat(`Préparation de l'animation : ${prets} / ${n} images`);
      if (prets >= n) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!etat.lecture) return;
    let i = 0;
    afficher(0);
    etat.minuterie = setInterval(() => {
      i = (i + 1) % (n + 3);            // courte pause sur la dernière image
      if (i < n) afficher(i);
    }, vueGlobe() ? 1200 : 650);
  }
  function arreter() {
    etat.lecture = false; clearInterval(etat.minuterie); etat.minuterie = null; iconeLecture(false);
  }
  $("lecture").addEventListener("click", () => (etat.lecture ? (arreter(), majEtat()) : lancer()));
  $("temps-curseur").addEventListener("input", (e) => { arreter(); afficher(Number(e.target.value)); });

  /* Export d'une couche de modèle : image de l'échéance affichée (avec légende) ou valeurs sur la grille de 1°. */
  document.addEventListener("click", async (e) => {
    const b = e.target.closest && e.target.closest("[data-export]");
    if (!b || !etat.modele) return;
    const m = etat.modele, f = m.images[etat.index], p = m.produit;
    const base = `${etat.couche.modele}_run${m.source.run_utc.replace(/[^0-9]/g, "").slice(0, 10)}_plus${f.ech}h`;
    const source = `${m.source.source.nom}, run du ${m.source.run_utc} · ${m.source.source.credit}`;
    const titre = `${p.titre} (${p.unite}) · ${libelleEcheance(f, m.source.run_utc)}`;
    if (b.dataset.export === "modele-png") {
      const img = new Image();
      img.onload = async () => {
        // image du modèle + côtes et îles (Natural Earth), dans la même projection Web Mercator
        const k = Math.max(2, Math.round(1100 / img.width));
        const c = document.createElement("canvas");
        c.width = img.width * k; c.height = img.height * k;
        const x = c.getContext("2d");
        x.fillStyle = "#16242a"; x.fillRect(0, 0, c.width, c.height);
        x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, c.width, c.height);
        const [[s, o], [n, e]] = p.bornes;
        const my = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
        const px = (lon) => ((lon - o) / (e - o)) * c.width;
        const py = (lat) => ((my(n) - my(lat)) / (my(n) - my(s))) * c.height;
        try {
          const terres = await lireJson("data/terres-pacifique.geojson");
          x.strokeStyle = "rgba(232,238,240,.9)"; x.lineWidth = 1; x.fillStyle = "rgba(11,18,22,.55)";
          terres.features.forEach((ft) => {
            const g = ft.geometry, polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
            polys.forEach((poly) => { x.beginPath(); poly[0].forEach(([lo, la], i) => (i ? x.lineTo(px(lo), py(la)) : x.moveTo(px(lo), py(la))));
              x.closePath(); x.fill(); x.stroke(); });
          });
        } catch (err) { /* sans fond de côtes */ }
        Export.png(base, { titre, image: c, source, legende: p.legende.map((l) => ({ couleur: l.couleur, libelle: l.libelle })) });
      };
      img.src = f.url;
      return;
    }
    const fg = m.source.fichiers.find((x) => x.produit === "grilles");
    if (!fg) return;
    b.disabled = true;
    try {
      const g = await lireJson(fg.url);
      const prod = g.produits && g.produits[etat.couche.modele];
      const k = g.echeances.indexOf(f.ech);
      const v = prod && prod.valeurs[k];
      if (!v) return;
      const lignes = [];
      v.forEach((ligne, j) => ligne.forEach((x, i) => {
        if (x == null) return;
        lignes.push([+(g.lat0 - j * g.pas).toFixed(2), +normLon(g.lon0 + i * g.pas).toFixed(2), x]);
      }));
      Export.csv(base, { titre: `${titre} — grille régulière de 1°`, sources: [source],
        colonnes: ["latitude", "longitude", `valeur_${p.unite.replace("/", "_").replace("%", "pct").replace(/[^a-zA-Z0-9_]/g, "")}`], lignes });
    } catch (err) { /* grille indisponible */ } finally { b.disabled = false; }
  });

  /* ================= Fiches « Pourquoi ? » ================= */
  const FICHES = window.FICHES || {};
  const boutonFiche = (c) => (c && c.fiche && FICHES[c.fiche]
    ? `<button type="button" class="pourquoi" data-fiche="${c.fiche}">Pourquoi est-ce important ?</button>` : "");
  function ouvrirFiche(id) {
    const f = FICHES[id], d = $("fiche");
    if (!f || !d) return;
    $("fiche-titre").textContent = f.titre;
    const sections = [["Ce que c'est", f.definition], ["Pourquoi c'est important", f.importance],
      ["Comment la lire", f.lecture], ["Limites", f.limites]];
    const corps = $("fiche-corps");
    corps.innerHTML = "";
    sections.forEach(([t, x]) => {
      const sec = document.createElement("section"); sec.className = "fiche-section";
      const h = document.createElement("h3"); h.textContent = t;
      const p = document.createElement("p"); p.textContent = x;
      sec.append(h, p); corps.appendChild(sec);
    });
    if (f.couche && COUCHES.some((c) => c.id === f.couche)) {
      const act = document.createElement("div"); act.className = "fiche-actions";
      const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = "Voir sur la carte";
      b.addEventListener("click", () => { d.close(); if (vueGlobe()) fermerGlobe(); choisirCouche(f.couche); fermerRail(); });
      act.appendChild(b); corps.appendChild(act);
    }
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-fiche]");
    if (b) ouvrirFiche(b.dataset.fiche);
  });
  $("fiche-fermer").addEventListener("click", () => $("fiche").close());
  $("fiche").addEventListener("click", (e) => { if (e.target === $("fiche")) $("fiche").close(); });

  function ouvrirRail() { $("rail").classList.add("ouvert"); $("rail-ouvrir").setAttribute("aria-expanded", "true"); }
  function fermerRail() { $("rail").classList.remove("ouvert"); $("rail-ouvrir").setAttribute("aria-expanded", "false"); }

  /* ================= Légende ================= */
  function blocDegrade(titre, stops, unite, texte) {
    const g = stops.map(([, c], k) => `${c} ${Math.round((k / (stops.length - 1)) * 100)}%`).join(", ");
    return `<div class="legende-bloc"><strong>${titre}</strong>
      <div class="legende-degrade" style="background:linear-gradient(90deg, ${g})"></div>
      <div class="legende-ticks">${stops.map(([v]) => `<span>${v}</span>`).join("")}<span>${unite}</span></div>
      <p>${texte}</p></div>`;
  }
  function majLegende() {
    const blocs = [];
    const c = etat.couche;
    if (c && c.gibs) {
      const img = c.legende
        ? `<img src="${SRC.gibsLegendes}${c.legende}_H.svg" alt="Légende de la couche ${c.nom}" onerror="this.remove()">` : "";
      blocs.push(`<div class="legende-bloc"><strong>${c.nom}</strong>${img}<p>${c.aide}</p><p>Source : ${c.source}</p>${boutonFiche(c)}</div>`);
    }
    if (c && c.modele) {
      const m = etat.modele;
      if (!m) blocs.push(`<div class="legende-bloc"><strong>${c.nom}</strong><p>${c.aide}</p>${boutonFiche(c)}</div>`);
      else {
        const p = m.produit, s = m.source;
        blocs.push(`<div class="legende-bloc"><strong>${p.titre} (${p.unite})</strong><div class="legende-cases">${p.legende
          .map((x) => `<span><i style="background:${x.couleur}"></i>${x.libelle}</span>`).join("")}</div>
          <p>${c.aide}</p><p>${p.limites}</p>
          <p>Source : ${s.source.nom}, run du ${s.run_utc.slice(8, 10)}/${s.run_utc.slice(5, 7)} à ${s.run_utc.slice(11, 13)} h UTC. ${s.source.credit}.</p>
          ${vueGlobe() ? "<p>Couche visible en vue Carte.</p>" : ""}${boutonFiche(c)}
          <div class="legende-exports"><button type="button" data-export="modele-png">Image PNG</button><button type="button" data-export="modele-csv">Grille CSV (1°)</button></div></div>`);
      }
    }
    if ($("opt-vent").checked) {
      blocs.push(`<div class="legende-bloc"><strong>Vent prévu (nœuds)</strong><div class="legende-cases">${ECHELLE_VENT
        .map(([s, col]) => `<span><i style="background:${col}"></i>${s}</span>`).join("")}</div>
        <p>Flèche = direction vers laquelle souffle le vent.</p></div>`);
    }
    if ($("opt-actifs").checked) blocs.push(blocActifs());
    if (vueGlobe() && ($("opt-vent").checked || episodesActifs().length))
      blocs.push(`<div class="legende-bloc"><p>Flèches de vent et cartes d'épisodes : visibles en vue Carte.</p></div>`);
    episodesActifs().forEach((e) => blocs.push(blocDegrade(`${e.episode} · ${e.titre}`,
      e.legende, e.unite, "Carte issue de l'Atlas ENSO (ERA5, normale 1991-2020).")));
    const html = blocs.join("");
    if (html === legende.html) return;            // contenu inchangé (rafraîchissement périodique) : on ne le réaffiche pas
    legende.html = html;
    $("legende").innerHTML = html ? html + `<button type="button" class="legende-fermer" data-legende-fermer>Masquer la légende</button>` : "";
    montrerLegende();
  }

  /* La légende se superpose à la carte puis se replie seule après quelques secondes (sauf si on la survole ou
     l'utilise) ; la puce « Légende » la rouvre. */
  const legende = { html: null, minuteur: null };
  const DELAI_LEGENDE = 4500;
  function replierLegende() {
    clearTimeout(legende.minuteur);
    $("legende").classList.add("repliee");
    $("legende-puce").hidden = !legende.html;
  }
  function montrerLegende(delai = DELAI_LEGENDE) {
    clearTimeout(legende.minuteur);
    $("legende").classList.remove("repliee");
    $("legende-puce").hidden = true;
    if (legende.html) legende.minuteur = setTimeout(replierLegende, delai);
  }
  $("legende-puce").addEventListener("click", () => montrerLegende(8000));
  $("legende").addEventListener("click", (e) => { if (e.target.closest("[data-legende-fermer]")) replierLegende(); });
  $("legende").addEventListener("pointerenter", () => clearTimeout(legende.minuteur));
  const legendeOuverte = () => !$("legende").classList.contains("repliee");
  $("legende").addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && legendeOuverte()) montrerLegende(); });
  $("legende").addEventListener("pointerdown", (e) => { if (!e.target.closest("[data-legende-fermer]")) montrerLegende(8000); });
  $("legende").addEventListener("focusin", () => clearTimeout(legende.minuteur));

  /* ================= Vent prévu (Open-Meteo) ================= */
  const ECHELLE_VENT = [["< 10", "#cfe6ee"], ["10-20", "#8fd0e0"], ["20-30", "#f2d06b"], ["30-40", "#f29a4a"], ["40 +", "#e5484d"]];
  const couleurVent = (v) => (v < 10 ? ECHELLE_VENT[0][1] : v < 20 ? ECHELLE_VENT[1][1] : v < 30 ? ECHELLE_VENT[2][1] : v < 40 ? ECHELLE_VENT[3][1] : ECHELLE_VENT[4][1]);
  const CARDINAUX = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"];
  const vent = { groupe: L.layerGroup(), donnees: null, minuterie: null, requete: 0 };

  async function chargerVent() {
    const b = carte.getBounds();
    const s = Math.max(b.getSouth(), -65), n = Math.min(b.getNorth(), 65);
    let w = b.getWest(), e = b.getEast();
    if (e - w > 300) { w = carte.getCenter().lng - 150; e = carte.getCenter().lng + 150; }
    const NY = 7, NX = 9, pos = [], la = [], lo = [];
    for (let i = 0; i < NY; i++) for (let j = 0; j < NX; j++) {
      const lat = s + ((i + 0.5) * (n - s)) / NY, lon = w + ((j + 0.5) * (e - w)) / NX;
      pos.push([lat, lon]); la.push(lat.toFixed(2)); lo.push(normLon(lon).toFixed(2));
    }
    const id = ++vent.requete;
    const url = `${SRC.openMeteo}?latitude=${la.join(",")}&longitude=${lo.join(",")}` +
      "&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn&forecast_days=3&timezone=GMT";
    try {
      let j = await lireJson(url);
      if (id !== vent.requete) return;
      if (!Array.isArray(j)) j = [j];
      const debut = Date.parse(j[0].hourly.time[0] + ":00Z");
      vent.donnees = { pos, series: j.map((x) => x.hourly), debut, h0: Math.max(0, Math.floor((Date.now() - debut) / 36e5)) };
      dessinerVent();
    } catch (err) {
      $("echeance-texte").textContent = "indisponible";
    }
  }
  function dessinerVent() {
    const d = vent.donnees;
    if (!d) return;
    const k = Number($("echeance-curseur").value);
    const h = Math.min(d.h0 + k * 3, d.series[0].wind_speed_10m.length - 1);
    const quand = new Date(d.debut + h * 36e5);
    $("echeance-texte").textContent = k === 0 ? "maintenant" : `+${k * 3} h · ${fJour.format(quand)} ${fHeure.format(quand)}`;
    vent.groupe.clearLayers();
    d.pos.forEach(([lat, lon], idx) => {
      const v = d.series[idx].wind_speed_10m[h], dir = d.series[idx].wind_direction_10m[h];
      if (v == null || dir == null) return;
      const t = Math.round(16 + Math.min(v, 50) * 0.36);
      const icone = L.divIcon({
        className: "fleche", iconSize: [t, t],
        html: `<svg width="${t}" height="${t}" viewBox="0 0 24 24" style="transform:rotate(${dir + 180}deg)"><path d="M12 1 L19 13 L13.4 11.4 L13.4 23 L10.6 23 L10.6 11.4 L5 13 Z" fill="${couleurVent(v)}"/></svg>`
      });
      L.marker([lat, lon], { icon: icone, keyboard: false, interactive: true })
        .bindTooltip(`${Math.round(v)} nœuds · vent de ${CARDINAUX[Math.round(dir / 45) % 8]}`, { direction: "top" })
        .addTo(vent.groupe);
    });
  }
  let attenteVent = null;
  $("opt-vent").addEventListener("change", (e) => {
    $("echeance").hidden = !e.target.checked;
    if (e.target.checked) { vent.groupe.addTo(carte); chargerVent(); } else { carte.removeLayer(vent.groupe); }
    majLegende();
  });
  $("echeance-curseur").addEventListener("input", dessinerVent);
  carte.on("moveend", () => {
    if (!$("opt-vent").checked) return;
    clearTimeout(attenteVent); attenteVent = setTimeout(chargerVent, 600);
  });
  $("opt-reperes").addEventListener("change", (e) => (e.target.checked ? reperes.addTo(carte) : carte.removeLayer(reperes)));

  /* ================= Tiroir ================= */
  function ouvrirTiroir(onglet) {
    $("tiroir").hidden = false;
    ["point", "cyclones"].forEach((o) => {
      $(`onglet-${o}`).setAttribute("aria-selected", String(o === onglet));
      $(`vue-${o}`).hidden = o !== onglet;
    });
    setTimeout(() => { carte.invalidateSize(); if (globe.map) globe.map.resize(); }, 50);
  }
  $("onglet-point").addEventListener("click", () => ouvrirTiroir("point"));
  $("onglet-cyclones").addEventListener("click", () => { ouvrirTiroir("cyclones"); preparerCyclones(); });
  $("tiroir-fermer").addEventListener("click", () => { $("tiroir").hidden = true; setTimeout(() => carte.invalidateSize(), 50); });

  /* ================= Analyse d'un point ================= */
  Chart.defaults.color = COUL.texte2;
  Chart.defaults.borderColor = "rgba(155,176,184,.12)";
  Chart.defaults.font.family = '"IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif';
  Chart.defaults.font.size = 11;
  const graphes = {};
  const repereAujourdhui = {
    id: "aujourdhui",
    afterDatasetsDraw(chart, args, opts) {
      if (opts.index == null) return;
      const x = chart.scales.x.getPixelForValue(opts.index) - (chart.scales.x.width / chart.data.labels.length) / 2;
      const { top, bottom } = chart.chartArea, c = chart.ctx;
      c.save(); c.strokeStyle = COUL.accent; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, top); c.lineTo(x, bottom); c.stroke();
      c.fillStyle = COUL.accent; c.font = "11px " + Chart.defaults.font.family; c.textAlign = "right";
      c.fillText("prévision", chart.chartArea.right - 2, top + 10); c.restore();
    }
  };
  function graphe(id, config) {
    if (graphes[id]) graphes[id].destroy();
    graphes[id] = new Chart($(id), config);
  }
  const optionsBase = (idx) => ({
    responsive: true, maintainAspectRatio: true, aspectRatio: 2.3, animation: { duration: 500 },
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10 } }, aujourdhui: { index: idx } },
    scales: { x: { ticks: { maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false } }, y: { beginAtZero: false } }
  });

  let marqueur = null;
  let dernierPoint = null;
  carte.on("click", (e) => analyserPoint(e.latlng));

  async function analyserPoint(ll) {
    $("astuce").hidden = true;
    const lat = ll.lat, lon = normLon(ll.lng);
    if (marqueur) marqueur.setLatLng(ll);
    else marqueur = L.circleMarker(ll, { radius: 7, color: COUL.accent, weight: 2, fillColor: "#0b1216", fillOpacity: 1 }).addTo(carte);
    ouvrirTiroir("point");
    $("point-vide").hidden = true;
    $("point-contenu").hidden = false;
    $("point-coord").textContent = `${nombre(Math.abs(lat), 2)}° ${lat < 0 ? "S" : "N"} · ${nombre(Math.abs(lon), 2)}° ${lon < 0 ? "O" : "E"}`;
    $("point-tuiles").innerHTML = `<div class="tuile"><span>Chargement</span><strong>…</strong></div>`;
    $("point-note").textContent = "";

    const om = `${SRC.openMeteo}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
      "&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max" +
      "&past_days=60&forecast_days=7&timezone=auto&wind_speed_unit=kn";
    const pw = `${SRC.power}?parameters=PRECTOTCORR,T2M&community=AG&longitude=${lon.toFixed(3)}&latitude=${lat.toFixed(3)}&format=JSON`;
    const [rOm, rPw] = await Promise.allSettled([lireJson(om), lireJson(pw)]);
    if (rOm.status !== "fulfilled") {
      $("point-tuiles").innerHTML = `<div class="tuile"><span>Données indisponibles</span><strong>—</strong><em>Open-Meteo n'a pas répondu. Réessayez dans un instant.</em></div>`;
      return;
    }
    const d = rOm.value.daily;
    const n = d.time.length, idx = n - 7;
    const dates = d.time.map((t) => new Date(t + "T12:00:00Z"));
    const pluie = d.precipitation_sum.map((v) => v ?? 0);
    let normale = null, periode = "";
    if (rPw.status === "fulfilled") {
      const p = rPw.value?.properties?.parameter?.PRECTOTCORR;
      const h = rPw.value?.header || {};
      if (p) normale = dates.map((dt) => { const v = p[MOIS[dt.getUTCMonth()]]; return v != null && v > -900 ? v : null; });
      if (h.start && h.end) periode = ` ${h.start}-${h.end}`;
      else if (h.range) periode = ` ${h.range}`;
    }
    const somme = (a, i0, i1) => a.slice(i0, i1).reduce((s, v) => s + (v ?? 0), 0);
    const passe = somme(pluie, 0, idx), prevue = somme(pluie, idx, n);
    const tuiles = [[`Pluie des 60 derniers jours`, `${nombre(passe)} mm`, ""]];
    if (normale && normale.slice(0, idx).every((v) => v != null)) {
      const pct = (100 * passe) / somme(normale, 0, idx);
      tuiles[0][2] = `${nombre(pct)} % de la normale`;
    }
    tuiles.push(["Pluie prévue sur 7 jours", `${nombre(prevue)} mm`, ""]);
    const raf = Math.max(...d.wind_gusts_10m_max.slice(idx).map((v) => v ?? 0));
    tuiles.push(["Rafales max prévues", `${nombre(raf)} kt`, `${nombre(raf * 1.852)} km/h`]);
    $("point-tuiles").innerHTML = tuiles.map(([a, b, c]) => `<div class="tuile"><span>${a}</span><strong>${b}</strong>${c ? `<em>${c}</em>` : ""}</div>`).join("");

    const labels = dates.map((x) => fCourt.format(x));
    const pointille = (ctx) => (ctx.p0DataIndex >= idx - 1 ? [4, 3] : undefined);
    const jeux = [{ type: "bar", label: "Pluie", data: pluie, borderRadius: 2,
      backgroundColor: pluie.map((_, i) => (i >= idx ? "rgba(242,180,69,.8)" : COUL.pluie)) }];
    if (normale) jeux.push({ type: "line", label: "Normale NASA POWER", data: normale, borderColor: COUL.texte,
      borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0 });
    const oPluie = optionsBase(idx); oPluie.scales.y.beginAtZero = true;
    graphe("g-pluie", { data: { labels, datasets: jeux }, options: oPluie, plugins: [repereAujourdhui] });
    graphe("g-temp", { type: "line", data: { labels, datasets: [
      { label: "Max", data: d.temperature_2m_max, borderColor: COUL.chaud, pointRadius: 0, borderWidth: 2, segment: { borderDash: pointille } },
      { label: "Min", data: d.temperature_2m_min, borderColor: COUL.froid, pointRadius: 0, borderWidth: 2, segment: { borderDash: pointille } }
    ] }, options: optionsBase(idx), plugins: [repereAujourdhui] });
    const oVent = optionsBase(idx); oVent.scales.y.beginAtZero = true;
    graphe("g-vent", { type: "line", data: { labels, datasets: [
      { label: "Vent max", data: d.wind_speed_10m_max, borderColor: COUL.pluie, pointRadius: 0, borderWidth: 2, segment: { borderDash: pointille } },
      { label: "Rafales", data: d.wind_gusts_10m_max, borderColor: COUL.accent, pointRadius: 0, borderWidth: 1.5, segment: { borderDash: pointille } }
    ] }, options: oVent, plugins: [repereAujourdhui] });

    dernierPoint = { lat, lon, jours: d.time, d, normale, periode, idx, coord: $("point-coord").textContent };
    $("point-note").textContent = "Les 60 derniers jours sont une analyse de modèles météo (Open-Meteo), pas des mesures de station. " +
      "En doré et en pointillé : la prévision. " +
      (normale ? `Normale : climatologie NASA POWER${periode}, moyenne du mois.` : "Normale NASA POWER indisponible pour le moment.");
  }

  /* ================= Exports (CSV, PNG, rapport PDF) ================= */
  const SOURCES_POINT = ["Open-Meteo (modèles ECMWF / GFS), licence CC BY 4.0, usage non commercial",
    "NASA POWER (normales climatologiques)"];
  $("exp-point-csv").addEventListener("click", () => {
    const p = dernierPoint; if (!p) return;
    const d = p.d;
    Export.csv(`point_${p.lat.toFixed(2)}_${p.lon.toFixed(2)}`, {
      titre: `Analyse d'un point : ${p.coord} (60 jours passés + 7 jours de prévision)`, sources: SOURCES_POINT,
      colonnes: ["date", "type", "pluie_mm", "pluie_normale_mm_jour", "temp_min_c", "temp_max_c", "vent_max_kt", "rafales_kt"],
      lignes: p.jours.map((t, i) => [t, i >= p.idx ? "prevision" : "analyse", d.precipitation_sum[i],
        p.normale ? p.normale[i] : null, d.temperature_2m_min[i], d.temperature_2m_max[i], d.wind_speed_10m_max[i], d.wind_gusts_10m_max[i]])
    });
  });
  $("exp-point-pdf").addEventListener("click", () => {
    const p = dernierPoint; if (!p) return;
    Export.rapport({ titre: `Analyse du point ${p.coord}`, sousTitre: "Pluie, température et vent : 60 jours passés et 7 jours de prévision",
      sources: SOURCES_POINT, avant: $("vue-point") });
  });
  const TITRES_GRAPHES = { "g-pluie": "Pluie par jour (mm)", "g-temp": "Température min / max (°C)",
    "g-vent": "Vent max et rafales (nœuds)", "g-saisons": "Systèmes tropicaux en Polynésie par saison et phase ENSO" };
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".exp-png");
    if (!b) return;
    const g = Chart.getChart($(b.dataset.graphe));
    if (!g) return;
    const saisons = b.dataset.graphe === "g-saisons";
    const lieu = !saisons && dernierPoint ? ` · ${dernierPoint.coord}` : "";
    Export.png(b.dataset.graphe.slice(2) + (dernierPoint && !saisons ? `_${dernierPoint.lat.toFixed(2)}_${dernierPoint.lon.toFixed(2)}` : ""), {
      titre: TITRES_GRAPHES[b.dataset.graphe] + lieu, image: g.canvas,
      source: saisons ? "NOAA IBTrACS v04r01 et NOAA CPC (ONI), traitement Atlas ENSO" : SOURCES_POINT.join(" ; ")
    });
  });

  /* ================= Cyclones (Atlas ENSO) ================= */
  const cyc = { donnees: null, saisons: null, groupe: L.layerGroup(), minuterie: null, saison: null, graphe: null };
  const ECHELLE_KT = [["Dépression < 34 kt", "#a9bcc3"], ["Tempête 34-47", "#f2d06b"], ["Forte tempête 48-63", "#f29a4a"],
    ["Cyclone 64-99", "#e5484d"], ["Cyclone intense ≥ 100", "#c21a5b"]];
  const couleurKt = (k) => (k == null || k < 34 ? ECHELLE_KT[0][1] : k < 48 ? ECHELLE_KT[1][1] : k < 64 ? ECHELLE_KT[2][1] : k < 100 ? ECHELLE_KT[3][1] : ECHELLE_KT[4][1]);

  async function chargerCyclones() {
    if (cyc.donnees) return true;
    try {
      const [a, b] = await Promise.all([lireJson("data/cyclones.json"), lireJson("data/saisons.json")]);
      cyc.donnees = a.tempetes; cyc.saisons = b;
      return true;
    } catch (e) { return false; }
  }

  async function preparerCyclones() {
    const ok = await chargerCyclones();
    $("cyc-vide").hidden = ok; $("cyc-contenu").hidden = !ok;
    if (!ok || cyc.pret) return;
    cyc.pret = true;
    const parSaison = {};
    cyc.donnees.forEach((t) => { parSaison[t.saison] = (parSaison[t.saison] || 0) + 1; });
    const sel = $("cyc-saison");
    const infos = Object.fromEntries(cyc.saisons.map((s) => [s.saison, s]));
    Object.keys(parSaison).map(Number).sort((a, b) => b - a).forEach((s) => {
      const o = document.createElement("option");
      o.value = s; o.textContent = `${lib(s)} · ${infos[s]?.phase || "?"} · ${parSaison[s]} système${parSaison[s] > 1 ? "s" : ""}`;
      sel.appendChild(o);
    });
    sel.value = parSaison[1998] ? "1998" : sel.options[0].value;
    sel.addEventListener("change", () => afficherSaison(Number(sel.value)));
    $("cyc-echelle").innerHTML = ECHELLE_KT.map(([t, c]) => `<span><i style="background:${c}"></i>${t}</span>`).join("");
    const s = cyc.saisons.filter((x) => x.systemes != null);
    cyc.graphe = new Chart($("g-saisons"), {
      type: "bar",
      data: { labels: s.map((x) => lib(x.saison)), datasets: [{ label: "Systèmes", data: s.map((x) => x.systemes), borderRadius: 2,
        backgroundColor: s.map((x) => PHASES[x.phase] || "#7d8b91"), borderColor: COUL.accent, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: true, aspectRatio: 2.1, plugins: { legend: { display: false },
        tooltip: { callbacks: { afterLabel: (c) => `${s[c.dataIndex].phase} · ONI déc.-fév. ${signe(s[c.dataIndex].oni_djf)} °C` } } },
        scales: { x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
        onClick: (_, el) => { if (el.length) { const v = s[el[0].index].saison; if (parSaison[v]) { sel.value = v; afficherSaison(v); } } } }
    });
    afficherSaison(Number(sel.value));
  }

  $("exp-saison-csv").addEventListener("click", () => {
    if (!cyc.donnees || cyc.saison == null) return;
    const lignes = [];
    cyc.donnees.filter((x) => x.saison === cyc.saison).forEach((x) =>
      x.points.forEach((p) => lignes.push([x.nom, x.saison, p[0], p[1], p[2], p[3]])));
    Export.csv(`cyclones_saison_${lib(cyc.saison)}`, {
      titre: `Trajectoires des systèmes tropicaux en Polynésie, saison ${lib(cyc.saison)} (positions toutes les 6 h)`,
      sources: ["NOAA IBTrACS v04r01 (Knapp et al. 2010), domaine public"],
      colonnes: ["nom", "saison", "date_utc", "latitude", "longitude_pacifique", "vent_kt"], lignes });
  });
  $("exp-saisons-csv").addEventListener("click", () => {
    if (!cyc.saisons) return;
    Export.csv("saisons_cycloniques_enso", {
      titre: "Systèmes tropicaux en Polynésie française par saison et état ENSO",
      sources: ["NOAA IBTrACS v04r01, domaine public", "NOAA CPC : ONI et indices Niño (sstoi.indices), domaine public"],
      colonnes: ["saison", "oni_dec_fev_c", "phase", "type_el_nino", "nino3_moins_nino4_c", "systemes", "systemes_64kt_ou_plus"],
      lignes: cyc.saisons.map((s) => [s.saison, s.oni_djf, s.phase, s.type, s.n3_moins_n4, s.systemes, s.systemes_64kt]) });
  });

  function segments(points, jusqua) {
    const out = [];
    for (let i = 1; i < points.length; i++) {
      if (jusqua && points[i][0] > jusqua) break;
      const a = points[i - 1], b = points[i];
      out.push(L.polyline([[a[1], a[2]], [b[1], b[2]]], { color: couleurKt(b[3]), weight: 3, opacity: .95 }));
    }
    return out;
  }

  function afficherSaison(s) {
    arreterCyclones();
    cyc.saison = s;
    const t = cyc.donnees.filter((x) => x.saison === s);
    const info = cyc.saisons.find((x) => x.saison === s) || {};
    const puces = [`<span class="puce"><i style="background:${PHASES[info.phase] || "#7d8b91"}"></i>${info.phase || "Phase inconnue"}</span>`];
    if (info.oni_djf != null) puces.push(`<span class="puce mono">ONI déc.-fév. ${signe(info.oni_djf)} °C</span>`);
    if (info.type) puces.push(`<span class="puce">Type ${info.type}${info.n3_moins_n4 != null ? ` (Niño3 − Niño4 ${signe(info.n3_moins_n4, 2)})` : ""}</span>`);
    puces.push(`<span class="puce">${t.length} système${t.length > 1 ? "s" : ""}${info.systemes_64kt != null ? ` · ${info.systemes_64kt} ≥ 64 kt en PF` : ""}</span>`);
    $("cyc-info").innerHTML = puces.join("");
    $("cyc-liste").innerHTML = t.map((x) => `<li><span>${x.nom}</span><span class="mono">${x.points[0][0].slice(0, 10)} · ${x.vent_max_kt ?? "?"} kt max en PF</span></li>`).join("");
    $("cyc-date").textContent = "";
    dessinerTrajectoires(t, null);
    const pts = t.flatMap((x) => x.points.map((p) => [p[1], p[2]]));
    if (pts.length) carte.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 5 });
    majGlobeCyclones();
    if (cyc.graphe) {
      cyc.graphe.data.datasets[0].borderWidth = cyc.graphe.data.labels.map((l) => (l === lib(s) ? 2 : 0));
      cyc.graphe.update("none");
    }
  }

  function dessinerTrajectoires(t, jusqua) {
    cyc.groupe.clearLayers();
    t.forEach((x) => {
      segments(x.points, jusqua).forEach((l) => l.addTo(cyc.groupe));
      const vis = jusqua ? x.points.filter((p) => p[0] <= jusqua) : x.points;
      if (!vis.length) return;
      const p = vis[vis.length - 1];
      const enCours = jusqua && p === vis[vis.length - 1] && x.points[x.points.length - 1][0] > jusqua;
      L.circleMarker([p[1], p[2]], { radius: enCours ? 4 + Math.min(p[3] || 20, 120) / 14 : 3, color: "#0b1216", weight: 1,
        fillColor: couleurKt(p[3]), fillOpacity: 1 })
        .bindTooltip(`${x.nom}${p[3] ? ` · ${p[3]} kt` : ""}`, { permanent: !!enCours || !jusqua, direction: "right", className: "nom-cyclone", offset: [6, 0] })
        .addTo(cyc.groupe);
    });
  }

  function animerCyclones() {
    const t = cyc.donnees.filter((x) => x.saison === cyc.saison);
    const temps = [...new Set(t.flatMap((x) => x.points.map((p) => p[0])))].sort();
    if (!temps.length) return;
    let i = 0;
    $("cyc-lecture").textContent = "Pause";
    cyc.minuterie = setInterval(() => {
      if (i >= temps.length) { arreterCyclones(); dessinerTrajectoires(t, null); return; }
      dessinerTrajectoires(t, temps[i]);
      const d = new Date(temps[i] + ":00:00Z");
      $("cyc-date").textContent = `${fJourUTC.format(d)} · ${temps[i].slice(11)} h UTC`;
      i += 1;
    }, 110);
  }
  function arreterCyclones() {
    clearInterval(cyc.minuterie); cyc.minuterie = null; $("cyc-lecture").textContent = "Animer la saison";
  }
  $("cyc-lecture").addEventListener("click", () => (cyc.minuterie ? arreterCyclones() : animerCyclones()));
  $("opt-cyclones").addEventListener("change", async (e) => {
    if (e.target.checked) {
      cyc.groupe.addTo(carte); ouvrirTiroir("cyclones"); await preparerCyclones();
    } else { arreterCyclones(); carte.removeLayer(cyc.groupe); }
    majGlobeCyclones();
  });

  /* ================= Épisodes de l'Atlas ENSO ================= */
  const episodes = { liste: [], calques: {} };
  function episodesActifs() { return episodes.liste.filter((e) => episodes.calques[e.id]); }
  async function chargerEpisodes() {
    try { episodes.liste = await lireJson("data/episodes.json"); } catch (e) { return; }
    if (!episodes.liste.length) return;
    $("groupe-episodes").hidden = false;
    $("episodes").innerHTML = episodes.liste.map((e) => `<label class="episode"><input type="checkbox" data-id="${e.id}">
      <span><strong>${e.episode}</strong><small>${e.titre}</small></span></label>`).join("");
    $("episodes").querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
      const e = episodes.liste.find((x) => x.id === inp.dataset.id);
      if (inp.checked) {
        episodes.calques[e.id] = L.imageOverlay(e.image, e.bornes, { pane: "episodes", opacity: .9 }).addTo(carte);
        carte.fitBounds(e.bornes, { padding: [30, 30] });
      } else { carte.removeLayer(episodes.calques[e.id]); delete episodes.calques[e.id]; }
      majLegende();
    }));
  }

  /* ================= État ENSO (ONI) ================= */
  async function chargerEnso() {
    let j;
    try { j = await lireJson("data/oni.json"); } catch (e) { return; }
    const m = j.mois;
    if (!m || !m.length) return;
    const [ym, v, saison] = m[m.length - 1];
    const phase = v >= 1.5 ? "El Niño fort" : v >= 0.5 ? "El Niño" : v <= -1.5 ? "La Niña forte" : v <= -0.5 ? "La Niña" : "Neutre";
    $("enso-phase").textContent = phase;
    $("enso-phase").style.color = PHASES[phase];
    $("enso-valeur").textContent = `ONI ${signe(v)} °C · ${saison} ${ym.slice(0, 4)}`;
    const der = m.slice(-36), W = 120, H = 32, bw = W / der.length, max = Math.max(1.5, ...der.map((x) => Math.abs(x[1])));
    $("enso-spark").innerHTML = `<line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#6d828a" stroke-width=".5"/>` +
      der.map(([, x], i) => { const h = (Math.abs(x) / max) * (H / 2 - 1);
        return `<rect x="${(i * bw + .3).toFixed(1)}" y="${(x > 0 ? H / 2 - h : H / 2).toFixed(1)}" width="${(bw - .6).toFixed(1)}" height="${h.toFixed(1)}" fill="${x >= 0 ? COUL.chaud : COUL.froid}"/>`; }).join("");
    $("enso").hidden = false;
    chargerTypeNino();
  }

  /* MJO : phase, amplitude et trajectoire des 40 derniers jours (Worker /api/mjo, NOAA PSL ROMI). */
  async function chargerMjo() {
    let j;
    try { j = await lireJson("api/mjo"); } catch (e) { return; }
    if (!j || !j.dernier) return;
    const d = j.dernier;
    $("mjo-etat").textContent = d.active ? `Active · phase ${d.phase}` : `Faible · phase ${d.phase}`;
    $("mjo-etat").style.color = d.active ? COUL.accent : COUL.texte2;
    $("mjo-valeur").textContent = `amplitude ${nombre(d.amplitude, 1)} · ${d.region} · ${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`;
    const pts = j.jours.map((x) => [Math.max(-2.9, Math.min(2.9, x.rmm1)), Math.max(-2.9, Math.min(2.9, -x.rmm2))]);
    const axes = [0, 45, 90, 135].map((a) => { const r = Math.PI * a / 180, c = 2.9 * Math.cos(r), s = 2.9 * Math.sin(r);
      return `<line x1="${-c}" y1="${-s}" x2="${c}" y2="${s}" stroke="#34464f" stroke-width=".04"/>`; }).join("");
    const der = pts[pts.length - 1];
    $("mjo-diagramme").innerHTML = `${axes}<circle r="1" fill="none" stroke="#6d828a" stroke-width=".06"/>
      <polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${COUL.accent}" stroke-width=".09" stroke-linejoin="round"/>
      <circle cx="${der[0]}" cy="${der[1]}" r=".22" fill="${COUL.accent}"/>`;
    $("mjo").hidden = false;
  }

  /* Tendance du type d'El Niño : Niño3 − Niño4 sur les 3 derniers mois (Worker /api/enso-type, NOAA CPC).
     Indicatif : le type retenu par l'atlas est calculé sur déc.-fév. (Kug et al. 2009). */
  async function chargerTypeNino() {
    let t;
    try { t = await lireJson("api/enso-type"); } catch (e) { return; }
    if (!t || typeof t.gradient !== "number") return;
    const libelles = { Est: "tendance Est (Pacifique oriental)", Centre: "tendance Centre (Pacifique central)", Mixte: "type mixte" };
    const el = $("enso-type");
    el.textContent = `Niño3−Niño4 ${signe(t.gradient, 2)} °C · ${libelles[t.tendance] || t.tendance}`;
    el.title = `Moyenne ${t.mois.map((m) => m.mois).join(", ")}. Seuils : > ${nombre(t.seuils.est, 1)} Est, < ${nombre(t.seuils.centre, 1)} Centre. Source : ${t.source}. Indicatif : le type officiel de l'atlas se calcule sur déc.-fév.`;
    el.hidden = false;
  }


  /* ================= Noms des pays et des îles ================= */
  const pac = (lon) => (lon > 100 ? lon - 360 : lon);      // vue centrée sur le Pacifique
  const seuilNiveau = (z) => (z >= 6 ? 3 : z >= 4 ? 2 : 1);
  const lieux = { groupe: L.layerGroup().addTo(carte), marqueurs: [] };
  window.LIEUX.forEach(([nom, lat, lon, niv]) => {
    const m = L.marker([lat, pac(lon)], { interactive: false, keyboard: false,
      icon: L.divIcon({ className: "lieu-conteneur", iconSize: [0, 0], html: `<span class="lieu lieu-${niv}">${nom}</span>` }) });
    m._niv = niv;
    lieux.marqueurs.push(m);
  });
  function majLieux() {
    lieux.groupe.clearLayers();
    if (!$("opt-lieux").checked) return;
    const n = seuilNiveau(carte.getZoom());
    lieux.marqueurs.forEach((m) => { if (m._niv <= n) m.addTo(lieux.groupe); });
  }
  carte.on("zoomend", majLieux);
  $("opt-lieux").addEventListener("change", () => { majLieux(); majGlobeLieux(); });

  /* ================= Cyclones en cours (GDACS via fonction Cloudflare) ================= */
  const COUL_ALERTE = { Green: "#5cc98a", Orange: "#f29a4a", Red: "#e5484d" };
  const COUL_ZONE = { Poly_Green: "#5cc98a", Poly_Orange: "#f29a4a", Poly_Red: "#e5484d" };
  const actifs = { groupe: L.layerGroup(), donnees: null, erreur: null };
  const kmhVersKt = (v) => Math.round(v / 1.852);

  function svgCyclone(couleur, sud) {
    return `<svg viewBox="-17 -17 34 34" style="animation-direction:${sud ? "normal" : "reverse"}">
      <g fill="none" stroke="${couleur}" stroke-width="3.2" stroke-linecap="round"${sud ? "" : ' transform="scale(-1,1)"'}>
      <path d="M-3,-3 C-3,-12 7,-15 13,-9"/><path d="M3,3 C3,12 -7,15 -13,9"/></g>
      <circle r="4.5" fill="${couleur}" stroke="#0b1216" stroke-width="1.5"/></svg>`;
  }
  function libelleActif(c) {
    return `${c.nom}${c.vent_kmh ? ` · ${c.vent_kmh} km/h (${kmhVersKt(c.vent_kmh)} kt)` : ""}`;
  }
  async function chargerActifs() {
    try { actifs.donnees = await lireJson("api/cyclones-actifs"); actifs.erreur = null; }
    catch (e) { actifs.donnees = null; actifs.erreur = e; }
    dessinerActifs(); majLegende(); majGlobeActifs();
  }
  function dessinerActifs() {
    actifs.groupe.clearLayers();
    if (!$("opt-actifs").checked || !actifs.donnees) return;
    actifs.donnees.cyclones.forEach((c) => {
      if (c.geometrie && c.geometrie.features.length) {
        L.geoJSON(c.geometrie, {
          coordsToLatLng: (xy) => L.latLng(xy[1], pac(xy[0])),
          style: (f) => ({ color: COUL_ZONE[f.properties.classe] || COUL.texte, weight: 1, opacity: .8,
            fillOpacity: .16, dashArray: f.geometry.type.includes("Line") ? "4 4" : null }),
          interactive: false
        }).addTo(actifs.groupe);
      }
      if (!c.position) return;
      const [lon, lat] = c.position, col = COUL_ALERTE[c.alerte] || COUL.accent;
      L.marker([lat, pac(lon)], { icon: L.divIcon({ className: "actif", iconSize: [34, 34], html: svgCyclone(col, lat < 0) }) })
        .bindTooltip(libelleActif(c), { permanent: true, direction: "right", offset: [16, 0], className: "actif-nom" })
        .bindPopup(`<strong>${c.nom}</strong><br>${c.texte}<br>Suivi depuis le ${String(c.debut).slice(0, 10)}` +
          (c.pays ? `<br>Zone : ${c.pays}` : "") + (c.rapport ? `<br><a href="${c.rapport}" target="_blank" rel="noopener">Rapport GDACS</a>` : ""))
        .addTo(actifs.groupe);
    });
  }
  function blocActifs() {
    if (actifs.erreur) return `<div class="legende-bloc"><strong>Cyclones en cours</strong><p>Service momentanément indisponible. Nouvel essai automatique dans 15 minutes.</p></div>`;
    if (!actifs.donnees) return "";
    const l = actifs.donnees.cyclones;
    if (!l.length) return `<div class="legende-bloc"><strong>Cyclones en cours</strong><p>Aucun cyclone tropical actif dans le monde ces dernières 48 h (GDACS).</p></div>`;
    return `<div class="legende-bloc"><strong>Cyclones en cours (${l.length})</strong><div class="legende-cases">${l.map((c) =>
      `<span><i style="background:${COUL_ALERTE[c.alerte] || COUL.accent}"></i>${libelleActif(c)}</span>`).join("")}</div>
      <p>Couleur = niveau d'alerte GDACS. Zones colorées = rayons de vent. Source : GDACS (UE / ONU).</p></div>`;
  }
  $("opt-actifs").addEventListener("change", (e) => {
    if (e.target.checked) { actifs.groupe.addTo(carte); if (!actifs.donnees) chargerActifs(); }
    else carte.removeLayer(actifs.groupe);
    dessinerActifs(); majLegende(); majGlobeActifs();
  });

  /* ================= Vue globe 3D (MapLibre) ================= */
  const globe = { map: null, pret: false, lieux: [], actifs: [], noms: [] };
  const vueGlobe = () => !$("globe").hidden;
  function urlWms(couche, format, temps) {
    return `${SRC.gibsWms}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${couche}&STYLES=&FORMAT=${encodeURIComponent(format)}` +
      `&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}` + (temps ? `&TIME=${temps}` : "");
  }
  function chargerScript(src) {
    return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  }
  function basculerBoutons(globeActif) {
    $("vue-carte").setAttribute("aria-pressed", String(!globeActif));
    $("vue-globe").setAttribute("aria-pressed", String(globeActif));
    document.body.classList.toggle("globe-actif", globeActif);
  }
  async function ouvrirGlobe() {
    if (vueGlobe()) return;
    arreter();
    $("globe").hidden = false; $("carte").hidden = true; basculerBoutons(true);
    if (!window.maplibregl) {
      try { await chargerScript("vendor/maplibre/maplibre-gl.js"); }
      catch (e) { fermerGlobe(); majEtat("Le globe n'a pas pu se charger."); return; }
    }
    if (!globe.map) creerGlobe();
    else {
      const c = carte.getCenter();
      globe.map.resize(); globe.map.jumpTo({ center: [normLon(c.lng), c.lat], zoom: Math.max(1.3, carte.getZoom() - 1.5) });
      majGlobeDonnees();
    }
    majLegende();
  }
  function fermerGlobe() {
    if (!vueGlobe()) return;
    if (globe.map) { const c = globe.map.getCenter(); carte.setView([c.lat, pac(c.lng)], Math.round(globe.map.getZoom() + 1.5)); }
    $("globe").hidden = true; $("carte").hidden = false; basculerBoutons(false);
    setTimeout(() => carte.invalidateSize(), 30);
    majLegende();
  }
  $("vue-globe").addEventListener("click", ouvrirGlobe);
  $("vue-carte").addEventListener("click", fermerGlobe);

  function creerGlobe() {
    const c = carte.getCenter();
    globe.map = new maplibregl.Map({
      container: "globe", center: [normLon(c.lng), c.lat], zoom: Math.max(1.3, carte.getZoom() - 1.5),
      attributionControl: { compact: true, customAttribution: "NASA GIBS · GDACS · IBTrACS" },
      style: {
        version: 8,
        projection: { type: "globe" },
        sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
        sources: {
          fond: { type: "raster", tiles: [urlWms("BlueMarble_ShadedRelief_Bathymetry", "image/jpeg")], tileSize: 256, maxzoom: 8,
            attribution: "NASA Blue Marble" },
          cotes: { type: "raster", tiles: [urlWms("Coastlines_15m", "image/png")], tileSize: 256, maxzoom: 9 }
        },
        layers: [
          { id: "espace", type: "background", paint: { "background-color": "#06101a" } },
          { id: "fond", type: "raster", source: "fond" },
          { id: "cotes", type: "raster", source: "cotes", paint: { "raster-opacity": 0.7 } }
        ]
      }
    });
    globe.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    globe.map.on("load", () => { globe.pret = true; majGlobeDonnees(); majGlobeLieux(); majGlobeActifs(); majGlobeCyclones(); });
    globe.map.on("zoomend", majGlobeLieux);
    globe.map.on("click", (e) => analyserPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    globe.map.on("error", () => { /* tuile absente pour cette date : on ignore */ });
  }

  function majGlobeDonnees() {
    if (!globe.pret) return;
    const m = globe.map, c = etat.couche;
    if (!c || !c.gibs || !etat.dates[etat.index]) {
      if (m.getLayer("donnees")) m.removeLayer("donnees");
      if (m.getSource("donnees")) m.removeSource("donnees");
      return;
    }
    const url = urlWms(c.gibs, c.format, tempsWms(c, etat.dates[etat.index]));
    const src = m.getSource("donnees");
    if (src && src._couche === c.id && src.setTiles) { src.setTiles([url]); return; }
    if (m.getLayer("donnees")) m.removeLayer("donnees");
    if (src) m.removeSource("donnees");
    m.addSource("donnees", { type: "raster", tiles: [url], tileSize: 256, maxzoom: 9 });
    m.getSource("donnees")._couche = c.id;
    m.addLayer({ id: "donnees", type: "raster", source: "donnees", paint: { "raster-fade-duration": 0 } }, "cotes");
  }

  function marqueurTexte(html, lngLat, classe) {
    const el = document.createElement("div");
    el.className = classe; el.innerHTML = html;
    return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(globe.map);
  }
  function majGlobeLieux() {
    if (!globe.pret) return;
    globe.lieux.forEach((m) => m.remove()); globe.lieux = [];
    if (!$("opt-lieux").checked) return;
    const n = seuilNiveau(globe.map.getZoom() + 1.5);
    window.LIEUX.forEach(([nom, lat, lon, niv]) => {
      if (niv <= n) globe.lieux.push(marqueurTexte(`<span class="lieu lieu-${niv}" style="transform:none">${nom}</span>`, [lon, lat], "globe-lieu"));
    });
  }
  function majGlobeActifs() {
    if (!globe.pret) return;
    const m = globe.map;
    globe.actifs.forEach((x) => x.remove()); globe.actifs = [];
    if (m.getLayer("actifs-zones")) m.removeLayer("actifs-zones");
    if (m.getSource("actifs")) m.removeSource("actifs");
    if (!$("opt-actifs").checked || !actifs.donnees) return;
    const feats = actifs.donnees.cyclones.flatMap((c) => (c.geometrie ? c.geometrie.features : []))
      .filter((f) => f.geometry.type.includes("Polygon"));
    m.addSource("actifs", { type: "geojson", data: { type: "FeatureCollection", features: feats } });
    m.addLayer({ id: "actifs-zones", type: "fill", source: "actifs", paint: {
      "fill-color": ["match", ["get", "classe"], "Poly_Red", COUL_ZONE.Poly_Red, "Poly_Orange", COUL_ZONE.Poly_Orange, COUL_ZONE.Poly_Green],
      "fill-opacity": 0.22 } });
    actifs.donnees.cyclones.forEach((c) => {
      if (!c.position) return;
      const col = COUL_ALERTE[c.alerte] || COUL.accent;
      globe.actifs.push(marqueurTexte(`<div class="actif">${svgCyclone(col, c.position[1] < 0)}</div>`, c.position, "globe-actif-icone"));
      globe.actifs.push(marqueurTexte(`<span class="nom-cyclone actif-nom">${libelleActif(c)}</span>`, c.position, "globe-etiquette"));
    });
  }
  function majGlobeCyclones() {
    if (!globe.pret) return;
    const m = globe.map;
    globe.noms.forEach((x) => x.remove()); globe.noms = [];
    if (m.getLayer("cyc")) m.removeLayer("cyc");
    if (m.getSource("cyc")) m.removeSource("cyc");
    if (!$("opt-cyclones").checked || !cyc.donnees || cyc.saison == null) return;
    const t = cyc.donnees.filter((x) => x.saison === cyc.saison);
    const feats = [];
    t.forEach((x) => {
      for (let i = 1; i < x.points.length; i++) {
        const a = x.points[i - 1], b = x.points[i];
        feats.push({ type: "Feature", properties: { c: couleurKt(b[3]) }, geometry: { type: "LineString", coordinates: [[a[2], a[1]], [b[2], b[1]]] } });
      }
      const p = x.points[x.points.length - 1];
      globe.noms.push(marqueurTexte(`<span class="nom-cyclone">${x.nom}</span>`, [p[2], p[1]], "globe-etiquette"));
    });
    m.addSource("cyc", { type: "geojson", data: { type: "FeatureCollection", features: feats } });
    m.addLayer({ id: "cyc", type: "line", source: "cyc", paint: { "line-color": ["get", "c"], "line-width": 3 } });
  }

  /* ================= Panneau des couches (rétractable, ordinateur et téléphone) ================= */
  $("rail-ouvrir").addEventListener("click", () => ($("rail").classList.contains("ouvert") ? fermerRail() : ouvrirRail()));
  $("rail-fermer").addEventListener("click", fermerRail);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("rail").classList.contains("ouvert")) fermerRail(); });
  carte.on("mousedown touchstart", () => { if ($("rail").classList.contains("ouvert")) fermerRail(); });
  /* L'astuce s'efface d'elle-même. */
  setTimeout(() => { $("astuce").classList.add("efface"); setTimeout(() => { $("astuce").hidden = true; }, 500); }, 7000);

  /* ================= Démarrage ================= */
  construireBoutons();
  majLieux();
  actifs.groupe.addTo(carte);
  chargerActifs();
  setInterval(chargerActifs, 15 * 60 * 1000);
  choisirCouche("goes");
  chargerEpisodes();
  chargerEnso();
  chargerMjo();
  majFondHorsLigne();
})();
