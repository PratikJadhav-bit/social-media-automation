FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm install-scripts approve better-sqlite3 esbuild
COPY . .
RUN npm run build
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATABASE_PATH=/app/data/autopilot.sqlite MEDIA_DIR=/app/data/media
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv fonts-noto-core && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/vendor ./vendor
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/requirements.txt ./
RUN python3 -m venv /opt/media && /opt/media/bin/pip install --no-cache-dir -r requirements.txt
ENV PATH="/opt/media/bin:$PATH"
RUN mkdir -p data && chown -R node:node /app /opt/media
USER node
EXPOSE 3000
CMD ["npm","start"]
