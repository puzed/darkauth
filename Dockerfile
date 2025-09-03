FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ git
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci
RUN npm run build:admin && npm run build:ui && npm run build:api
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libstdc++
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/user-ui/dist ./packages/user-ui/dist
COPY --from=builder /app/packages/admin-ui/dist ./packages/admin-ui/dist
COPY packages/opaque-ts ./packages/opaque-ts
COPY config.yaml ./
EXPOSE 9080 9081
CMD ["node","packages/api/dist/main.js"]
