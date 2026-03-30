FROM node:20-bookworm-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

RUN chmod +x docker-entrypoint.sh

EXPOSE 3001

# Entrypoint: sync schema → auto-seed if empty → start dev server
CMD ["./docker-entrypoint.sh"]
