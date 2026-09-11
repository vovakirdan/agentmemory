ARG NODE_IMAGE=docker.io/library/node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8
FROM docker.io/iiidev/iii:0.11.2@sha256:4d032e1df5d6a4dc2080a94dd11dd87411de5dccb46bd563b557de9ba3c20894 AS engine
FROM ${NODE_IMAGE} AS build
WORKDIR /opt/agentmemory
COPY package.json ./
COPY deploy/forge/package-lock.json ./package-lock.json
RUN npm ci --legacy-peer-deps --ignore-scripts --include=optional --no-audit --no-fund
COPY src ./src
COPY plugin ./plugin
COPY tsdown.config.ts tsconfig.json iii-config.yaml iii-config.docker.yaml docker-compose.yml .env.example ./
COPY deploy/forge ./deploy/forge
RUN npm run build
RUN node deploy/forge/fetch-model.mjs
RUN node --import ./deploy/forge/offline-model.mjs ./deploy/forge/check-model.mjs
RUN npm prune --omit=dev --legacy-peer-deps --ignore-scripts --include=optional --no-audit --no-fund

FROM ${NODE_IMAGE}
ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/vovakirdan/agentmemory" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
WORKDIR /opt/agentmemory
COPY --from=engine /app/iii /usr/local/bin/iii
COPY --from=build /opt/agentmemory/package.json ./package.json
COPY --from=build /opt/agentmemory/node_modules ./node_modules
COPY --from=build /opt/agentmemory/dist ./dist
COPY --from=build /opt/agentmemory/models ./models
COPY --from=build /opt/agentmemory/deploy/forge ./deploy/forge
RUN test -n "$SOURCE_REVISION" && mkdir /data && chown node:node /data \
    && chmod +x deploy/forge/entrypoint.sh
ENV AGENTMEMORY_DATA_DIR=/data \
    AGENTMEMORY_RUNTIME_DIR=/data \
    III_ENGINE_URL=ws://127.0.0.1:49134 \
    III_REST_PORT=3111 \
    EMBEDDING_PROVIDER=local \
    AUTO_FORGET_ENABLED=false \
    CONSOLIDATION_ENABLED=false \
    AGENTMEMORY_AUTO_COMPRESS=false \
    AGENTMEMORY_ALLOW_AGENT_SDK=false \
    AGENTMEMORY_REFLECT=false \
    AGENTMEMORY_INJECT_CONTEXT=false \
    LESSON_DECAY_ENABLED=false \
    INSIGHT_DECAY_ENABLED=false \
    GRAPH_EXTRACTION_ENABLED=false \
    SNAPSHOT_ENABLED=false \
    NODE_OPTIONS=--import=/opt/agentmemory/deploy/forge/offline-model.mjs
USER node
EXPOSE 3111
ENTRYPOINT ["/opt/agentmemory/deploy/forge/entrypoint.sh"]
