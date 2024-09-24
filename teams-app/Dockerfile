FROM node:18 AS builder
WORKDIR /opt

ENV HOME="/opt"
ENV NODE_ENV=production

COPY app/ app/
COPY teams-app/ teams-app/
COPY deployment/docker/yarnrc.yml ~/.yarnrc.yml

RUN cd app/ && yarn install --silent && cd - \
    && cd teams-app/ && yarn install --silent --immutable && yarn build \
    && DEPS_TO_REMOVE="\
    @esbuild \
    @jest \
    @eslint \
    @testing-library \
    @vitejs \
    @vitest \
    @types \
    nodemon \
    vite-node \
    vitest \
    tsconfig-paths \
    esbuild" \
    && for dir in $DEPS_TO_REMOVE; do \
        rm -rf /opt/teams-app/node_modules/$dir /opt/teams-app/packages/app/node_modules/$dir; \
    done


FROM node:18-slim AS runner
WORKDIR /app

# overridden during build process
ARG FIFTYONE_APP_SEGMENT_WRITE_KEY
ENV HOME=/app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
ENV FIFTYONE_APP_SEGMENT_WRITE_KEY=${FIFTYONE_APP_SEGMENT_WRITE_KEY}

RUN apt-get -qq -y update && apt-get -qq -y upgrade \
    && apt clean && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 voxel51 \
    && useradd -u 1001 -g 1001 -l -m -d /app voxel51 \
    && mkdir -p /app/packages/app/.next \
    && chown --silent --no-dereference --recursive voxel51:voxel51 /app

COPY --from=builder /opt/teams-app/packages/app/next.config.js /opt/app/packages/app/package.json /app/packages/app
COPY --from=builder /opt/teams-app/packages/app/public /app/packages/app/public
COPY --from=builder /opt/teams-app/package.json /app

COPY --from=builder --chown=voxel51:voxel51 /opt/teams-app/packages/app/.next/standalone /app/packages/app
COPY --from=builder --chown=voxel51:voxel51 /opt/teams-app/packages/app/.next/static /app/packages/app/.next/static
COPY --from=builder --chown=voxel51:voxel51 /opt/teams-app/node_modules /app/packages/app/node_modules
COPY --from=builder --chown=voxel51:voxel51 /opt/teams-app/packages/app/node_modules /app/packages/app/node_modules

USER 1001:1001

EXPOSE 3000

CMD ["node", "/app/packages/app/server.js"]
