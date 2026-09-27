/* Catalogue des couches. Identifiants NASA GIBS vérifiés dans la configuration officielle de NASA Worldview.
   pas : "10min" | "30min" | "1j"   latence : délai avant disponibilité (minutes ou jours)   images : nombre d'images animées */
window.COUCHES = [
  {
    id: "goes", nom: "Satellite", detail: "Nuages en couleurs naturelles, toutes les 10 min",
    gibs: "GOES-West_ABI_GeoColor", format: "image/png", pas: "10min", latence_min: 60, images: 18,
    legende: null, source: "GOES-West (NOAA) via NASA GIBS",
    aide: "Le jour : image couleur. La nuit : infrarouge (nuages bas en bleu, nuages hauts en blanc). Couvre le Pacifique centré sur 137° O. Environ 40 min de décalage."
  },
  {
    id: "ir", nom: "Sommets des nuages", detail: "Infrarouge : repérer orages et cyclones",
    gibs: "GOES-West_ABI_Band13_Clean_Infrared", format: "image/png", pas: "10min", latence_min: 60, images: 18,
    legende: null, source: "GOES-West bande 13 (NOAA) via NASA GIBS",
    aide: "Plus c'est froid, plus le nuage est haut : les couleurs vives signalent les orages et les cœurs de cyclones."
  },
  {
    id: "pluie30", nom: "Pluie en direct", detail: "Intensité toutes les 30 min (mm/h)",
    gibs: "IMERG_Precipitation_Rate_30min", format: "image/png", pas: "30min", latence_min: 330, images: 16,
    legende: "GPM_Precipitation_Rate", source: "NASA GPM IMERG Early via NASA GIBS",
    aide: "Estimation satellite de la pluie en mm/h. Disponible environ 5 h après l'observation."
  },
  {
    id: "pluieJour", nom: "Pluie du jour", detail: "Synthèse quotidienne IMERG",
    gibs: "IMERG_Precipitation_Rate", format: "image/png", pas: "1j", latence_j: 1, images: 14,
    legende: "GPM_Precipitation_Rate", source: "NASA GPM IMERG via NASA GIBS",
    aide: "Image quotidienne produite par la NASA à partir des estimations toutes les 30 minutes."
  },
  {
    id: "sst", nom: "SST · température de l'océan", detail: "Valeur absolue en surface, 1 km, quotidienne (°C)",
    gibs: "GHRSST_L4_MUR_Sea_Surface_Temperature", format: "image/png", pas: "1j", latence_j: 2, images: 30,
    legende: "GHRSST_Sea_Surface_Temperature", source: "GHRSST MUR (NASA JPL) via NASA GIBS",
    aide: "Au-dessus de 26,5 °C, l'océan fournit assez d'énergie pour qu'un cyclone se forme."
  },
  {
    id: "sstAnom", nom: "SST ANOMALY · écart à la normale", detail: "Différence avec la normale climatologique (°C)",
    gibs: "GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies", format: "image/png", pas: "1j", latence_j: 2, images: 30,
    legende: "GHRSST_Sea_Surface_Temperature_Anomalies", source: "GHRSST MUR (NASA JPL) via NASA GIBS",
    aide: "Rouge = plus chaud que d'habitude, bleu = plus froid. C'est la couche qui montre El Niño et La Niña."
  },
  {
    id: "ventSat", nom: "Vent mesuré", detail: "Satellite AMSR2, passage de jour (m/s)",
    gibs: "AMSRU2_Wind_Speed_Day", format: "image/png", pas: "1j", latence_j: 1, images: 14,
    legende: "AMSR_Wind_Speed", source: "GCOM-W1 AMSR2 via NASA GIBS",
    aide: "Vitesse du vent à la surface de l'océan, mesurée par satellite. Bandes vides entre deux passages."
  },
  {
    id: "cisaillement", nom: "Cisaillement vertical 200–850 hPa", detail: "Modèle ECMWF, analyse et prévision à 5 jours (m/s)",
    modele: "cisaillement_200_850", source: "ECMWF Open Data (IFS), CC BY 4.0",
    aide: "Différence de vent entre le bas (850 hPa, ~1,5 km) et le haut (200 hPa, ~12 km) de l'atmosphère. Un cisaillement faible (violet, moins de 10 m/s environ) laisse les nuages d'orage s'organiser en colonne : c'est l'un des ingrédients historiquement associés à la formation des cyclones. Un cisaillement fort (du bleu à l'orange) disperse la convection. Indicateur environnemental, pas une prévision de cyclone."
  },
  { id: "aucune", nom: "Fond seul", detail: "Relief et bathymétrie Blue Marble", gibs: null }
];

window.SOURCES = {
  gibsWms: "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi",
  gibsLegendes: "https://gibs.earthdata.nasa.gov/legends/",
  openMeteo: "https://api.open-meteo.com/v1/forecast",
  power: "https://power.larc.nasa.gov/api/temporal/climatology/point"
};
