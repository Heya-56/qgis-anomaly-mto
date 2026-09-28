/* Fiches « Pourquoi ? » : chaque donnée importante est expliquée simplement, sans cacher la science.
   Structure : titre, definition, importance, lecture, limites, couche (id de couche à afficher avec « Voir sur la carte »). */
window.FICHES = {
  sst: {
    titre: "SST · température de surface de la mer",
    definition: "La température de l'eau dans les tout premiers mètres de l'océan, mesurée par satellite (infrarouge et micro-ondes) et combinée chaque jour sur une grille de 1 km.",
    importance: "Un cyclone tire son énergie de l'évaporation d'une eau chaude. Au-dessus d'environ 26,5 °C, sur une épaisseur suffisante, l'océan peut fournir cette énergie : c'est l'un des ingrédients de la formation des cyclones.",
    lecture: "Les teintes chaudes signalent une eau chaude. Repérez où passe la limite des 26–27 °C : autour de la Polynésie, elle se déplace selon la saison et selon El Niño.",
    limites: "C'est la température de surface seulement : une couche chaude trop fine peut être brassée par le vent. Une eau chaude est nécessaire, mais ne suffit pas à former un cyclone.",
    couche: "sst"
  },
  sstAnom: {
    titre: "SST ANOMALY · écart à la normale",
    definition: "La différence entre la température de surface du jour et la température habituelle à cette date (normale climatologique). +0,8 °C veut dire « 0,8 °C plus chaud que d'habitude ».",
    importance: "Les anomalies révèlent ce que la température brute cache : El Niño et La Niña, les vagues de chaleur marines, les zones où l'océan fournit plus (ou moins) d'énergie que d'ordinaire à l'atmosphère.",
    lecture: "Rouge = plus chaud que la normale, bleu = plus froid. Une large bande rouge le long de l'équateur jusqu'à l'Amérique du Sud est la signature d'El Niño.",
    limites: "Une anomalie positive dans une eau froide peut rester trop froide pour un cyclone : lisez toujours l'anomalie avec la SST elle-même.",
    couche: "sstAnom"
  },
  cisaillement: {
    titre: "Cisaillement vertical du vent 200–850 hPa",
    definition: "La différence entre le vent en haut de l'atmosphère (200 hPa, environ 12 km) et le vent en bas (850 hPa, environ 1,5 km), en vitesse et en direction.",
    importance: "Un cyclone est une colonne d'orages qui tourne sur elle-même. Si le vent en altitude est très différent du vent en bas, il « penche » et disperse cette colonne. Un cisaillement faible est l'un des ingrédients historiquement associés à la formation et au renforcement des cyclones.",
    lecture: "Violet : cisaillement faible (moins de 10 m/s environ), environnement plus favorable à l'organisation des orages. Du bleu à l'orange : cisaillement de plus en plus fort, défavorable. La bande orange au sud correspond souvent au courant-jet.",
    limites: "Sortie d'un seul modèle (ECMWF), pas une mesure. Les seuils sont indicatifs. Un cisaillement faible ne crée pas de cyclone à lui seul : il faut aussi eau chaude, humidité, rotation et convection.",
    couche: "cisaillement"
  },
  humidite700: {
    titre: "Humidité relative à 700 hPa",
    definition: "La part de vapeur d'eau dans l'air à environ 3 km d'altitude, par rapport au maximum possible à cette température (100 % = air saturé).",
    importance: "Les orages qui forment un cyclone ont besoin d'une moyenne atmosphère humide. De l'air sec entraîné dans les nuages les fait s'évaporer et affaiblit le système.",
    lecture: "Bleu : air humide (plus de 70 % environ), plutôt favorable. Brun : air sec, défavorable à la convection profonde.",
    limites: "Valeur du modèle ECMWF à un instant donné. L'humidité change vite autour des orages.",
    couche: "humidite700"
  },
  humidite500: {
    titre: "Humidité relative à 500 hPa",
    definition: "La même mesure qu'à 700 hPa, mais plus haut, vers 5,5 km d'altitude.",
    importance: "Une colonne humide sur toute sa hauteur est un signe que la convection profonde peut se maintenir. Un air sec à ce niveau est un frein fréquent au développement des systèmes tropicaux.",
    lecture: "Comparez avec 700 hPa : si les deux niveaux sont humides au même endroit, l'environnement est plus favorable à des orages organisés.",
    limites: "Sortie de modèle, pas une mesure. À interpréter avec les autres ingrédients.",
    couche: "humidite500"
  },
  vorticite: {
    titre: "Vorticité relative à 850 hPa",
    definition: "Une mesure de la rotation de l'air autour d'un axe vertical, vers 1,5 km d'altitude.",
    importance: "Un cyclone naît souvent d'une zone où l'air tourne déjà un peu (une perturbation, un creux, la zone de convergence du Pacifique Sud). Cette rotation initiale est l'un des ingrédients de la cyclogenèse.",
    lecture: "Dans l'hémisphère Sud, la rotation cyclonique (sens des aiguilles d'une montre) donne une vorticité NÉGATIVE : elle apparaît en orange et rouge. Le bleu indique une rotation anticyclonique. Au nord de l'équateur, c'est l'inverse.",
    limites: "Champ du modèle ECMWF, lissé pour retirer le bruit. Beaucoup de zones de rotation ne deviennent jamais des cyclones.",
    couche: "vorticite"
  },
  pression: {
    titre: "Pression au niveau de la mer",
    definition: "Le poids de l'air au-dessus d'un point, ramené au niveau de la mer, en hectopascals (hPa). La moyenne est d'environ 1013 hPa.",
    importance: "Les dépressions (basses pressions) accompagnent les perturbations et les cyclones ; les anticyclones (hautes pressions) guident leur trajectoire. La position de l'anticyclone de l'île de Pâques influence le temps en Polynésie.",
    lecture: "Rouge : pression basse (moins de 1005 hPa environ). Bleu : pression haute. Un creux isolé et marqué mérite attention ; il se confirme d'un run à l'autre.",
    limites: "Un modèle global représente mal le cœur très creusé d'un cyclone : la pression minimale réelle est souvent plus basse.",
    couche: "pression"
  },
  eauPrecipitable: {
    titre: "Eau précipitable",
    definition: "La quantité totale de vapeur d'eau contenue dans toute la colonne d'air, exprimée en millimètres d'eau si elle tombait entièrement.",
    importance: "Elle montre les réservoirs d'humidité disponibles pour les fortes pluies et pour la convection tropicale. Les valeurs très élevées accompagnent la zone de convergence du Pacifique Sud et les systèmes tropicaux.",
    lecture: "Bleu foncé : plus de 50–60 mm, atmosphère très chargée en eau. Brun : atmosphère sèche.",
    limites: "C'est l'eau disponible, pas la pluie qui tombera : il faut un mécanisme qui soulève l'air pour qu'il pleuve.",
    couche: "eauPrecipitable"
  },
  vent10m: {
    titre: "Vent à 10 m",
    definition: "La vitesse du vent moyen à 10 mètres au-dessus de la mer, calculée par le modèle ECMWF, en nœuds (1 nœud = 1,852 km/h).",
    importance: "C'est le vent qui fait la mer et la houle, et qui touche les îles. Les seuils marins sont universels : 34 nœuds pour une tempête tropicale, 64 nœuds pour la force ouragan (cyclone tropical).",
    lecture: "Transparent : vent faible (moins de 10 nœuds). Du vert à l'orange : vent qui forcit. Rouge et pourpre : vents de tempête et d'ouragan, à surveiller dans les bulletins officiels de Météo-France.",
    limites: "Vent moyen d'un modèle global à 25 km de résolution : les rafales, les effets de relief et le cœur d'un cyclone sont sous-estimés. Ce n'est pas une mesure ni une alerte.",
    couche: "vent10m"
  },
  enso: {
    titre: "ENSO · El Niño et La Niña",
    definition: "El Niño–Oscillation australe : une variation naturelle, sur plusieurs mois à quelques années, de la température de l'océan Pacifique équatorial et des vents qui l'accompagnent. L'indice ONI (NOAA) mesure l'anomalie de température dans la zone Niño 3.4.",
    importance: "Pendant El Niño, la zone de convergence du Pacifique Sud et la zone de formation des cyclones se déplacent vers l'est : l'exposition de la Polynésie française est historiquement plus élevée (8 systèmes en 1997-98). Le « type » d'El Niño compte aussi : un réchauffement concentré à l'est (Niño 3 − Niño 4 positif) a accompagné les saisons les plus actives.",
    lecture: "ONI ≥ +0,5 °C : El Niño ; ≤ −0,5 °C : La Niña ; ≥ +1,5 °C : épisode fort. La ligne Niño3 − Niño4 indique si le réchauffement est plutôt à l'est ou au centre du Pacifique.",
    limites: "Relation climatologique et statistique : ENSO modifie les probabilités sur une saison, il ne cause pas un cyclone en particulier. 2015-16, El Niño très fort, n'a donné qu'un système en Polynésie.",
    couche: null
  },
  mjo: {
    titre: "MJO · oscillation de Madden-Julian",
    definition: "Une grande zone d'orages et de pluies renforcées qui fait le tour de la Terre le long de l'équateur, d'ouest en est, en 30 à 60 jours environ. Sa position est décrite par une phase (1 à 8) et son intensité par une amplitude.",
    importance: "Quand la MJO est active et passe sur le Pacifique (phases 6 à 8 environ), elle peut favoriser la formation de systèmes tropicaux pendant quelques semaines. C'est la variabilité « intra-saisonnière », entre la météo du jour et la saison.",
    lecture: "Amplitude ≥ 1 : MJO active. Phase 4-5 : continent maritime (Indonésie) ; 6-7 : Pacifique ouest et central ; 8 : hémisphère occidental. Le petit diagramme trace les 40 derniers jours : la trajectoire tourne dans le sens inverse des aiguilles d'une montre.",
    limites: "Indice temps réel (ROMI, NOAA PSL), qui peut être légèrement révisé. La MJO module les chances, elle ne décide pas seule.",
    couche: null
  }
};
