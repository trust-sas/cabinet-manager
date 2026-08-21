# ==============================================================================
# CABINET MANAGER — Dockerfile backend (NestJS API)
# Build multi-étapes : builder → runner
# ==============================================================================

# Étape 1 : build complet avec tous les outils de compilation
FROM node:22-alpine AS builder

WORKDIR /app

# Outils requis pour compiler les modules natifs (argon2, bcrypt, etc.)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Préparer les node_modules de production (compilés dans ce même environnement)
RUN npm prune --omit=dev

# ==============================================================================
# Étape 2 : image de production minimale
FROM node:22-alpine AS runner

WORKDIR /app

# Utilisateur non-root (sécurité)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

# Copier les node_modules déjà compilés depuis builder (inclut argon2 natif)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

USER nestjs

EXPOSE 3007

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3007/api/v1/health || exit 1

CMD ["node", "dist/main"]
