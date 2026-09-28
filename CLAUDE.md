# Atlas Pacifica (dépôt qgis-anomaly-mto)

Station numérique d'analyse météorologique, climatique et cyclonique du Pacifique, centrée sur la Polynésie française.
Propriétaire : Heianui Tapare (Hinova Digital). En ligne : https://qgis-anomaly-mto.hinovadigital.workers.dev

## Règles du projet
- **Jamais présenté comme une prévision officielle ni un système d'alerte.** Vigilances : lien vers meteo.pf, jamais recopiées.
- Pas de « score de risque » magique : indicateurs séparés, facteurs pour et contre, chaque valeur traçable jusqu'à sa source.
- Formulation imposée en mode analyse : « Les conditions environnementales observées présentent certaines caractéristiques historiquement associées à l'activité cyclonique tropicale. »
- **Rester gratuit autant que possible** : offres gratuites Cloudflare, GitHub Actions (dépôt public), données ouvertes.
- Conserver crédits et licences de chaque source (ECMWF CC BY 4.0, NASA, NOAA, GDACS, Open-Meteo non commercial, Natural Earth).
- Modifications incrémentales : ne jamais casser l'existant. Textes de l'interface en français.
- Le père de Heianui (Météo-France) ne doit être engagé dans aucun choix ni achat.

## Architecture
- `site/` : PWA statique (Leaflet, MapLibre, Chart.js vendorisés, polices auto-hébergées), `sw.js` hors ligne, `_headers` (CSP stricte).
- `worker.js` + `wrangler.jsonc` : Worker Cloudflare (déployé par Workers Builds à chaque push sur `main`).
  - `/api/cyclones-actifs` (GDACS, 48 h), `/api/enso-type` (Niño3 − Niño4, NOAA CPC), `/api/mjo` (NOAA PSL), `/api/gibs-dispo` (dernière image NASA), `/api/catalogue` (D1), `/donnees/<clé>` (R2).
  - Tâche toutes les 5 min (cron `*/5 * * * *`) : recopie progressive (4 fichiers par passage, limite CPU gratuite) de la release GitHub `donnees-modeles` dans R2 après vérification SHA-256 et l'inscrit dans D1.
  - Limitation 60 req/min/IP sur les routes dynamiques.
- `pipeline/modeles_ecmwf.py` + `.github/workflows/modeles.yml` : toutes les 6 h, dernier run ECMWF IFS (Open Data) → 7 produits (cisaillement, humidité 700/500, vorticité 850, pression mer, eau précipitable, vent 10 m : PNG Web Mercator + `grilles.json` 1° + `catalogue.json`) → release `donnees-modeles`.
- `auto-hebergement/` : même code servi hors Cloudflare (Node 22 : `serveur.mjs` émule ASSETS, D1→SQLite, R2→dossier, cron→minuteur ; `Dockerfile`, `docker-compose.yml`, `LISEZMOI.md`). Toute modification de `worker.js` doit rester compatible (test `tests/auto-hebergement.test.mjs` + job Docker de « Vérification »). Le site reste public pour tous ; l'auto-hébergement sert aux organisations dont le réseau bloque `workers.dev`.
- D1 `atlas-pf-db` (schéma : `migrations/0001_catalogue.sql`), R2 `atlas-pacifica-donnees`.
- Pipeline climatologique local (ERA5, IBTrACS, épisodes El Niño) : projet `atlas-enso-pf` sur le PC, `07_export_web.py` écrit dans `site/data/`.

## Garde-fous (à respecter à chaque modification)
- Ne jamais deviner la disponibilité d'une donnée : les couches NASA s'alignent sur `/api/gibs-dispo` (DescribeDomains). Une couche que la NASA ne publie plus affiche un message explicite, jamais une carte vide.
- Toute nouvelle couche : déclarée dans `couches.js` (nom, groupe, source), fiche dans `fiches.js`, produit dans `pipeline/modeles_ecmwf.py` ou couche GIBS ajoutée à `COUCHES_GIBS` (worker.js), fichier ajouté au cache de `sw.js`, et version du cache (`VERSION` dans sw.js) incrémentée.
- `node --test tests/*.test.mjs` doit passer avant de pousser (lancé aussi par `.github/workflows/verification.yml`).
- `.github/workflows/controle.yml` vérifie chaque matin le site en ligne (fraîcheur de chaque couche, run ECMWF < 30 h, MJO, ENSO, GDACS) et ouvre un ticket GitHub en cas de problème.
- Couche retirée : marquer `retiree: true` dans `couches.js` avec la raison en commentaire (ex. AMSR2, plus publiée par la NASA depuis le 1er sept. 2025).

## Feuille de route validée
A fondations des données (fait) → B couches fondamentales (humidité, vorticité, pression, MJO, OLR, fiches « Pourquoi ? ») → C modes Comprendre / Analyser → D Cyclone Watch (trajectoires d'ensemble ECMWF, dispersion) → E analogues IBTrACS → F moteur de facteurs → G tests historiques → H exposition territoriale. En parallèle : espace privé du père (Cloudflare Access + D1).
Document de référence : audit « Audit Atlas Climat Pacifique » (onglets Audit et Vision) dans Claude Docs.
