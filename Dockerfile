# ========================
# Build stage
# ========================
FROM node:20-bookworm AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ========================
# Runtime stage (Puppeteer)
# ========================
FROM ghcr.io/puppeteer/puppeteer:22.9.0

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
EXPOSE 3000
