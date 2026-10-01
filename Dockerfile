FROM node:22-slim

# FFmpeg native cho xu ly video
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npx", "tsx", "server.ts"]
