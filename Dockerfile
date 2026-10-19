# Один образ: сервер + веб-приложение (PWA).

# 1. Сборка веб-приложения из mobile/
FROM node:22-bookworm-slim AS web
WORKDIR /mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci
COPY mobile/ ./
RUN EXPO_OFFLINE=1 CI=1 npx expo export --platform web --output-dir /web

# 2. Сборка сервера из server/
FROM node:22-bookworm-slim AS server
WORKDIR /server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

# 3. Итоговый образ
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/team-alert.db WEB_DIR=/app/web PORT=3000
COPY --from=server /server/node_modules ./node_modules
COPY --from=server /server/dist ./dist
COPY server/package.json ./
COPY --from=web /web ./web
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
