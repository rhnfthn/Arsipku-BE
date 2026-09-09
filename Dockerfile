# ========================
# Build stage
# ========================
FROM node:20-bookworm AS builder

WORKDIR /app
COPY package*.json ./
# npm install (not ci): the committed lockfile is missing nested gcp-metadata@7
# (mongoose@9.8.0/mongodb@7.5.0 dep) — npm install reconciles it in-image.
# TODO: regenerate a complete lockfile on Linux (npm 10.1.0) and revert to `npm ci`.
RUN npm install
COPY . .
RUN npm run build
RUN test -f /app/dist/main.js

# ========================
# Runtime stage (Puppeteer)
# ========================
FROM ghcr.io/puppeteer/puppeteer:22.9.0

WORKDIR /app

COPY package*.json ./
# npm install --no-package-lock (not ci): committed lockfile is incomplete (missing
# nested gcp-metadata@7 from mongoose@9.8.0/mongodb@7.5.0), so `npm ci` rejects it; and
# this runtime image runs as non-root pptruser, so `npm install` can't WRITE the lockfile
# (EACCES). --no-package-lock installs from package.json without reading/writing the lockfile.
# TODO: regenerate a complete lockfile on Linux (npm 10.1.0) and revert to `npm ci --omit=dev`.
RUN npm install --omit=dev --no-package-lock

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
ENV TZ=Asia/Jakarta
EXPOSE 3000

CMD ["node", "dist/main.js"]
