"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function NotebookPage({ params }) {
  const { id } = params;
  const [tab, setTab] = useState("files");
  const [docs, setDocs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadDocs = useCallback(async () => {
    const r = await fetch(`${API}/notebooks/${id}/documents`);
    if (r.ok) setDocs(await r.json());
  }, [id]);

  const loadSummary = useCallback(async () => {
    const r = await fetch(`${API}/notebooks/${id}/summary`);
    if (r.ok) setSummary(await r.json());
  }, [id]);

  const loadQuestions = useCallback(async () => {
    const r = await fetch(`${API}/notebooks/${id}/questions`);
    if (r.ok) setQuestions(await r.json());
  }, [id]);

  useEffect(() => {
    loadDocs(); loadSummary(); loadQuestions();
  }, [loadDocs, loadSummary, loadQuestions]);

  // Mientras haya archivos procesándose, refresca el estado cada 3 s
  useEffect(() => {
    if (!docs.some((d) => ["pending", "processing"].includes(d.status))) return;
    const t = setInterval(loadDocs, 3000);
    return () => clearInterval(t);
  }, [docs, loadDocs]);

  async function upload(e) {
    const files = Array.from(e.target.files);
    e.target.value = "";
    setError("");
    for (const f of files) {
      const form = new FormData();
      form.append("file", f);
      const r = await fetch(`${API}/notebooks/${id}/documents`, { method: "POST", body: form });
      if (!r.ok) setError((await r.json()).detail || "Error al subir");
    }
    loadDocs();
  }

  async function generate(kind) {
    setBusy(kind); setError("");
    try {
      const r = await fetch(`${API}/notebooks/${id}/${kind}`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).detail || "Error al generar");
      await (kind === "summary" ? loadSummary() : loadQuestions());
      setTab(kind === "summary" ? "summary" : "practice");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const ready = docs.some((d) => d.status === "ready");

  return (
    <>
      <Link href="/">← Cuadernos</Link>
      <h1>Cuaderno</h1>

      <div className="tabs">
        {[["files", "Archivos"], ["summary", "Resumen"], ["practice", "Práctica"]].map(([k, label]) => (
          <button key={k} className={tab === k ? "active" : "ghost"} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {tab === "files" && (
        <>
          <div className="card">
            <input type="file" accept=".pdf" multiple onChange={upload} />
          </div>
          {docs.map((d) => (
            <div key={d.id} className="card row" style={{ justifyContent: "space-between" }}>
              <span>{d.filename}</span>
              <span className="badge">{d.status}</span>
              {d.error && <div className="muted">{d.error}</div>}
            </div>
          ))}
        </>
      )}

      {tab === "summary" && (
        <>
          <div className="row">
            <button disabled={!ready || busy} onClick={() => generate("summary")}>
              {busy === "summary" ? "Generando… (puede tardar varios minutos)" : summary ? "Regenerar resumen" : "Generar resumen"}
            </button>
          </div>
          {summary && (
            <div className="card"><ReactMarkdown>{summary.content}</ReactMarkdown></div>
          )}
          {!summary && <p className="muted">Aún no hay resumen. Sube un PDF y genera uno.</p>}
        </>
      )}

      {tab === "practice" && (
        <>
          <div className="row">
            <button disabled={!ready || busy} onClick={() => generate("questions")}>
              {busy === "questions" ? "Generando… (puede tardar varios minutos)" : questions.length ? "Generar nuevo set" : "Generar preguntas"}
            </button>
          </div>
          {questions.length > 0 ? <Practice questions={questions} /> : <p className="muted">Aún no hay preguntas.</p>}
        </>
      )}
    </>
  );
}

function Practice({ questions }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [shown, setShown] = useState(false);
  const q = questions[i];

  const norm = (s) => String(s || "").trim().toLowerCase();
  const isRight = (opt) => norm(q.answer).startsWith(norm(opt)) || norm(opt) === norm(q.answer);

  function next(step) {
    setI((i + step + questions.length) % questions.length);
    setPicked(null); setShown(false);
  }

  const choices = q.type === "vf" ? ["Verdadero", "Falso"] : q.options || [];

  return (
    <div className="card">
      <div className="muted">
        Pregunta {i + 1} de {questions.length} · <span className="badge">{q.type}</span>
      </div>
      <h3>{q.question}</h3>

      {q.type !== "abierta" && choices.map((opt) => {
        let cls = "opt";
        if (shown) cls += isRight(opt) ? " right" : opt === picked ? " wrong" : "";
        return (
          <button
            key={opt} className={cls} disabled={shown}
            onClick={() => { setPicked(opt); setShown(true); }}
          >
            {opt}
          </button>
        );
      })}

      {q.type === "abierta" && !shown && (
        <>
          <textarea rows={3} placeholder="Escribe tu respuesta (opcional)…" />
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setShown(true)}>Ver respuesta</button>
          </div>
        </>
      )}

      {shown && (
        <div style={{ marginTop: 12 }}>
          <strong>Respuesta:</strong> {q.answer}
          {q.explanation && <p>{q.explanation}</p>}
          {q.page && <div className="muted">Fuente: página {q.page}</div>}
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="ghost" onClick={() => next(-1)}>← Anterior</button>
        <button onClick={() => next(1)}>Siguiente →</button>
      </div>
    </div>
  );
}