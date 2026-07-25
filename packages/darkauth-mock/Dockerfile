FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false
LABEL org.opencontainers.image.source="https://github.com/puzed/darkauth"

RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/darkauth-mock/package.json packages/darkauth-mock/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --filter @DarkAuth/mock --prod

COPY packages/darkauth-mock/src packages/darkauth-mock/src
RUN mkdir /data && chown node:node /data

USER node
EXPOSE 3020
VOLUME ["/data"]

CMD ["node", "packages/darkauth-mock/src/main.ts"]
