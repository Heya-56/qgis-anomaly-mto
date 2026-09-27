-- Atlas Pacifica : catalogue des données (étape A — fondations).
-- Chaque valeur affichée doit pouvoir remonter à sa source, son run et son fichier.

CREATE TABLE IF NOT EXISTS sources (
  id            TEXT PRIMARY KEY,          -- ex. "ecmwf-ifs"
  nom           TEXT NOT NULL,
  fournisseur   TEXT NOT NULL,
  licence       TEXT NOT NULL,
  credit        TEXT NOT NULL,
  url           TEXT NOT NULL,
  frequence     TEXT NOT NULL,
  limites       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,          -- ex. "ecmwf-ifs/2026092700"
  source_id     TEXT NOT NULL REFERENCES sources(id),
  run_utc       TEXT NOT NULL,             -- date et heure du run (ISO 8601)
  recu_le       TEXT NOT NULL,             -- date d'arrivée dans l'atlas
  statut        TEXT NOT NULL,             -- "complet" | "partiel" | "erreur"
  manifeste     TEXT NOT NULL              -- JSON du manifeste produit par le pipeline
);
CREATE INDEX IF NOT EXISTS runs_source_date ON runs(source_id, run_utc DESC);

CREATE TABLE IF NOT EXISTS fichiers (
  cle           TEXT PRIMARY KEY,          -- clé dans R2, ex. "modeles/ecmwf-ifs/2026092700/cisaillement_024.png"
  run_id        TEXT NOT NULL REFERENCES runs(id),
  produit       TEXT NOT NULL,             -- ex. "cisaillement_200_850"
  echeance_h    INTEGER,                   -- 0, 24, 48...
  valide_utc    TEXT,                      -- date de validité de l'échéance
  type_mime     TEXT NOT NULL,
  octets        INTEGER NOT NULL,
  sha256        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fichiers_run ON fichiers(run_id, produit, echeance_h);

CREATE TABLE IF NOT EXISTS journal_donnees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  quand         TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  statut        TEXT NOT NULL,             -- "ok" | "rien_de_neuf" | "erreur"
  message       TEXT NOT NULL
);

INSERT OR IGNORE INTO sources VALUES
 ('ecmwf-ifs', 'ECMWF IFS (modèle déterministe)', 'Centre européen pour les prévisions météorologiques à moyen terme (ECMWF)',
  'CC BY 4.0', 'Contient des données ECMWF Open Data (CC BY 4.0)', 'https://www.ecmwf.int/en/forecasts/datasets/open-data',
  'Runs 00 et 12 UTC utilisés, échéances jusqu''à 120 h', 'Prévision d''un seul modèle : ne jamais la lire comme une certitude ; résolution 0,25° ; champs lissés pour l''affichage');
