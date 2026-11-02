import os
import uuid
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from .db import get_conn
from .embeddings import embed_query
from .ingest import ingest_document
from .generate import summarize_notebook, generate_question_set

UPLOAD_DIR = "/data/uploads"
app = FastAPI(title="StudyNotebook")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.post("/notebooks/{notebook_id}/summary")
def make_summary(notebook_id: uuid.UUID):
    try:
        return {"summary": summarize_notebook(str(notebook_id))}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/notebooks/{notebook_id}/summary")
def get_summary(notebook_id: uuid.UUID):
    with get_conn() as conn:
        row = conn.execute(
            "select content, created_at from summaries where notebook_id=%s "
            "order by created_at desc limit 1",
            (notebook_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Aún no hay resumen")
    return row


@app.post("/notebooks/{notebook_id}/questions")
def make_questions(notebook_id: uuid.UUID, n_topics: int = 6, per_topic: int = 3):
    try:
        set_id = generate_question_set(str(notebook_id), n_topics, per_topic)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"question_set_id": set_id}


@app.get("/notebooks/{notebook_id}/questions")
def get_questions(notebook_id: uuid.UUID):
    with get_conn() as conn:
        qs = conn.execute(
            "select id from question_sets where notebook_id=%s "
            "order by created_at desc limit 1",
            (notebook_id,),
        ).fetchone()
        if not qs:
            raise HTTPException(404, "Aún no hay preguntas")
        return conn.execute(
            "select type, question, options, answer, explanation, page "
            "from questions where question_set_id=%s",
            (qs["id"],),
        ).fetchall()
