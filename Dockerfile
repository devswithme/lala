FROM oven/bun:1

WORKDIR /app

# Install dependencies (include dev for Prisma CLI)
COPY package.json ./
RUN bun install
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-liberation2 \
  && rm -rf /var/lib/apt/lists/*

# Copy application source
COPY . .

# Generate Prisma client at build time
RUN bunx prisma generate

ENV NODE_ENV=production

EXPOSE 3000

# Start the server (DB schema is managed separately)
CMD ["bun", "src/server.js"]
