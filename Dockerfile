FROM node:22-bookworm-slim AS web-build

WORKDIR /app
COPY package.json pnpm-lock.yaml tsconfig.json vite.config.ts ./
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate && pnpm install --frozen-lockfile
COPY index.html ./
COPY src ./src
RUN pnpm build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8002

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY api ./api
COPY migrations ./migrations
COPY alembic.ini ./
COPY --from=web-build /app/dist ./dist

EXPOSE 8002
CMD ["sh", "-c", "uvicorn payment_module.main:app --app-dir api --host 0.0.0.0 --port ${PORT}"]
