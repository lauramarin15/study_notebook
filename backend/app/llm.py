import os
import json
import httpx

PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")
MODEL = os.getenv("LLM_MODEL", "claude-sonnet-4-6")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434")


def ask(system: str, user: str, max_tokens: int = 2000) -> str:
    if PROVIDER == "anthropic":
        import anthropic

        client = anthropic.Anthropic()  # lee ANTHROPIC_API_KEY del entorno
        r = client.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return r.content[0].text

    r = httpx.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": MODEL,
            "stream": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
        timeout=600,
    )
    r.raise_for_status()
    return r.json()["message"]["content"]


def ask_json(system: str, user: str, max_tokens: int = 3000):
    system = (
        system + "\nResponde SOLO con JSON válido, sin texto adicional ni backticks."
    )
    for _ in range(2):  # un reintento si el JSON viene roto
        raw = ask(system, user, max_tokens)
        start = min((i for i in (raw.find("["), raw.find("{")) if i != -1), default=-1)
        end = max(raw.rfind("]"), raw.rfind("}"))
        if start != -1 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError("El modelo no devolvió JSON válido")
