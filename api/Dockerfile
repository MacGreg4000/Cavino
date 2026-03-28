FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY src ./src
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY --from=builder /app/dist ./dist
COPY drizzle.config.ts ./
COPY src/db/schema.ts ./src/db/schema.ts
COPY tsconfig.json ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
EXPOSE 3010
ENTRYPOINT ["./entrypoint.sh"]
