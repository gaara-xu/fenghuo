ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run check

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist-web ./dist-web
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/database ./database
# Compiled migration scripts also resolve ../database relative to import.meta.url.
COPY --from=build /app/database ./dist-server/database
ENV HOST=0.0.0.0 PORT=18770
USER node
EXPOSE 18770
CMD ["node", "dist-server/server/index.js"]
