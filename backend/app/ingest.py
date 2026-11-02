import fitz  # pymupdf
from .db import get_conn
from .embeddings import embed_passages

CHUNK_WORDS = 250
OVERLAP = 40


def extract_pages(path: str) -> list[tuple[int, str]]:
    with fitz.open(path) as doc:
        return [(i + 1, page.get_text()) for i, page in enumerate(doc)]


def chunk_pages(pages) -> list[dict]:
    chunks = []
    step = CHUNK_WORDS - OVERLAP
    for page, text in pages:
        words = text.split()
        for i in range(0, len(words), step):
            piece = " ".join(words[i : i + CHUNK_WORDS])
            if len(piece) > 30:
                chunks.append({"content": piece, "page": page})
            if i + CHUNK_WORDS >= len(words):
                break
    return chunks


def _set_status(document_id, status, error=None):
    with get_conn() as conn:
        conn.execute(
            "update documents set status=%s, error=%s where id=%s",
            (status, error, document_id),
        )


def ingest_document(document_id: str, notebook_id: str, path: str):
    _set_status(document_id, "processing")
    try:
        chunks = chunk_pages(extract_pages(path))
        if not chunks:
            raise ValueError("No se pudo extraer texto (¿es un PDF escaneado?)")

        vectors = embed_passages([c["content"] for c in chunks])
        rows = [
            (document_id, notebook_id, c["content"], c["page"], v)
            for c, v in zip(chunks, vectors)
        ]
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.executemany(
                    "insert into chunks (document_id, notebook_id, content, page, embedding) "
                    "values (%s, %s, %s, %s, %s)",
                    rows,
                )
        _set_status(document_id, "ready")
    except Exception as e:
        _set_status(document_id, "failed", str(e))
