/* Atlas Pacifica — exports : CSV, images PNG crédités, rapport PDF (impression du navigateur).
   Chaque export porte sa source, sa licence, sa date et la mention « outil d'analyse, pas une prévision officielle ». */
(() => {
  "use strict";
  const AVERTISSEMENT = "Atlas Pacifica - outil d'analyse climatologique, pas une prévision ni une alerte officielle. Vigilances : meteo.pf";
  const SITE = "https://qgis-anomaly-mto.hinovadigital.workers.dev";

  function horodatage() {
    return new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }
  function nomFichier(base, ext) {
    const propre = String(base).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_|_$/g, "");
    return `atlas-pacifica_${propre}_${new Date().toISOString().slice(0, 10)}.${ext}`;
  }
  function telecharger(nom, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nom; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const cellule = (v) => {
    if (v == null || (typeof v === "number" && !Number.isFinite(v))) return "";
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  /* CSV : lignes d'en-tête « # » (source, licence, avertissement), puis colonnes. Séparateur virgule, point décimal
     (format lu directement par QGIS, Python, R ; dans Excel : Données > À partir d'un fichier texte). */
  function csv(base, { titre, sources, colonnes, lignes }) {
    const meta = [`# ${titre}`, ...sources.map((s) => `# Source : ${s}`), `# Exporté le ${horodatage()} depuis ${SITE}`, `# ${AVERTISSEMENT}`];
    const corps = [colonnes.map(cellule).join(","), ...lignes.map((l) => l.map(cellule).join(","))];
    telecharger(nomFichier(base, "csv"), new Blob(["﻿" + meta.concat(corps).join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
  }

  /* PNG : l'image (graphique ou carte) sur fond sombre, avec titre, légende facultative et crédits en pied. */
  function lignesDe(x, texte, largeurMax) {
    const mots = String(texte).split(" "), out = [];
    let l = "";
    mots.forEach((m) => { const t = l ? `${l} ${m}` : m; if (x.measureText(t).width > largeurMax && l) { out.push(l); l = m; } else l = t; });
    if (l) out.push(l);
    return out;
  }
  function png(base, { titre, source, image, legende }) {
    const marge = 24, largeur = Math.max(900, image.width + 2 * marge);
    const echelle = (largeur - 2 * marge) / image.width;
    const h = Math.round(image.height * echelle);
    const hLeg = legende && legende.length ? 34 : 0;
    const c = document.createElement("canvas");
    const mesure = c.getContext("2d");
    mesure.font = "600 20px 'IBM Plex Sans Condensed', sans-serif";
    const lTitre = lignesDe(mesure, titre, largeur - 2 * marge);
    mesure.font = "12px 'IBM Plex Sans Condensed', sans-serif";
    const lSource = lignesDe(mesure, `Source : ${source}`, largeur - 2 * marge);
    const haut = 26 * lTitre.length + 36;
    c.width = largeur; c.height = haut + h + hLeg + 18 * (lSource.length + 1) + 24;
    const x = c.getContext("2d");
    x.fillStyle = "#0b1216"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#e8eef0"; x.font = "600 20px 'IBM Plex Sans Condensed', sans-serif";
    lTitre.forEach((l, i) => x.fillText(l, marge, 34 + 26 * i));
    x.fillStyle = "#9bb0b8"; x.font = "13px 'IBM Plex Sans Condensed', sans-serif"; x.fillText(`Atlas Pacifica · ${horodatage()}`, marge, haut - 12);
    x.drawImage(image, marge, haut, image.width * echelle, h);
    let y = haut + h;
    if (hLeg) {
      let lx = marge; x.font = "13px 'IBM Plex Sans Condensed', sans-serif";
      legende.forEach(({ couleur, libelle }) => {
        if (couleur) { x.fillStyle = couleur; x.fillRect(lx, y + 14, 14, 14); lx += 20; }
        x.fillStyle = "#e8eef0"; x.fillText(libelle, lx, y + 26); lx += x.measureText(libelle).width + 16;
      });
      y += hLeg;
    }
    x.fillStyle = "#9bb0b8"; x.font = "12px 'IBM Plex Sans Condensed', sans-serif";
    lSource.forEach((l, i) => x.fillText(l, marge, y + 24 + 18 * i));
    x.fillText(AVERTISSEMENT, marge, y + 24 + 18 * lSource.length);
    c.toBlob((b) => b && telecharger(nomFichier(base, "png"), b), "image/png");
  }

  /* Rapport PDF : prépare l'en-tête d'impression puis ouvre la boîte « Imprimer / Enregistrer en PDF ». */
  function rapport({ titre, sousTitre, sources, avant }) {
    const e = document.getElementById("impression-entete");
    if (avant && avant.firstChild !== e) avant.prepend(e);
    e.replaceChildren();
    const h = document.createElement("h1"); h.textContent = `Atlas Pacifica · ${titre}`;
    const p = document.createElement("p"); p.textContent = `${sousTitre} · édité le ${horodatage()}`;
    const s = document.createElement("p"); s.textContent = `Sources : ${sources.join(" ; ")}`;
    const a = document.createElement("p"); a.className = "avertissement"; a.textContent = AVERTISSEMENT;
    e.append(h, p, s, a);
    document.body.classList.add("impression-point");
    const fin = () => { document.body.classList.remove("impression-point"); window.removeEventListener("afterprint", fin); };
    window.addEventListener("afterprint", fin);
    setTimeout(() => window.print(), 50);
  }

  window.Export = { csv, png, rapport };
})();
