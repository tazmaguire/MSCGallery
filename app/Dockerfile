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
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build /app/scripts ./scripts
COPY --from=deps /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=deps /app/node_modules/pg ./node_modules/pg
RUN mkdir -p /app/public/thumbs && chown -R app:app /app/public/thumbs
USER app
EXPOSE 3000
CMD ["node","server.js"]
