# multi-stage build for Next.js + custom server
FROM node:18-alpine AS builder
WORKDIR /app

ENV NODE_ENV=production

# install deps
COPY package*.json ./
RUN npm ci --silent

# copy source and build
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# copy node_modules and build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/components ./components
COPY --from=builder /app/pages ./pages
COPY --from=builder /app/styles ./styles

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
