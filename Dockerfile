# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies) for building
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:24-alpine AS production

# Install CA certificates for SSL
RUN apk add --no-cache ca-certificates curl

WORKDIR /app

# Install production dependencies only
COPY package*.json ./

RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Run migrations and start the app with DNS fix
CMD ["sh", "-c", "echo 'nameserver 8.8.8.8' > /etc/resolv.conf && echo 'nameserver 8.8.4.4' >> /etc/resolv.conf && echo '103.168.136.20 auth.airnavindonesia.co.id' >> /etc/hosts && node dist/main.js"]
