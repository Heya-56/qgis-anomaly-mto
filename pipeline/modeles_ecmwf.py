"""Atlas Pacifica — étape A : ingestion automatique des sorties du modèle ECMWF IFS (ECMWF Open Data, CC BY 4.0).

Lancé par GitHub Actions (.github/workflows/modeles.yml) toutes les 6 heures, ou à la main :
    python pipeline/modeles_ecmwf.py --sortie sortie/

Produit, pour le dernier run disponible et chaque échéance (analyse, +24 h … +120 h) :
  - <produit>_<ech>.png : image en projection Web Mercator prête à être posée sur la carte
    (Pacifique 130° E → 120° O, 5° N → 40° S) ;
  - grilles.json : toutes les valeurs sur une grille de 1°, pour le mode ANALYSER UN POINT ;
  - catalogue.json : le manifeste (source, run, fichiers, empreintes SHA-256, légendes), lu par le Worker Cloudflare.

Produits : cisaillement 200–850 hPa, humidité relative 700 et 500 hPa, vorticité relative 850 hPa,
pression au niveau de la mer, eau précipitable. Ce sont des INDICATEURS ENVIRONNEMENTAUX, pas des prévisions de cyclone.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

SOURCE_ID = "ecmwf-ifs"
ECHEANCES = [0, 24, 48, 72, 96, 120]

# Domaine Pacifique, longitudes 0–360 (traverse l'antiméridien sans coupure)
LAT_N, LAT_S = 5.0, -40.0
LON_O, LON_E = 130.0, 240.0
OPACITE = 185  # sur 255

# Requêtes ECMWF Open Data, faites séparément : si l'une échoue, les autres produits sont quand même publiés.
REQUETES = {
    "niveaux": dict(type="fc", levtype="pl", param=["u", "v", "r", "vo"], levelist=[850, 700, 500, 200]),
    "surface": dict(type="fc", levtype="sfc", param=["msl", "tcwv", "10u", "10v"]),
}

# Chaque produit : champs nécessaires, calcul, unité, paliers de légende (de, à, couleur, libellé), méthode, limites.
# Les seuils cités sont indicatifs (littérature) : ils servent à lire la carte, pas à prévoir un cyclone.
PRODUITS = {
    "cisaillement_200_850": dict(
        titre="Cisaillement vertical du vent 200–850 hPa", unite="m/s",
        champs=[("u", 200), ("v", 200), ("u", 850), ("v", 850)],
        calcul=lambda c: np.hypot(c[("u", 200)] - c[("u", 850)], c[("v", 200)] - c[("v", 850)]),
        paliers=[(0, 5, "#2b1a4a", "0–5"), (5, 10, "#4b3a8c", "5–10"), (10, 15, "#2f7fa8", "10–15"),
                 (15, 20, "#3fb58a", "15–20"), (20, 30, "#c9c94a", "20–30"), (30, None, "#f2b445", "> 30")],
        methode="Norme de la différence vectorielle entre le vent à 200 hPa et le vent à 850 hPa (IFS, 0,25°).",
        limites="Sortie d'un seul modèle déterministe ; indicateur environnemental, pas une prévision de cyclone."),
    "humidite_700": dict(
        titre="Humidité relative à 700 hPa (~3 km)", unite="%",
        champs=[("r", 700)], calcul=lambda c: c[("r", 700)],
        paliers=[(0, 20, "#7a4a1c", "< 20"), (20, 40, "#b98a4a", "20–40"), (40, 60, "#d9cf8f", "40–60"),
                 (60, 70, "#7fc6a4", "60–70"), (70, 80, "#3a9fb8", "70–80"), (80, None, "#2a5fa8", "> 80")],
        methode="Humidité relative du modèle IFS au niveau 700 hPa (0,25°).",
        limites="Valeur instantanée du modèle, pas une mesure ; l'humidité varie vite près des orages."),
    "humidite_500": dict(
        titre="Humidité relative à 500 hPa (~5,5 km)", unite="%",
        champs=[("r", 500)], calcul=lambda c: c[("r", 500)],
        paliers=[(0, 20, "#7a4a1c", "< 20"), (20, 40, "#b98a4a", "20–40"), (40, 60, "#d9cf8f", "40–60"),
                 (60, 70, "#7fc6a4", "60–70"), (70, 80, "#3a9fb8", "70–80"), (80, None, "#2a5fa8", "> 80")],
        methode="Humidité relative du modèle IFS au niveau 500 hPa (0,25°).",
        limites="Valeur instantanée du modèle, pas une mesure."),
    "vorticite_850": dict(
        titre="Vorticité relative à 850 hPa (~1,5 km)", unite="10⁻⁵ s⁻¹",
        champs=[("vo", 850)], calcul=lambda c: lisser(c[("vo", 850)] * 1e5, 5),
        paliers=[(None, -6, "#e5484d", "< −6"), (-6, -3, "#f29a4a", "−6 à −3"), (-3, -1, "#f2d38a", "−3 à −1"),
                 (-1, 1, None, "−1 à 1"), (1, 3, "#a9cde8", "1 à 3"), (3, 6, "#4f97de", "3 à 6"), (6, None, "#2a4fa8", "> 6")],
        methode="Vorticité relative IFS à 850 hPa, lissée sur ~1,25° pour retirer le bruit de petite échelle.",
        limites="Dans l'hémisphère Sud, la rotation cyclonique (sens horaire) est NÉGATIVE ; au nord de l'équateur c'est l'inverse."),
    "pression_mer": dict(
        titre="Pression au niveau de la mer", unite="hPa",
        champs=[("msl", 0)], calcul=lambda c: c[("msl", 0)] / 100.0,
        paliers=[(None, 1000, "#e5484d", "< 1000"), (1000, 1005, "#f29a4a", "1000–1005"), (1005, 1010, "#f2d38a", "1005–1010"),
                 (1010, 1015, "#cfd8dc", "1010–1015"), (1015, 1020, "#a9cde8", "1015–1020"), (1020, 1025, "#4f97de", "1020–1025"),
                 (1025, None, "#2a4fa8", "> 1025")],
        methode="Pression réduite au niveau de la mer du modèle IFS (0,25°).",
        limites="Les creux de petite taille (cyclones) peuvent être sous-estimés par un modèle global."),
    "vent_10m": dict(
        titre="Vent à 10 m (modèle)", unite="nœuds",
        champs=[("10u", 0), ("10v", 0)], calcul=lambda c: np.hypot(c[("10u", 0)], c[("10v", 0)]) * 1.943844,
        paliers=[(0, 10, None, "< 10"), (10, 20, "#7fc6a4", "10–20"), (20, 34, "#f2d38a", "20–34"),
                 (34, 48, "#f29a4a", "34–47 (tempête)"), (48, 64, "#e5484d", "48–63 (forte tempête)"),
                 (64, None, "#c21a5b", "≥ 64 (ouragan)")],
        methode="Vitesse du vent à 10 m du modèle IFS (0,25°), convertie en nœuds.",
        limites="Vent moyen du modèle, pas une mesure ; les rafales et le vent au cœur d'un cyclone sont sous-estimés."),
    "eau_precipitable": dict(
        titre="Eau précipitable (colonne totale)", unite="mm",
        champs=[("tcwv", 0)], calcul=lambda c: c[("tcwv", 0)],
        paliers=[(0, 20, "#7a4a1c", "< 20"), (20, 30, "#b98a4a", "20–30"), (30, 40, "#d9cf8f", "30–40"),
                 (40, 50, "#7fc6a4", "40–50"), (50, 60, "#3a9fb8", "50–60"), (60, None, "#2a5fa8", "> 60")],
        methode="Vapeur d'eau totale de la colonne (kg/m², équivalent en mm d'eau) du modèle IFS.",
        limites="Quantité disponible, pas la pluie qui tombera réellement."),
}


# ---------------------------------------------------------------- lecture GRIB

def lire_grib(chemin: Path, champs: dict | None = None) -> dict:
    """Ajoute à `champs` {(param, niveau, echeance): (lats, lons, valeurs 2D)} pour une grille régulière lat/lon."""
    import eccodes

    champs = {} if champs is None else champs
    with open(chemin, "rb") as f:
        while True:
            gid = eccodes.codes_grib_new_from_file(f)
            if gid is None:
                break
            try:
                nom = eccodes.codes_get(gid, "shortName")
                niveau = int(eccodes.codes_get(gid, "level")) if eccodes.codes_get(gid, "typeOfLevel") == "isobaricInhPa" else 0
                ech = int(eccodes.codes_get(gid, "step"))
                ni = eccodes.codes_get(gid, "Ni")
                nj = eccodes.codes_get(gid, "Nj")
                lat1 = eccodes.codes_get(gid, "latitudeOfFirstGridPointInDegrees")
                lon1 = eccodes.codes_get(gid, "longitudeOfFirstGridPointInDegrees")
                di = eccodes.codes_get(gid, "iDirectionIncrementInDegrees")
                dj = eccodes.codes_get(gid, "jDirectionIncrementInDegrees")
                sud = eccodes.codes_get(gid, "jScansPositively") == 0
                v = eccodes.codes_get_values(gid).reshape(nj, ni)
                lats = lat1 - dj * np.arange(nj) if sud else lat1 + dj * np.arange(nj)
                lons = (lon1 + di * np.arange(ni)) % 360.0
                champs[(nom, niveau, ech)] = (lats, lons, v)
            finally:
                eccodes.codes_release(gid)
    return champs


def decouper(lats, lons, v):
    """Extrait le domaine Pacifique ; renvoie latitudes décroissantes et longitudes croissantes (0–360)."""
    ordre = np.argsort(lons)
    lons, v = lons[ordre], v[:, ordre]
    if lats[0] < lats[-1]:
        lats, v = lats[::-1], v[::-1, :]
    mi = (lons >= LON_O - 1e-6) & (lons <= LON_E + 1e-6)
    mj = (lats <= LAT_N + 1e-6) & (lats >= LAT_S - 1e-6)
    return lats[mj], lons[mi], v[np.ix_(mj, mi)]


def lisser(v: np.ndarray, n: int) -> np.ndarray:
    """Moyenne glissante n × n (bords recopiés)."""
    k = n // 2
    p = np.pad(v, k, mode="edge")
    c = p.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return (c[n:, n:] - c[:-n, n:] - c[n:, :-n] + c[:-n, :-n]) / (n * n)


def calculer(champs: dict, produit: str, ech: int):
    d = PRODUITS[produit]
    if any((p, niv, ech) not in champs for p, niv in d["champs"]):
        return None
    zone, lats, lons = {}, None, None
    for p, niv in d["champs"]:
        lats, lons, zone[(p, niv)] = decouper(*champs[(p, niv, ech)])
    return lats, lons, d["calcul"](zone)


# ---------------------------------------------------------------- images

def couleur(hexa: str):
    return tuple(int(hexa[i:i + 2], 16) for i in (1, 3, 5))


def vers_rgba(valeurs: np.ndarray, paliers) -> np.ndarray:
    rgba = np.zeros(valeurs.shape + (4,), dtype=np.uint8)
    for bas, haut, hexa, _ in paliers:
        if hexa is None:
            continue
        m = np.ones(valeurs.shape, dtype=bool)
        if bas is not None:
            m &= valeurs >= bas
        if haut is not None:
            m &= valeurs < haut
        rgba[m, :3] = couleur(hexa)
        rgba[m, 3] = OPACITE
    rgba[~np.isfinite(valeurs)] = 0
    return rgba


def merc_y(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def vers_mercator(lats: np.ndarray, valeurs: np.ndarray, hauteur: int) -> np.ndarray:
    """Rééchantillonne les lignes (latitudes régulières) sur des lignes régulières en Web Mercator."""
    y_n, y_s = merc_y(LAT_N), merc_y(LAT_S)
    ys = y_n + (y_s - y_n) * (np.arange(hauteur) + 0.5) / hauteur
    lat_lignes = np.degrees(2 * np.arctan(np.exp(ys)) - math.pi / 2)
    idx = np.clip(np.searchsorted(-lats, -lat_lignes), 0, len(lats) - 1)
    return valeurs[idx, :]


def ecrire_png(chemin: Path, rgba: np.ndarray):
    """PNG RGBA minimal (sans dépendance externe)."""
    h, w, _ = rgba.shape
    brut = b"".join(b"\x00" + rgba[y].tobytes() for y in range(h))

    def bloc(type_, donnees):
        return struct.pack(">I", len(donnees)) + type_ + donnees + struct.pack(">I", zlib.crc32(type_ + donnees) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + bloc(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) \
        + bloc(b"IDAT", zlib.compress(brut, 9)) + bloc(b"IEND", b"")
    chemin.write_bytes(png)


# ---------------------------------------------------------------- produits

def empreinte(chemin: Path) -> str:
    return hashlib.sha256(chemin.read_bytes()).hexdigest()


def arrondi(g):
    return [[None if not np.isfinite(x) else round(float(x), 1) for x in ligne] for ligne in g]


def produire(champs: dict, run: dt.datetime, sortie: Path) -> dict:
    sortie.mkdir(parents=True, exist_ok=True)
    fichiers, produits = [], {}
    grilles = {"echeances": ECHEANCES, "produits": {}}
    for produit, d in PRODUITS.items():
        valeurs_grille = []
        for ech in ECHEANCES:
            r = calculer(champs, produit, ech)
            if r is None:
                valeurs_grille.append(None)
                continue
            lats, lons, v = r
            largeur = v.shape[1]
            hauteur = int(round(largeur * (merc_y(LAT_N) - merc_y(LAT_S)) / math.radians(LON_E - LON_O)))
            nom = f"{produit}_{ech:03d}.png"
            ecrire_png(sortie / nom, vers_rgba(vers_mercator(lats, v, hauteur), d["paliers"]))
            valide = run + dt.timedelta(hours=ech)
            fichiers.append({"nom": nom, "produit": produit, "echeance_h": ech,
                             "valide_utc": valide.strftime("%Y-%m-%dT%H:%MZ"), "type_mime": "image/png"})
            pas = int(round(1.0 / abs(lats[1] - lats[0])))
            g = v[::pas, ::pas]
            grilles.update({"lat0": float(lats[0]), "lon0": float(lons[0]), "pas": 1.0, "nj": g.shape[0], "ni": g.shape[1]})
            valeurs_grille.append(arrondi(g))
        if any(x is not None for x in valeurs_grille):
            grilles["produits"][produit] = {"unite": d["unite"], "valeurs": valeurs_grille}
            produits[produit] = {
                "titre": d["titre"], "unite": d["unite"],
                "bornes": [[LAT_S, LON_O - 360], [LAT_N, LON_E - 360]],
                "legende": [{"de": b, "a": h, "couleur": c, "libelle": l} for b, h, c, l in d["paliers"]],
                "methode": d["methode"], "limites": d["limites"],
            }
            print(f"  {produit} : {sum(x is not None for x in valeurs_grille)} échéances")
        else:
            print(f"  {produit} : champs absents, produit ignoré")

    if not fichiers:
        raise SystemExit("Aucun champ exploitable dans les fichiers GRIB.")

    grilles.update({"run_utc": run.strftime("%Y-%m-%dT%H:%MZ"), "source": "ECMWF Open Data (IFS), CC BY 4.0"})
    (sortie / "grilles.json").write_text(json.dumps(grilles, separators=(",", ":")), encoding="utf-8")
    fichiers.append({"nom": "grilles.json", "produit": "grilles", "echeance_h": None, "valide_utc": None,
                     "type_mime": "application/json"})

    for f in fichiers:
        chemin = sortie / f["nom"]
        f["octets"] = chemin.stat().st_size
        f["sha256"] = empreinte(chemin)

    catalogue = {
        "version": 2,
        "source_id": SOURCE_ID,
        "run_utc": run.strftime("%Y-%m-%dT%H:%MZ"),
        "genere_le": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "credit": "Contient des données ECMWF Open Data (CC BY 4.0)",
        "fichiers": fichiers,
        "produits": produits,
    }
    (sortie / "catalogue.json").write_text(json.dumps(catalogue, ensure_ascii=False, indent=1), encoding="utf-8")
    return catalogue


# ---------------------------------------------------------------- téléchargement

def telecharger(dossier: Path, run_force: str | None = None):
    from ecmwf.opendata import Client

    client = Client(source="ecmwf")
    if run_force:
        d = dt.datetime.strptime(run_force, "%Y%m%d%H")
    else:
        d = client.latest(**REQUETES["niveaux"], step=ECHEANCES)
    fichiers = []
    for nom, req in REQUETES.items():
        cible = dossier / f"ecmwf_{nom}.grib2"
        try:
            client.retrieve(target=str(cible), date=d.strftime("%Y%m%d"), time=d.hour, step=ECHEANCES, **req)
            fichiers.append(cible)
        except Exception as e:  # un groupe manquant ne bloque pas les autres
            print(f"  requête « {nom} » impossible : {e}")
    if not fichiers:
        raise SystemExit("Aucun téléchargement ECMWF réussi.")
    return fichiers, d.replace(tzinfo=dt.timezone.utc)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sortie", default="sortie", type=Path)
    ap.add_argument("--grib", type=Path, nargs="+", help="fichiers GRIB déjà téléchargés (tests)")
    ap.add_argument("--run", help="run AAAAMMJJHH (avec --grib, ou pour forcer un run)")
    ap.add_argument("--deja-publie", help="run_utc du catalogue déjà publié : on s'arrête si identique")
    a = ap.parse_args()
    a.sortie.mkdir(parents=True, exist_ok=True)

    if a.grib:
        gribs, run = a.grib, dt.datetime.strptime(a.run, "%Y%m%d%H").replace(tzinfo=dt.timezone.utc)
    else:
        if a.deja_publie:
            from ecmwf.opendata import Client
            d = Client(source="ecmwf").latest(**REQUETES["niveaux"], step=ECHEANCES)
            if d.strftime("%Y-%m-%dT%H:%MZ") == a.deja_publie and not a.run:
                print(f"Run {a.deja_publie} déjà publié : rien à faire.")
                (a.sortie / "RIEN_DE_NEUF").write_text(a.deja_publie)
                return 0
        gribs, run = telecharger(a.sortie, a.run)
    champs = {}
    for g in gribs:
        lire_grib(g, champs)
    cat = produire(champs, run, a.sortie)
    if not a.grib:
        for g in gribs:
            g.unlink(missing_ok=True)
    print(f"Run {cat['run_utc']} : {len(cat['fichiers'])} fichiers, {len(cat['produits'])} produits.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
