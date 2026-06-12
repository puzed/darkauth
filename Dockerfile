FROM node:24-alpine AS builder
WORKDIR /app
ARG APP_VERSION=""
ARG COMMIT_HASH=""
ENV APP_VERSION=$APP_VERSION
ENV COMMIT_HASH=$COMMIT_HASH
RUN apk add --no-cache python3 make g++ git
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN CI=true pnpm prune --prod

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libstdc++
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/package.json ./packages/api/package.json
COPY --from=builder /app/packages/api/src ./packages/api/src
COPY --from=builder /app/packages/api/drizzle ./packages/api/drizzle
COPY --from=builder /app/packages/user-ui/package.json ./packages/user-ui/package.json
COPY --from=builder /app/packages/user-ui/dist ./packages/user-ui/dist
COPY --from=builder /app/packages/admin-ui/package.json ./packages/admin-ui/package.json
COPY --from=builder /app/packages/admin-ui/dist ./packages/admin-ui/dist
COPY --from=builder /app/packages/opaque-ts ./packages/opaque-ts
EXPOSE 9080 9081
CMD ["node","packages/api/src/main.ts"]
