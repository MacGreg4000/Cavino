FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY src ./src
RUN npx tsc

FROM node:20-alpine
# Chromium pour Puppeteer (génération PDF)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-liberation \
    font-noto
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm install drizzle-kit
COPY --from=builder /app/dist ./dist
COPY drizzle.config.ts ./
COPY src/db/schema.ts ./src/db/schema.ts
COPY tsconfig.json ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
EXPOSE 3010
ENTRYPOINT ["./entrypoint.sh"]
