# Cavino — Wine Cellar PWA

## Architecture
- Monorepo: `/app` (React PWA) + `/api` (Fastify API)
- Docker: postgres + cave-api + cave-app (+ pgadmin dev)
- DB: PostgreSQL 16 + Drizzle ORM
- Design: "Cave Noire" luxury dark theme, mobile-first

## Commands
- API dev: `cd api && npm run dev`
- App dev: `cd app && npm run dev`
- Docker: `docker-compose up -d`
- DB migrate: `cd api && npm run db:push`
- DB generate: `cd api && npm run db:generate`

## Stack
- Frontend: React 18, Vite, Tailwind v4, Zustand, Dexie.js, React Router v6, Lucide React, Recharts, Motion One
- Backend: Fastify, Drizzle ORM, PostgreSQL, chokidar, ws, zod
- Language: TypeScript throughout

## Conventions
- All slot codes displayed in JetBrains Mono
- Dark theme only — never white backgrounds
- Mobile-first, optimistic UI
- French locale for user-facing content
