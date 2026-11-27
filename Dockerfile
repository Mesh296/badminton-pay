# Build: client files and the single-file server bundle.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server

# Run: Node only. The bundle has every dependency inlined, so nothing is installed here.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATABASE_PATH=/data/app.db
COPY --from=build /app/dist/client ./public
COPY --from=build /app/server-build/server.mjs ./server.mjs
COPY migrations ./migrations
# The SQLite file lives on a volume and must be writable by the unprivileged user.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8787
# Node's built-in SQLite still prints an "experimental" notice on start; keep the log clean.
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
