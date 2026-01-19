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
FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main.js"]
