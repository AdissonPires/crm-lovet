# Lovet Distribuidora CRM — imagem de producao do app Next.js do monorepo.
#
#   docker build --build-arg APP=crm .
FROM node:20-alpine AS base

# ── deps ──────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
# Workspaces: o npm ci precisa do manifesto da raiz e de cada workspace.
# Ao criar um novo pacote, adicione o COPY dele aqui.
COPY package.json package-lock.json* ./
COPY apps/crm/package.json ./apps/crm/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/ai/package.json ./packages/ai/package.json
RUN npm ci

# ── build ─────────────────────────────────────────────────────────────────
FROM base AS builder
ARG APP=crm
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace @lovet/${APP}

# ── runtime ───────────────────────────────────────────────────────────────
FROM base AS runner
ARG APP=crm
ENV APP=${APP}
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 lovet

# O standalone de monorepo preserva a arvore: apps/<APP>/server.js na aplicacao
# e node_modules na raiz de /app.
COPY --from=builder --chown=lovet:nodejs /app/apps/${APP}/.next/standalone ./
COPY --from=builder --chown=lovet:nodejs /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=builder /app/apps/${APP}/public ./apps/${APP}/public

# Volume de anexos (midia de campanhas). O dono precisa estar certo ANTES do
# volume nomeado ser montado: Docker copia dono/permissao do diretorio da
# imagem para dentro de um volume nomeado vazio na primeira montagem.
RUN mkdir -p /data/attachments && chown lovet:nodejs /data/attachments

USER lovet
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# O server.js do standalone faz process.chdir para o proprio diretorio, entao
# caminhos relativos no codigo resolvem a partir de apps/<APP>.
CMD ["sh", "-c", "node apps/$APP/server.js"]
