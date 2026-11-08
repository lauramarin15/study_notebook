"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TABS = [
  ["files", "Archivos"],
  ["summary", "Resumen"],
  ["practice", "Práctica"],
];

const STATUS_LABEL = {
  pending: "En cola",
  processing: "Procesando",
  ready: "Listo",
  failed: "Falló",
};

const NO_BACKEND =
  "No se pudo conectar con el backend. Revisa que Docker esté corriendo (docker compose up) y vuelve a intentar.";

// Llama al backend. Si falla, lanza un Error con un mensaje legible (y .status si lo hay).
async function api(path, options) {
  let res;
  try {
    res = await fetch(`${API}${path}`, options);
  } catch {
    throw new Error(NO_BACKEND);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : "";
    } catch {}
    const err = new Error(detail || `El servidor respondió con el error ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });
}

// Cuenta el tiempo mientras algo se genera, para que la espera no parezca congelada.
function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const start = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [active]);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/* ═════════════════════════ Página del cuaderno ═════════════════════════ */

export default function NotebookPage({ params }) {
  const { id } = params;

  const [title, setTitle] = useState("Cuaderno");
  const [tab, setTab] = useState("files");
  const [docs, setDocs] = useState([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [summary, setSummary] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [questionsVersion, setQuestionsVersion] = useState(0);
  const [busy, setBusy] = useState(""); // "summary" | "questions" | ""
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const elapsed = useElapsed(Boolean(busy));

  const loadDocs = useCallback(async () => {
    try {
      setDocs(await api(`/notebooks/${id}/documents`));
    } catch (e) {
      setError(e.message);
    } finally {
      setDocsLoaded(true);
    }
  }, [id]);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api(`/notebooks/${id}/summary`));
    } catch (e) {
      if (e.status !== 404) setError(e.message);
    }
  }, [id]);

  const loadQuestions = useCallback(async () => {
    try {
      setQuestions(await api(`/notebooks/${id}/questions`));
      setQuestionsVersion((v) => v + 1);
    } catch (e) {
      if (e.status !== 404) setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    loadDocs();
    loadSummary();
    loadQuestions();
    // El backend no tiene un endpoint para un solo cuaderno, así que se busca en la lista.
    api("/notebooks")
      .then((list) => {
        const found = list.find((n) => n.id === id);
        if (found) setTitle(found.title);
      })
      .catch(() => {});
  }, [id, loadDocs, loadSummary, loadQuestions]);

  // Mientras haya archivos procesándose, refresca el estado cada 3 s
  useEffect(() => {
    if (!docs.some((d) => d.status === "pending" || d.status === "processing")) return;
    const t = setInterval(loadDocs, 3000);
    return () => clearInterval(t);
  }, [docs, loadDocs]);

  async function upload(files) {
    if (!files.length) return;
    setError("");
    setUploading(true);
    const failures = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        failures.push(`${file.name}: solo se aceptan archivos PDF.`);
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      try {
        await api(`/notebooks/${id}/documents`, { method: "POST", body: form });
      } catch (e) {
        failures.push(`${file.name}: ${e.message}`);
      }
    }
    setUploading(false);
    if (failures.length) setError(failures.join("\n"));
    await loadDocs();
  }

  async function generate(kind) {
    setBusy(kind);
    setError("");
    try {
      await api(`/notebooks/${id}/${kind}`, { method: "POST" });
      if (kind === "summary") await loadSummary();
      else await loadQuestions();
      setTab(kind === "summary" ? "summary" : "practice");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const ready = docs.some((d) => d.status === "ready");
  const processing = docs.some((d) => d.status === "pending" || d.status === "processing");
  const readyHint = ready
    ? ""
    : processing
    ? "Espera a que termine el procesamiento de tus PDFs."
    : "Sube al menos un PDF en la pestaña Archivos.";

  const counts = { files: docs.length || 0, practice: questions.length || 0 };

  return (
    <>
      <Link href="/" className="back">
        ← Mis cuadernos
      </Link>
      <h1 className="page-title">{title}</h1>

      <div className="tabs" role="tablist" aria-label="Secciones del cuaderno">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            className="tab"
            onClick={() => setTab(key)}
          >
            {label}
            {counts[key] > 0 && <small>{counts[key]}</small>}
          </button>
        ))}
      </div>

      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}

      {tab === "files" && (
        <div role="tabpanel" id="panel-files" aria-labelledby="tab-files">
          <label
            className={`drop${dragging ? " over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              upload(Array.from(e.dataTransfer.files));
            }}
          >
            <input
              className="sr"
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files);
                e.target.value = "";
                upload(files);
              }}
            />
            <strong>{uploading ? "Subiendo…" : "Arrastra tus PDFs aquí o haz clic para elegirlos"}</strong>
            <span>Solo PDFs con texto, no escaneados.</span>
          </label>

          {docs.length > 0 && (
            <ul className="docs">
              {docs.map((d) => (
                <li key={d.id} className="doc">
                  <span className="doc-name">{d.filename}</span>
                  <span className={`status ${d.status}`}>{STATUS_LABEL[d.status] ?? d.status}</span>
                  {d.error && <span className="doc-err">{d.error}</span>}
                </li>
              ))}
            </ul>
          )}

          {docsLoaded && docs.length === 0 && (
            <div className="empty">
              <h2>Este cuaderno aún no tiene archivos</h2>
              <p>Sube los PDFs de tu materia. Cuando aparezcan como Listo, podrás generar el resumen.</p>
            </div>
          )}
        </div>
      )}

      {tab === "summary" && (
        <div role="tabpanel" id="panel-summary" aria-labelledby="tab-summary">
          <div className="toolbar">
            <button
              type="button"
              className="btn"
              disabled={!ready || Boolean(busy)}
              onClick={() => generate("summary")}
            >
              {summary ? "Regenerar resumen" : "Generar resumen"}
            </button>
            {summary && !busy && <p className="toolbar-note">Generado el {formatDateTime(summary.created_at)}</p>}
          </div>

          {readyHint && !busy && <p className="hint">{readyHint}</p>}

          {busy === "summary" && (
            <div className="busy" role="status">
              <span className="spin" aria-hidden="true" />
              <div>
                <p>Generando el resumen… {elapsed}</p>
                <p className="hint">Con Ollama puede tardar varios minutos. Deja esta página abierta.</p>
              </div>
            </div>
          )}

          {summary && busy !== "summary" && (
            <div className="prose">
              <ReactMarkdown>{summary.content}</ReactMarkdown>
            </div>
          )}

          {!summary && !busy && ready && (
            <div className="empty">
              <h2>Todavía no hay resumen</h2>
              <p>Pulsa Generar resumen para condensar los PDFs del cuaderno en un solo texto de estudio.</p>
            </div>
          )}
        </div>
      )}

      {tab === "practice" && (
        <div role="tabpanel" id="panel-practice" aria-labelledby="tab-practice">
          <div className="toolbar">
            <button
              type="button"
              className="btn"
              disabled={!ready || Boolean(busy)}
              onClick={() => generate("questions")}
            >
              {questions.length ? "Generar nuevo set" : "Generar preguntas"}
            </button>
          </div>

          {readyHint && !busy && <p className="hint">{readyHint}</p>}

          {busy === "questions" && (
            <div className="busy" role="status">
              <span className="spin" aria-hidden="true" />
              <div>
                <p>Redactando las preguntas… {elapsed}</p>
                <p className="hint">Con Ollama puede tardar varios minutos. Deja esta página abierta.</p>
              </div>
            </div>
          )}

          {questions.length > 0 && busy !== "questions" && <Practice key={questionsVersion} questions={questions} />}

          {questions.length === 0 && !busy && ready && (
            <div className="empty">
              <h2>Todavía no hay preguntas</h2>
              <p>
                Pulsa Generar preguntas para crear un set de selección múltiple, verdadero o falso y preguntas abiertas.
                Cada una indica la página de donde sale.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ═════════════════════════ Modo práctica ═════════════════════════ */

const TYPE_LABEL = {
  multiple: "Selección múltiple",
  vf: "Verdadero o falso",
  abierta: "Pregunta abierta",
};
const LETTERS = ["A", "B", "C", "D", "E", "F"];

// Quita tildes y mayúsculas para comparar textos
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
// Además quita prefijos como "B)" y puntos finales
const clean = (s) => norm(s).replace(/^[a-f][).:-]\s*/, "").replace(/[.\s]+$/, "");

function getChoices(q) {
  if (q.type === "vf") return ["Verdadero", "Falso"];
  if (q.type === "multiple") {
    let options = q.options;
    if (typeof options === "string") {
      try {
        options = JSON.parse(options);
      } catch {
        options = [];
      }
    }
    return Array.isArray(options) ? options.map(String) : [];
  }
  return [];
}

// Índice de la opción correcta, o -1 si no se puede saber con certeza.
function correctIndex(q, choices) {
  if (!choices.length) return -1;

  if (q.type === "multiple") {
    const letter = norm(q.answer).match(/^([a-f])\s*[).:]?$/);
    if (letter) {
      const i = letter[1].charCodeAt(0) - 97;
      if (i < choices.length) return i;
    }
  }

  const answer = clean(q.answer);
  const exact = choices.findIndex((c) => clean(c) === answer);
  if (exact >= 0) return exact;

  // En verdadero/falso la respuesta viene como "Verdadero. Porque…"
  if (q.type === "vf") return choices.findIndex((c) => answer.startsWith(clean(c)));

  let best = -1;
  let bestLen = 0;
  choices.forEach((c, i) => {
    const n = clean(c);
    if (n && (answer.startsWith(n) || n.startsWith(answer)) && n.length > bestLen) {
      best = i;
      bestLen = n.length;
    }
  });
  return best;
}

function Practice({ questions }) {
  const items = useMemo(
    () =>
      questions.map((q) => {
        const choices = getChoices(q);
        return { q, choices, correct: correctIndex(q, choices) };
      }),
    [questions]
  );

  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({}); // índice de pregunta -> { picked, revealed, text }

  const item = items[i];
  const { q, choices } = item;
  const st = answers[i] ?? { picked: null, revealed: false, text: "" };
  const graded = choices.length > 0 && item.correct >= 0; // se puede corregir sola
  const hasOptions = choices.length > 0;

  const patch = (idx, p) => setAnswers((a) => ({ ...a, [idx]: { picked: null, revealed: false, text: "", ...a[idx], ...p } }));

  // "ok" | "fail" | null
  const verdictOf = (idx) => {
    const it = items[idx];
    const s = answers[idx];
    if (!s || it.choices.length === 0 || it.correct < 0 || s.picked === null) return null;
    return s.picked === it.correct ? "ok" : "fail";
  };

  const gradedTotal = items.filter((it) => it.choices.length > 0 && it.correct >= 0).length;
  const hits = items.filter((_, idx) => verdictOf(idx) === "ok").length;
  const allSeen = items.every((_, idx) => answers[idx]?.revealed);
  const verdict = verdictOf(i);

  return (
    <section aria-label="Modo práctica">
      <div className="quiz-top">
        <span>
          Pregunta {i + 1} de {items.length}
        </span>
        {gradedTotal > 0 && (
          <span>
            Aciertos: {hits} de {gradedTotal}
          </span>
        )}
      </div>

      <ol className="qnav" aria-label="Ir a una pregunta">
        {items.map((_, idx) => {
          const v = verdictOf(idx);
          const seen = !v && answers[idx]?.revealed;
          return (
            <li key={idx}>
              <button
                type="button"
                className={`qn${v ? ` ${v}` : seen ? " seen" : ""}`}
                aria-label={`Pregunta ${idx + 1}${v === "ok" ? ", correcta" : v === "fail" ? ", incorrecta" : ""}`}
                aria-current={idx === i ? "true" : undefined}
                onClick={() => setI(idx)}
              >
                {idx + 1}
              </button>
            </li>
          );
        })}
      </ol>

      <article className="q">
        <p className="q-kind">{TYPE_LABEL[q.type] ?? q.type}</p>
        <h3 className="q-text">{q.question}</h3>

        {hasOptions ? (
          <ul className="opts">
            {choices.map((choice, k) => {
              const picked = st.picked === k;
              const isCorrect = st.revealed && graded && item.correct === k;
              const isWrong = st.revealed && graded && picked && item.correct !== k;
              const key = q.type === "vf" ? choice[0] : LETTERS[k];
              return (
                <li key={`${i}-${k}`}>
                  <button
                    type="button"
                    className={`opt${picked ? " picked" : ""}${isCorrect ? " correct" : ""}${isWrong ? " wrong" : ""}`}
                    disabled={st.revealed}
                    aria-pressed={picked}
                    onClick={() => patch(i, { picked: k, revealed: true })}
                  >
                    <span className="opt-key" aria-hidden="true">
                      {key}
                    </span>
                    <span className="opt-text">
                      <span className="opt-label">{choice}</span>
                      {isCorrect &&<span className="opt-flag">Respuesta correcta</span>}
                      {isWrong && <span className="opt-flag">Tu respuesta</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div>
            <label className="field-label" htmlFor={`answer-${i}`}>
              Tu respuesta
            </label>
            <textarea
              id={`answer-${i}`}
              className="answer-field"
              value={st.text}
              readOnly={st.revealed}
              placeholder="Escríbela con tus palabras antes de ver la solución (opcional)."
              onChange={(e) => patch(i, { text: e.target.value })}
            />
            {!st.revealed && (
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={() => patch(i, { revealed: true })}>
                  Ver respuesta
                </button>
              </div>
            )}
          </div>
        )}

        {st.revealed && (
          <div className={`solution${verdict ? ` ${verdict}` : ""}`} aria-live="polite">
            <h3>{verdict === "ok" ? "Correcto" : verdict === "fail" ? "Incorrecto" : "Respuesta"}</h3>
            <p>{q.answer}</p>
            {q.explanation && <p>{q.explanation}</p>}
            {q.page && <p className="src">Fuente: página {q.page}</p>}
          </div>
        )}

        <div className="q-nav">
          <button type="button" className="btn plain" disabled={i === 0} onClick={() => setI(i - 1)}>
            ← Anterior
          </button>
          <button type="button" className="btn" disabled={i === items.length - 1} onClick={() => setI(i + 1)}>
            Siguiente →
          </button>
        </div>
      </article>

      {allSeen && (
        <div className="finish" role="status">
          <h3>Terminaste este set</h3>
          <p>
            {gradedTotal > 0
              ? `Acertaste ${hits} de ${gradedTotal} preguntas de opciones.`
              : "Revisaste todas las preguntas."}{" "}
            Puedes repetirlo o generar un set nuevo.
          </p>
          <button
            type="button"
            className="btn plain"
            onClick={() => {
              setAnswers({});
              setI(0);
            }}
          >
            Empezar de nuevo
          </button>
        </div>
      )}
    </section>
  );
}
