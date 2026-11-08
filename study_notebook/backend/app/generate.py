from psycopg.types.json import Jsonb
from .db import get_conn
from .embeddings import embed_query
from .llm import ask, ask_json

BATCH_CHARS = 10000
VALID_TYPES = {"multiple", "vf", "abierta"}


def _all_chunks(notebook_id: str) -> list[dict]:
    with get_conn() as conn:
        return conn.execute(
            "select content, page from chunks where notebook_id=%s order by id",
            (notebook_id,),
        ).fetchall()


def _batches(chunks: list[dict]) -> list[str]:
    batches, current, size = [], [], 0
    for c in chunks:
        line = f"[p.{c['page']}] {c['content']}"
        if size + len(line) > BATCH_CHARS and current:
            batches.append("\n".join(current))
            current, size = [], 0
        current.append(line)
        size += len(line)
    if current:
        batches.append("\n".join(current))
    return batches


def summarize_notebook(notebook_id: str) -> str:
    chunks = _all_chunks(notebook_id)
    if not chunks:
        raise ValueError("El cuaderno no tiene contenido procesado todavía")

    partials = [
        ask(
            "Eres un tutor universitario. Resume en español con viñetas: conceptos "
            "clave, definiciones, fórmulas y ejemplos importantes. Usa solo el "
            "material dado y conserva las referencias de página [p.N].",
            batch,
            max_tokens=1500,
        )
        for batch in _batches(chunks)
    ]

    final = ask(
        "Combina estos resúmenes parciales en un único resumen de estudio para un "
        "parcial, en español y formato Markdown. Estructura: 1) Temas principales, "
        "2) Conceptos y definiciones clave, 3) Fórmulas o procesos, 4) Lo más "
        "probable que pregunten. No inventes contenido que no esté en los resúmenes.",
        "\n\n---\n\n".join(partials),
        max_tokens=4000,
    )

    with get_conn() as conn:
        conn.execute(
            "insert into summaries (notebook_id, content) values (%s, %s)",
            (notebook_id, final),
        )
    return final


def _get_or_make_summary(notebook_id: str) -> str:
    with get_conn() as conn:
        row = conn.execute(
            "select content from summaries where notebook_id=%s "
            "order by created_at desc limit 1",
            (notebook_id,),
        ).fetchone()
    return row["content"] if row else summarize_notebook(notebook_id)


def generate_question_set(notebook_id: str, n_topics: int = 6, per_topic: int = 3):
    summary = _get_or_make_summary(notebook_id)

    topics = ask_json(
        "Eres un profesor que prepara un parcial.",
        f"Del siguiente resumen, lista los {n_topics} temas más evaluables como un "
        f'arreglo JSON de strings cortos. Ejemplo: ["tema 1", "tema 2"].\n\n{summary}',
        max_tokens=500,
    )[:n_topics]

    questions = []
    for topic in topics:
        qvec = embed_query(str(topic))
        with get_conn() as conn:
            ctx = conn.execute(
                "select content, page from chunks where notebook_id=%s "
                "order by embedding <=> %s limit 6",
                (notebook_id, qvec),
            ).fetchall()
        context = "\n\n".join(f"[p.{c['page']}] {c['content']}" for c in ctx)

        generated = ask_json(
            "Eres un profesor universitario que redacta preguntas de parcial claras "
            "y no ambiguas. Usa ÚNICAMENTE el material proporcionado.",
            f"""Tema: {topic}

Genera {per_topic} preguntas de parcial sobre este tema, mezclando tipos.
Cada elemento del arreglo JSON debe tener:
- "tipo": "multiple" | "vf" | "abierta"
- "pregunta": texto
- "opciones": arreglo de 4 strings si es "multiple"; null en los otros tipos
- "respuesta": respuesta correcta (en "multiple", el texto de la opción correcta;
  en "vf", "Verdadero" o "Falso" con una breve justificación)
- "explicacion": por qué es correcta
- "pagina": número entero de la página de donde sale

Material:
{context}""",
        )

        for q in generated:
            if (
                q.get("tipo") in VALID_TYPES
                and q.get("pregunta")
                and q.get("respuesta")
            ):
                questions.append(q)

    if not questions:
        raise ValueError("No se pudieron generar preguntas")

    with get_conn() as conn:
        set_id = conn.execute(
            "insert into question_sets (notebook_id) values (%s) returning id",
            (notebook_id,),
        ).fetchone()["id"]
        for q in questions:
            conn.execute(
                "insert into questions (question_set_id, type, question, options, "
                "answer, explanation, page) values (%s,%s,%s,%s,%s,%s,%s)",
                (
                    set_id,
                    q["tipo"],
                    q["pregunta"],
                    Jsonb(q["opciones"]) if q.get("opciones") else None,
                    q["respuesta"],
                    q.get("explicacion"),
                    q.get("pagina") if isinstance(q.get("pagina"), int) else None,
                ),
            )
    return set_id
