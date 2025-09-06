FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ git
COPY package.json package-lock.json ./
COPY packages ./packages
COPY changelog ./changelog
RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libstdc++ && npm install -g pm2@5
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/drizzle ./packages/api/dist/drizzle
COPY --from=builder /app/packages/user-ui/dist ./packages/user-ui/dist
COPY --from=builder /app/packages/admin-ui/dist ./packages/admin-ui/dist
COPY --from=builder /app/packages/opaque-ts ./packages/opaque-ts
EXPOSE 9080 9081
CMD ["pm2-runtime","packages/api/dist/src/main.js","--name","darkauth"]
