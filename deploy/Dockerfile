# Example only. Requires a genuine committed lockfile and prior native/MCP qualification.
FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts/copy-assets.mjs ./scripts/copy-assets.mjs
RUN npm run build && npm prune --omit=dev

FROM node:24.21.0-bookworm-slim
ENV NODE_ENV=production NOOKWIRE_DB=/data/nookwire.sqlite NOOKWIRE_BIND=0.0.0.0 NOOKWIRE_PORT=8787
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node deploy/entrypoint.sh /app/entrypoint.sh
RUN mkdir -p /data && chown node:node /data && chmod 700 /data && chmod 755 /app/entrypoint.sh
USER node
EXPOSE 8787
STOPSIGNAL SIGTERM
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/server.js"]
