FROM oven/bun:1

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN bun install --production

# Copy application source
COPY . .

ENV NODE_ENV=production

EXPOSE 3000

# Start the server (DB schema is managed separately)
CMD ["bun", "src/server.js"]
