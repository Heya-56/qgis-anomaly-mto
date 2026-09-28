/* Catalogue des couches. Identifiants NASA GIBS vérifiés dans la configuration officielle de NASA Worldview.
   pas : "10min" | "30min" | "1j"   latence : délai avant disponibilité (minutes ou jours)   images : nombre d'images animées */
window.COUCHES_TOUTES = [
  {
    id: "goes", groupe: "☁️ Satellite et convection", nom: "Satellite", detail: "Nuages en couleurs naturelles, toutes les 10 min",
    gibs: "GOES-West_ABI_GeoColor", format: "image/png", pas: "10min", latence_min: 60, images: 18,
    legende: null, source: "GOES-West (NOAA) via NASA GIBS",
    aide: "Le jour : image couleur. La nuit : infrarouge (nuages bas en bleu, nuages hauts en blanc). Couvre le Pacifique centré sur 137° O. Environ 40 min de décalage."
  },
  {
    id: "ir", groupe: "☁️ Satellite et convection", nom: "Sommets des nuages", detail: "Infrarouge : repérer orages et cyclones",
    gibs: "GOES-West_ABI_Band13_Clean_Infrared", format: "image/png", pas: "10min", latence_min: 60, images: 18,
    legende: null, source: "GOES-West bande 13 (NOAA) via NASA GIBS",
    aide: "Plus c'est froid, plus le nuage est haut : les couleurs vives signalent les orages et les cœurs de cyclones."
  },
  {
    id: "pluie30", groupe: "🌧️ Pluie", nom: "Pluie en direct", detail: "Intensité toutes les 30 min (mm/h)",
    gibs: "IMERG_Precipitation_Rate_30min", format: "image/png", pas: "30min", latence_min: 330, images: 16,
    legende: "GPM_Precipitation_Rate", source: "NASA GPM IMERG Early via NASA GIBS",
    aide: "Estimation satellite de la pluie en mm/h. Disponible environ 5 h après l'observation."
  },
  {
    id: "pluieJour", groupe: "🌧️ Pluie", nom: "Pluie du jour", detail: "Synthèse quotidienne IMERG",
    gibs: "IMERG_Precipitation_Rate", format: "image/png", pas: "1j", latence_j: 2, images: 14,
    legende: "GPM_Precipitation_Rate", source: "NASA GPM IMERG via NASA GIBS",
    aide: "Image quotidienne produite par la NASA à partir des estimations toutes les 30 minutes."
  },
  {
    id: "sst", groupe: "🌊 Océan", fiche: "sst", nom: "SST · température de l'océan", detail: "Valeur absolue en surface, 1 km, quotidienne (°C)",
    gibs: "GHRSST_L4_MUR_Sea_Surface_Temperature", format: "image/png", pas: "1j", latence_j: 3, images: 30,
    legende: "GHRSST_Sea_Surface_Temperature", source: "GHRSST MUR (NASA JPL) via NASA GIBS",
    aide: "Au-dessus de 26,5 °C, l'océan fournit assez d'énergie pour qu'un cyclone se forme."
  },
  {
    id: "sstAnom", groupe: "🌊 Océan", fiche: "sstAnom", nom: "SST ANOMALY · écart à la normale", detail: "Différence avec la normale climatologique (°C)",
    gibs: "GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies", format: "image/png", pas: "1j", latence_j: 3, images: 30,
    legende: "GHRSST_Sea_Surface_Temperature_Anomalies", source: "GHRSST MUR (NASA JPL) via NASA GIBS",
    aide: "Rouge = plus chaud que d'habitude, bleu = plus froid. C'est la couche qui montre El Niño et La Niña."
  },
  /* « Vent mesuré » (AMSR2, NASA GIBS) retiré : la NASA ne publie plus cette couche depuis le 1er septembre 2025.
     Remplacé par le vent à 10 m du modèle ECMWF (groupe Atmosphère). */
  {
    retiree: true, id: "ventSat", groupe: "🌊 Océan", nom: "Vent mesuré", detail: "Satellite AMSR2, passage de jour (m/s)",
    gibs: "AMSRU2_Wind_Speed_Day", format: "image/png", pas: "1j", latence_j: 1, images: 14,
    legende: "AMSR_Wind_Speed", source: "GCOM-W1 AMSR2 via NASA GIBS",
    aide: "Vitesse du vent à la surface de l'océan, mesurée par satellite. Bandes vides entre deux passages."
  },
  {
    id: "cisaillement", groupe: "🌬️ Atmosphère · modèle ECMWF", fiche: "cisaillement", nom: "Cisaillement vertical 200–850 hPa", detail: "Modèle ECMWF, analyse et prévision à 5 jours (m/s)",
    modele: "cisaillement_200_850", source: "ECMWF Open Data (IFS), CC BY 4.0",
    aide: "Différence de vent entre le bas (850 hPa, ~1,5 km) et le haut (200 hPa, ~12 km) de l'atmosphère. Un cisaillement faible (violet, moins de 10 m/s environ) laisse les nuages d'orage s'organiser en colonne : c'est l'un des ingrédients historiquement associés à la formation des cyclones. Un cisaillement fort (du bleu à l'orange) disperse la convection. Indicateur environnemental, pas une prévision de cyclone."
  },
  {
    id: "vent10m", groupe: "🌬️ Atmosphère · modèle ECMWF", fiche: "vent10m",
    nom: "Vent à 10 m", detail: "Vent moyen près de la surface, analyse et prévision à 5 jours (nœuds)",
    modele: "vent_10m", source: "ECMWF Open Data (IFS), CC BY 4.0",
    aide: "Vent moyen du modèle à 10 m au-dessus de la mer. Seuils des cartes marines : 34 nœuds = coup de vent/tempête, 64 nœuds = force ouragan."
  },
  {
    id: "humidite700", groupe: "🌬️ Atmosphère · modèle ECMWF", fiche: "humidite700",
    nom: "Humidité à 700 hPa", detail: "Humidité relative vers 3 km, analyse et prévision à 5 jours (%)",
    modele: "humidite_700", source: "ECMWF Open Data (IFS), CC BY 4.0",
    aide: "Une moyenne atmosphère humide (bleu) permet aux orages de se maintenir ; l'air sec (brun) les affaiblit."
  },
  {
    id: "humidite500", groupe: "🌬️ Atmosphère · modèle ECMWF", fiche: "humidite500",
    nom: "Humidité à 500 hPa", detail: "Humidité relative vers 5,5 km (%)",
    modele: "humidite_500", source: "ECMWF Open Data (IFS), CC BY 4.0",
    aide: "À lire avec 700 hPa : une colonne humide sur toute la hauteur est plus favorable à la convection profonde."
  },
  {
    id: "eauPrecipitable", groupe: "🌬️ Atmosphère · modèle ECMWF", fiche: "eauPrecipitable",
    nom: "Eau précipitable", detail: "Vapeur d'eau de toute la colonne d'air (mm)",
    modele: "eau_precipitable", source: "ECMWF Open Data (IFS), CC BY 4.0",
    aide: "Réservoir d'humidité disponible pour les pluies et la convection ; ce n'est pas la pluie qui tombera."
  },
  {
    id: "vorticite", groupe: "🌬️ Atmosphère · modèle ECMWF", fiche: "vorticite",
    nom: "Vorticité à 850 hPa", detail: "Rotation de l'air vers 1,5 km (10⁻⁵ s⁻¹)",
    modele: "vorticite_850", source: "ECMWF Open Data (IFS), CC BY 4.0",
    aide: "Hémisphère Sud : la rotation cyclonique est négative (orange et rouge). Une rotation préexistante est l'un des ingrédients de la cyclogenèse."
  },
  {
    id: "pression", groupe: "🌬️ Atmosphère · modèle ECMWF", fiche: "pression",
    nom: "Pression au niveau de la mer", detail: "Dépressions et anticyclones (hPa)",
    modele: "pression_mer", source: "ECMWF Open Data (IFS), CC BY 4.0",
    aide: "Rouge : basses pressions (perturbations) ; bleu : anticyclones, qui guident les trajectoires."
  },
  { id: "aucune", groupe: "🗺️ Fond", nom: "Fond seul", detail: "Relief et bathymétrie Blue Marble", gibs: null }
];

window.COUCHES = window.COUCHES_TOUTES.filter((c) => !c.retiree);

window.SOURCES = {
  gibsWms: "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi",
  gibsLegendes: "https://gibs.earthdata.nasa.gov/legends/",
  openMeteo: "https://api.open-meteo.com/v1/forecast",
  power: "https://power.larc.nasa.gov/api/temporal/climatology/point"
};
