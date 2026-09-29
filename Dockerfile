ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS tools
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates util-linux && rm -rf /var/lib/apt/lists/*

FROM tools AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run check

FROM tools AS runtime
WORKDIR /app
ARG APP_REVISION=bundled
ENV NODE_ENV=production
ENV FENGHUO_IMAGE_REVISION=${APP_REVISION}
COPY package*.json ./
# Fixed build environment: ordinary source updates reuse this Linux dependency set.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist-web ./dist-web
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/database ./database
# Compiled migration scripts also resolve ../database relative to import.meta.url.
COPY --from=build /app/database ./dist-server/database
COPY game-runtime.json ./
ENV HOST=0.0.0.0 PORT=18770
USER node
EXPOSE 18770
CMD ["flock", "--exclusive", "--nonblock", "--no-fork", "/state/instance.lock", "node", "dist-server/scripts/update-supervisor.js"]
