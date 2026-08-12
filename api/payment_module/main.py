from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .database import engine

app = FastAPI(title="Payment Module API", version="0.1.0")


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    database = "connected"
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        database = "unavailable"
    return {"status": "ok", "database": database}


@app.get("/api")
def api_root() -> dict[str, str]:
    return {"name": "Payment Module API", "status": "ready"}
