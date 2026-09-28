# Atlas Pacifica — auto-hébergement / self-hosting

Atlas Pacifica est un outil public et libre (licence MIT). Le site de référence est
https://qgis-anomaly-mto.hinovadigital.workers.dev. Tout service météorologique, université, collectivité ou
développeur peut aussi le faire tourner **sur son propre serveur**, par exemple quand le réseau de l'organisation
bloque les domaines `workers.dev`, ou pour l'intégrer à un intranet.

Le serveur auto-hébergé exécute **exactement le même code** que le site public (`worker.js` et le dossier `site/`).
Seuls les services Cloudflare sont remplacés par des équivalents locaux : SQLite pour la base, un dossier pour les
fichiers de modèles, un minuteur pour la copie automatique. Aucun compte Cloudflare n'est nécessaire.

> Outil d'analyse climatologique, **pas une prévision ni une alerte officielle**. Pour les vigilances et avis
> cycloniques en Polynésie française : https://meteo.pf

## Option 1 — Docker (recommandé)

```bash
git clone https://github.com/Heya-56/qgis-anomaly-mto.git
cd qgis-anomaly-mto
docker compose -f auto-hebergement/docker-compose.yml up -d
```

Ouvrir ensuite `http://<adresse-du-serveur>:8080`.
Derrière un proxy d'entreprise : décommenter `HTTPS_PROXY` dans `auto-hebergement/docker-compose.yml`.

## Option 2 — Node.js 22 (sans Docker)

```bash
cd qgis-anomaly-mto/auto-hebergement
npm install
npm start                      # http://localhost:8080
```

## Réglages (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8080` | Port d'écoute |
| `HOTE` | `0.0.0.0` | Adresse d'écoute (`127.0.0.1` pour un accès local seulement) |
| `DONNEES_DIR` | `./donnees-locales` (Docker : `/donnees`) | Base SQLite et fichiers de modèles |
| `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` | — | Proxy d'entreprise pour les requêtes sortantes |
| `FICHIERS_PAR_PASSAGE` | `60` | Nombre de fichiers de modèle copiés par passage (toutes les 5 min) |

Pour une mise en service publique, placer le serveur derrière un reverse proxy HTTPS (nginx, Caddy, Apache) :
l'application installable (PWA) et le mode hors ligne exigent HTTPS.

## Accès réseau nécessaires

Le **serveur** contacte (lecture seule, données ouvertes) :
- `github.com` / `objects.githubusercontent.com` : produits ECMWF calculés toutes les 6 h par le dépôt ;
- `www.gdacs.org`, `www.cpc.ncep.noaa.gov`, `psl.noaa.gov`, `gibs.earthdata.nasa.gov` : cyclones, ENSO, MJO, disponibilité NASA.

Le **navigateur** des utilisateurs contacte directement :
- `gibs.earthdata.nasa.gov` (images satellite), `api.open-meteo.com` et `power.larc.nasa.gov` (analyse d'un point).

Si un réseau bloque l'un de ces domaines, la partie correspondante de la carte reste vide ; le reste fonctionne.

## Mises à jour

```bash
git pull
docker compose -f auto-hebergement/docker-compose.yml up -d --build
```

Chaque modification du dépôt est vérifiée automatiquement (tests + construction et démarrage de l'image Docker :
workflow « Vérification »).

## Licences des données

Chaque couche affiche sa source ; les crédits doivent être conservés : ECMWF Open Data (CC BY 4.0), NASA GIBS et
NASA POWER, NOAA (IBTrACS, CPC, PSL), GDACS (Commission européenne / ONU), Open-Meteo (CC BY 4.0, **usage non
commercial** sans abonnement), Natural Earth (domaine public).

---

## English summary

Atlas Pacifica is a free, public climate and tropical-cyclone analysis map of the Pacific (MIT licence).
To run your own copy — for example inside an organisation whose network blocks `workers.dev` — clone the repository
and run `docker compose -f auto-hebergement/docker-compose.yml up -d`, then open port 8080 (put it behind HTTPS for the
installable app and offline mode). Without Docker: Node.js 22, then `npm install && npm start` in `auto-hebergement/`.
Set `HTTPS_PROXY` behind a corporate proxy. The self-hosted server runs the exact same code as the public site.
This is an analysis tool, not an official forecast or warning system.
