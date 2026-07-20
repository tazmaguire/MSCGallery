FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app && apk add --no-cache su-exec
COPY --from=build /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build /app/scripts ./scripts
COPY --from=deps /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=deps /app/node_modules/pg ./node_modules/pg
RUN mkdir -p /app/public/thumbs && chown -R app:app /app/public/thumbs
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# Deliberately NOT `USER app` here — deploy/data/thumbs is bind-mounted over
# /app/public/thumbs at runtime and can arrive root-owned (see entrypoint
# comment). The entrypoint fixes ownership as root, then drops to `app`
# before exec'ing the real process; application code never runs as root.
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node","server.js"]
