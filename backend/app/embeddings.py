import os
from functools import lru_cache
from sentence_transformers import SentenceTransformer


@lru_cache(maxsize=1)
def _model():
    return SentenceTransformer(os.environ["EMBEDDING_MODEL"])


def embed_passages(texts: list[str]):
    # e5 necesita estos prefijos para funcionar bien
    return _model().encode(
        [f"passage: {t}" for t in texts],
        normalize_embeddings=True,
        batch_size=16,
    )


def embed_query(text: str):
    return _model().encode(f"query: {text}", normalize_embeddings=True)
