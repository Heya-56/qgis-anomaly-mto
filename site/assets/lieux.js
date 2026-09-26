/* Noms de lieux affichés sur la carte et le globe.
   [nom, latitude, longitude, niveau]  niveau 1 = pays / territoire (dès le zoom 2), 2 = archipel (zoom 4), 3 = île (zoom 6).
   Positions approximatives, pour l'étiquetage uniquement. */
window.LIEUX = [
  // Polynésie française
  ["Polynésie française", -17.5, -145.5, 1],
  ["Îles Marquises", -8.3, -139.9, 2],
  ["Archipel des Tuamotu", -16.9, -143.6, 2],
  ["Îles de la Société", -15.9, -150.8, 2],
  ["Îles Australes", -24.6, -149.8, 2],
  ["Îles Gambier", -22.3, -134.6, 2],
  ["Tahiti", -17.65, -149.43, 3], ["Moorea", -17.53, -149.83, 3], ["Tetiaroa", -17.01, -149.56, 3],
  ["Huahine", -16.75, -151.0, 3], ["Raiatea", -16.83, -151.44, 3], ["Bora Bora", -16.5, -151.74, 3],
  ["Maupiti", -16.44, -152.25, 3], ["Makatea", -15.83, -148.25, 3], ["Rangiroa", -15.12, -147.65, 3],
  ["Tikehau", -15.0, -148.17, 3], ["Manihi", -14.43, -146.05, 3], ["Fakarava", -16.33, -145.62, 3],
  ["Anaa", -17.42, -145.5, 3], ["Makemo", -16.6, -143.73, 3], ["Hao", -18.1, -140.95, 3],
  ["Mangareva", -23.12, -134.97, 3], ["Rurutu", -22.46, -151.34, 3], ["Rimatara", -22.65, -152.81, 3],
  ["Tubuai", -23.36, -149.47, 3], ["Raivavae", -23.87, -147.66, 3], ["Rapa", -27.61, -144.34, 3],
  ["Nuku Hiva", -8.86, -140.14, 3], ["Ua Pou", -9.4, -140.08, 3], ["Ua Huka", -8.91, -139.55, 3],
  ["Hiva Oa", -9.78, -139.03, 3], ["Tahuata", -9.95, -139.08, 3], ["Fatu Hiva", -10.47, -138.64, 3],
  // Pacifique
  ["Îles Cook", -19.5, -159.8, 1], ["Rarotonga", -21.23, -159.78, 3], ["Aitutaki", -18.86, -159.79, 3],
  ["Niue", -19.05, -169.87, 2], ["Samoa", -13.76, -172.1, 1], ["Samoa américaines", -14.3, -170.7, 2],
  ["Tonga", -21.18, -175.2, 1], ["Wallis-et-Futuna", -13.3, -176.2, 2], ["Tuvalu", -8.5, 179.2, 2],
  ["Fidji", -17.8, 178.0, 1], ["Vanuatu", -16.0, 167.5, 1], ["Nouvelle-Calédonie", -21.3, 165.5, 1],
  ["Îles Salomon", -9.6, 160.2, 1], ["Papouasie-Nouvelle-Guinée", -6.3, 147.0, 1],
  ["Nouvelle-Zélande", -41.0, 174.5, 1], ["Australie", -25.3, 133.8, 1],
  ["Kiribati (Tarawa)", 1.45, 173.0, 1], ["Kiritimati", 1.87, -157.4, 2], ["Tokelau", -9.2, -171.8, 2],
  ["Pitcairn", -25.07, -130.1, 1], ["Rapa Nui (île de Pâques)", -27.12, -109.35, 1],
  ["Hawaï", 20.8, -156.3, 1], ["Îles Marshall", 7.1, 171.2, 2], ["Micronésie", 6.9, 158.2, 2],
  ["Palaos", 7.5, 134.6, 2], ["Guam", 13.44, 144.79, 2], ["Nauru", -0.53, 166.93, 2],
  ["Galápagos", -0.8, -91.1, 2],
  // Continents et grands pays riverains
  ["Chili", -30.0, -71.0, 1], ["Pérou", -10.0, -76.0, 1], ["Équateur", -1.5, -78.5, 1],
  ["Mexique", 23.6, -102.5, 1], ["États-Unis", 39.0, -98.0, 1], ["Canada", 56.0, -106.0, 1],
  ["Japon", 36.2, 138.3, 1], ["Philippines", 12.9, 121.8, 1], ["Indonésie", -2.5, 118.0, 1],
  ["Chine", 35.0, 104.0, 1], ["Brésil", -10.0, -53.0, 1], ["Argentine", -34.0, -64.0, 1],
  ["France", 46.6, 2.4, 1], ["Madagascar", -19.4, 46.7, 1], ["La Réunion", -21.1, 55.5, 2],
  ["Inde", 21.0, 78.9, 1], ["Afrique du Sud", -30.0, 25.0, 1], ["Antarctique", -80.0, 0.0, 1]
];
