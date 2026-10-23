# BUILD_FROM is auto-injected per-arch by the HA add-on builder
# (e.g. ghcr.io/home-assistant/amd64-base:3.24). See build.yaml.
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.24

# Node comes from the official image, pinned to the release, never from `apk add nodejs`:
# Alpine's package lags Node's security releases by weeks and cannot be pinned (each branch
# keeps only its latest build), and the base it came from here, 3.20, was frozen on an EOL
# Node 20. Its Alpine branch must be the base's, since the binary links against that
# branch's musl and libstdc++; Dockerfile.standalone pins the same image (test/images.test.ts).
ARG NODE_IMAGE=node:22.23.4-alpine3.24

# ---------- Stage 1 : compile TypeScript, keep the production dependencies ----------
FROM ${NODE_IMAGE} AS builder

WORKDIR /build
# The lockfile travels with package.json and `npm ci` installs exactly what it
# pins. `npm install` from package.json alone let `ws ^8.x` float per build, so
# two builds of the same commit could ship two different dependency trees.
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --no-audit --no-fund --include=dev

COPY src ./src
RUN npx tsc \
 && npm prune --omit=dev --no-audit --no-fund

# ---------- Stage 2 : runtime ----------
# The HA base, for bashio and s6 (run.sh). Only the node binary is copied in: npm stays in
# the builder, since nothing runs it once the dependencies are installed.
FROM ${BUILD_FROM}

RUN apk add --no-cache libstdc++
COPY --from=builder /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
COPY run.sh ./
RUN chmod +x run.sh

CMD ["/app/run.sh"]
