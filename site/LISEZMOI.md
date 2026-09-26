# Atlas Climat Pacifique — site web

Site 100 % statique (JAMstack) : aucune base de données, aucun serveur, aucune clé d'API.

## Ce que fait le site
- **Couches NASA en direct** (NASA GIBS, service WMS) : satellite GOES-West toutes les 10 min, infrarouge (sommets
  des nuages), pluie IMERG toutes les 30 min et quotidienne, température et anomalie de l'océan (GHRSST MUR),
  vent mesuré par satellite (AMSR2). Chaque couche s'anime (bouton lecture en bas).
- **Vent prévu sur 72 h** : flèches calculées par Open-Meteo (modèles ECMWF / GFS), mises à jour à chaque déplacement.
- **Analyse d'un point** (clic sur la carte) : pluie, température et vent sur 60 jours + 7 jours de prévision,
  comparés à la normale climatologique NASA POWER.
- **Atlas ENSO** (données produites par `scripts/07_export_web.py`) : état ENSO actuel (ONI), cyclones depuis 1981
  animés par saison avec leur phase et leur type d'El Niño, cartes des épisodes 1997-98 et 2015-16.

- **Vue Globe 3D** (bouton en haut à droite) : les mêmes couches NASA sur un globe, avec les noms, les cyclones en cours
  et la saison cyclonique choisie. Les flèches de vent et les cartes d'épisodes restent en vue Carte.
- **Cyclones en cours dans le monde** : nom, vent maximal, niveau d'alerte et rayons de vent, via la fonction
  `functions/api/cyclones-actifs.js` (à la racine du projet, à côté de `site/`) (relais Cloudflare vers GDACS, cache 15 min).
- **Noms des pays, archipels et îles** : liste modifiable dans `assets/lieux.js` (les îles apparaissent en zoomant).

## Mettre à jour les données de l'atlas
Dans `scripts/` : `python 07_export_web.py` (après les étapes 01 à 04). Cela remplit `site/data/`.
Pour rafraîchir l'indice ONI : supprimer `data/raw/oni.ascii.txt`, relancer `02_telecharger_noaa.py` puis `07_export_web.py`.

## Mettre en ligne sur Cloudflare Pages
Recommandé (la fonction des cyclones en cours est incluse) : `npx wrangler pages deploy site --project-name atlas-climat-pacifique`
depuis le dossier `atlas-enso-pf`. Le glisser-déposer du tableau de bord Cloudflare ne publie pas le dossier `functions` :
le site marche, mais sans les cyclones en cours.

## Tester sur son ordinateur
Dans ce dossier : `python -m http.server 8000`, puis ouvrir http://localhost:8000.
Les cyclones en cours ne s'affichent qu'avec la fonction Cloudflare : pour la tester en local, depuis le dossier `atlas-enso-pf` : `npx wrangler pages dev site`
(Ouvrir index.html par double-clic ne suffit pas : les fichiers de données ne se chargent pas sans serveur.)

## Sources et licences
NASA GIBS / Worldview, NOAA GOES-West, NASA GPM IMERG, GHRSST MUR (NASA JPL), GCOM-W1 AMSR2 (JAXA),
NASA POWER, Open-Meteo (CC BY 4.0, usage non commercial gratuit : prévoir l'offre commerciale si le site est vendu),
NOAA NCEI IBTrACS, NOAA CPC, GDACS (Commission européenne / ONU, citer la source). Bibliothèques : Leaflet (BSD-2),
Chart.js (MIT), MapLibre GL JS (BSD-3).
Outil d'aide à l'analyse : il ne remplace pas les vigilances officielles de Météo-France.
