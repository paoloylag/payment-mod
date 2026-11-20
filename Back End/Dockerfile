FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/api \
    PORT=8002

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY api ./api
COPY migrations ./migrations
COPY alembic.ini ./

EXPOSE 8002
CMD ["sh", "-c", "alembic upgrade head && python -m payment_module.seed && uvicorn payment_module.main:app --app-dir api --host 0.0.0.0 --port ${PORT}"]
