# Atlas Pacifica — image auto-hébergée (même code que le site public).
# Construction depuis la racine du dépôt :  docker build -f auto-hebergement/Dockerfile -t atlas-pacifica .
FROM node:22-alpine
RUN mkdir -p /donnees && chown node:node /donnees
WORKDIR /app
COPY auto-hebergement/package.json auto-hebergement/
RUN cd auto-hebergement && npm install --omit=dev --no-audit --no-fund
COPY worker.js ./
COPY migrations ./migrations
COPY site ./site
COPY auto-hebergement/serveur.mjs auto-hebergement/
ENV PORT=8080 DONNEES_DIR=/donnees NODE_ENV=production
VOLUME ["/donnees"]
EXPOSE 8080
USER node
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/catalogue >/dev/null || exit 1
CMD ["node", "--no-warnings", "auto-hebergement/serveur.mjs"]
