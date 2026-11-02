import os
import psycopg
from fastapi import FastAPI

app = FastAPI(title="StudyNotebook")


@app.get("/health")
def health():
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        tables = conn.execute(
            "select count(*) from information_schema.tables where table_schema='public'"
        ).fetchone()[0]
        vector = conn.execute(
            "select count(*) from pg_extension where extname='vector'"
        ).fetchone()[0]
    return {"status": "ok", "tables": tables, "pgvector": bool(vector)}
