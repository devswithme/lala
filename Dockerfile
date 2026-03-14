FROM oven/bun:1

WORKDIR /app

# Install dependencies using lockfile for reproducible builds
COPY bun.lock package.json ./
RUN bun install --frozen-lockfile

# Copy application source
COPY . .

ENV NODE_ENV=production

EXPOSE 3000

# Run database migrations then start the server
CMD ["sh", "-c", "bunx prisma migrate deploy && bun src/server.js"]
