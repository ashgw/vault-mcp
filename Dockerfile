  FROM oven/bun:1 AS builder

  WORKDIR /app
  
  COPY package*.json .
  COPY bun.lock .
  RUN bun install
  
  COPY src/ ./src
  RUN bun build ./src/index.ts --outfile=dist/index.js
  
  FROM oven/bun:1-slim AS release
  
  WORKDIR /app
  
  COPY --from=builder /app/dist ./dist
  COPY --from=builder /app/package.json .
  COPY --from=builder /app/bun.lock .
  
  RUN bun install --production
  
  ENV NODE_ENV=production
  ENV MCP_PORT=3000
  
  ENTRYPOINT ["bun", "dist/index.js"]
  