# Build stage
FROM oven/bun:1.2-debian AS build

WORKDIR /app

# Copy dependencies
COPY bun.lock package.json ./

# Build dependencies
RUN bun install --frozen-lockfile --production --verbose

# Copy source and compile
COPY . .

# RUN bun build
RUN bun build --compile --minify --sourcemap ./src/server.js --outfile lala-app

# Our application runner
FROM gcr.io/distroless/base-debian12:nonroot AS runner

ENV NODE_ENV=production

ARG BUILD_APP_PORT=3002
ENV PORT=${BUILD_APP_PORT}
EXPOSE ${APP_PORT}

WORKDIR /app

# Copy the compiled executable from the build stage
COPY --from=build /app/lala-app .

ENTRYPOINT ["./lala-app"]