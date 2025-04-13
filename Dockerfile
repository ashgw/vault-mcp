FROM oven/bun:1

WORKDIR /app

COPY bun.lock package.json ./
RUN bun install

COPY src/ ./src

ENV NODE_ENV=production
ENV MCP_PORT=3000

CMD ["bun", "src/index.ts"]
