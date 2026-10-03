FROM node:24.21.0-alpine3.22

ENV NODE_ENV=production \
    PORT=8080 \
    QSP_DATA_DIR=/app/data

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node index.html ./
COPY --chown=node:node css ./css
COPY --chown=node:node js ./js
COPY --chown=node:node server ./server

RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/server.js"]
