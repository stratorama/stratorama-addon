# BUILD_FROM is auto-injected per-arch by the HA add-on builder
# (e.g. ghcr.io/home-assistant/amd64-base:3.20). See build.yaml.
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.20

# ---------- Stage 1 : compile TypeScript ----------
FROM ${BUILD_FROM} AS builder

RUN apk add --no-cache nodejs npm

WORKDIR /build
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund --include=dev

COPY src ./src
RUN npx tsc

# ---------- Stage 2 : runtime ----------
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm

WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund --omit=dev

COPY --from=builder /build/dist ./dist
COPY run.sh ./
RUN chmod +x run.sh

CMD ["/app/run.sh"]
