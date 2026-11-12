"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./components/Icon";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Colores del lomo de cada cuaderno. Se elige uno según el nombre, así siempre es el mismo.
const SPINES = ["#1d6b52", "#2f5d8a", "#7a4e8c", "#b07d1f", "#a93a32", "#4b5563"];

function spineFor(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPINES[h % SPINES.length];
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

export default function Home() {
  const [notebooks, setNotebooks] = useState(null); // null mientras carga
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/notebooks`);
      if (!r.ok) throw new Error();
      setNotebooks(await r.json());
      setError("");
    } catch {
      setError("No se pudo conectar con el backend. Revisa que Docker esté corriendo (docker compose up) y vuelve a intentar.");
      setNotebooks((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    const name = title.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/notebooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name }),
      });
      if (!r.ok) throw new Error();
      setTitle("");
      await load();
    } catch {
      setError("No se pudo crear el cuaderno. Vuelve a intentarlo.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TU BIBLIOTECA PERSONAL</p>
          <h1 className="page-title">Mis cuadernos</h1>
          <p className="lede">Un espacio para cada materia. Todo listo para tu próxima sesión de estudio.</p>
        </div>
        <span className="library-badge"><Icon name="book" /> Aprende a tu ritmo</span>
      </div>

      <section className="study-banner" aria-labelledby="banner-title">
        <div className="banner-copy">
          <p className="banner-kicker"><Icon name="sparkles" /> MENOS RUIDO, MÁS ENFOQUE</p>
          <h2 id="banner-title">Dale orden a tus ideas.</h2>
          <p className="banner-description">Convierte tus PDFs en resúmenes y preguntas de práctica. Entiende, conecta y prepárate para lo que viene.</p>
          <div className="banner-steps">
            <span><b>1</b> Sube tus PDFs</span>
            <span><b>2</b> Repasa lo esencial</span>
            <span><b>3</b> Ponte a prueba</span>
          </div>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="paper paper-back" />
          <div className="paper paper-front">
            <span className="paper-label">STUDY / NOTEBOOK</span>
            <span className="paper-title">Una idea<br />a la vez.</span>
            <span className="paper-line" />
          </div>
          <Icon name="sparkles" className="art-spark one" />
          <Icon name="sparkles" className="art-spark two" />
          <span className="art-caption">El conocimiento se construye.</span>
        </div>
      </section>

      <form onSubmit={create} className="create">
        <div className="create-heading">
          <span className="create-symbol"><Icon name="plus" /></span>
          <div>
            <label htmlFor="notebook-name">Crea tu próximo cuaderno</label>
            <p>Una materia, un nuevo comienzo.</p>
          </div>
        </div>
        <input
          id="notebook-name"
          className="input"
          type="text"
          aria-label="Nombre del cuaderno"
          placeholder="Ej. Biología celular"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!title.trim() || creating}>
          <Icon name="plus" />
          {creating ? "Creando…" : "Crear cuaderno"}
        </button>
      </form>

      {error && (
        <div className="notice" role="alert">
          {error}
          <div>
            <button type="button" className="btn plain" onClick={load}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {notebooks && notebooks.length > 0 && (
        <section aria-labelledby="shelf-title">
          <div className="shelf-heading">
            <h2 id="shelf-title">Tus cuadernos</h2>
            <span className="shelf-count">{notebooks.length}</span>
            <span className="shelf-caption">Cada materia, en su lugar</span>
          </div>
          <ul className="shelf">
            {notebooks.map((n) => (
              <li key={n.id}>
                <Link href={`/notebooks/${n.id}`} className="book" style={{ "--spine": spineFor(n.title) }}>
                  <span className="book-top">
                    <span className="book-icon"><Icon name="book" /></span>
                    <Icon name="arrowRight" />
                  </span>
                  <span className="book-title">{n.title}</span>
                  <span className="book-date">Creado el {formatDate(n.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {notebooks && notebooks.length === 0 && !error && (
        <div className="empty">
          <Icon name="library" />
          <h2>Aún no tienes cuadernos</h2>
          <p>Escribe un nombre arriba y pulsa Crear cuaderno. Después podrás subir tus PDFs.</p>
        </div>
      )}
    </>
  );
}
