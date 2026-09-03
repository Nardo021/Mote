FROM node:22-bookworm-slim AS dashboard

WORKDIR /dashboard

COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci

COPY dashboard/ ./
RUN npm run build \
  && test -f dist/index.html

FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY relay/package.json relay/package-lock.json ./
RUN npm ci

COPY relay/tsconfig.json ./
COPY relay/src ./src
RUN npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    MOTE_ENV=production \
    MOTE_HOST=0.0.0.0 \
    MOTE_PORT=3000 \
    MOTE_DATABASE_PATH=/data/mote.sqlite \
    MOTE_DASHBOARD_DIST=/app/dashboard \
    MOTE_LOG_LEVEL=info

RUN groupadd --system mote \
  && useradd --system --gid mote --home-dir /app --shell /usr/sbin/nologin mote \
  && mkdir -p /data \
  && chown mote:mote /data

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=dashboard /dashboard/dist ./dashboard

USER mote

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
