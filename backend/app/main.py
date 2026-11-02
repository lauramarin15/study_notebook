import os
import uuid
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from pydantic import BaseModel

from .db import get_conn
from .embeddings import embed_query
from .ingest import ingest_document

UPLOAD_DIR = "/data/uploads"
app = FastAPI(title="StudyNotebook")


class NotebookIn(BaseModel):
    title: str


@app.get("/health")
def health():
    with get_conn() as conn:
        tables = conn.execute(
            "select count(*) as n from information_schema.tables where table_schema='public'"
        ).fetchone()["n"]
        vector = conn.execute(
            "select count(*) as n from pg_extension where extname='vector'"
        ).fetchone()["n"]
    return {"status": "ok", "tables": tables, "pgvector": bool(vector)}


@app.post("/notebooks")
def create_notebook(body: NotebookIn):
    with get_conn() as conn:
        return conn.execute(
            "insert into notebooks (title) values (%s) returning id, title",
            (body.title,),
        ).fetchone()


@app.get("/notebooks")
def list_notebooks():
    with get_conn() as conn:
        return conn.execute(
            "select id, title, created_at from notebooks order by created_at desc"
        ).fetchall()


@app.post("/notebooks/{notebook_id}/documents")
def upload_document(
    notebook_id: uuid.UUID,
    background: BackgroundTasks,
    file: UploadFile = File(...),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Por ahora solo se aceptan PDFs")

    with get_conn() as conn:
        exists = conn.execute(
            "select 1 from notebooks where id=%s", (notebook_id,)
        ).fetchone()
    if not exists:
        raise HTTPException(404, "Cuaderno no encontrado")

    doc_id = uuid.uuid4()
    folder = os.path.join(UPLOAD_DIR, str(doc_id))
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, os.path.basename(file.filename))
    with open(path, "wb") as f:
        f.write(file.file.read())

    with get_conn() as conn:
        conn.execute(
            "insert into documents (id, notebook_id, filename, file_path) "
            "values (%s, %s, %s, %s)",
            (doc_id, notebook_id, file.filename, path),
        )

    background.add_task(ingest_document, str(doc_id), str(notebook_id), path)
    return {"id": doc_id, "filename": file.filename, "status": "pending"}


@app.get("/notebooks/{notebook_id}/documents")
def list_documents(notebook_id: uuid.UUID):
    with get_conn() as conn:
        return conn.execute(
            "select id, filename, status, error, created_at from documents "
            "where notebook_id=%s order by created_at",
            (notebook_id,),
        ).fetchall()


@app.get("/notebooks/{notebook_id}/search")
def search(notebook_id: uuid.UUID, q: str, k: int = 5):
    qvec = embed_query(q)
    with get_conn() as conn:
        return conn.execute(
            "select content, page, 1 - (embedding <=> %s) as similarity "
            "from chunks where notebook_id=%s "
            "order by embedding <=> %s limit %s",
            (qvec, notebook_id, qvec, k),
        ).fetchall()
