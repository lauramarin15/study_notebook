"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

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
      <h1 className="page-title">Mis cuadernos</h1>
      <p className="lede">Un cuaderno por materia: sube los PDFs y genera el resumen y las preguntas de parcial.</p>

      <form onSubmit={create} className="create">
        <input
          className="input"
          type="text"
          aria-label="Nombre del cuaderno"
          placeholder="Nombre del cuaderno (ej. Parcial BI)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!title.trim() || creating}>
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
        <ul className="shelf">
          {notebooks.map((n) => (
            <li key={n.id}>
              <Link href={`/notebooks/${n.id}`} className="book" style={{ "--spine": spineFor(n.title) }}>
                <span className="book-title">{n.title}</span>
                <span className="book-date">Creado el {formatDate(n.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {notebooks && notebooks.length === 0 && !error && (
        <div className="empty">
          <h2>Aún no tienes cuadernos</h2>
          <p>Escribe un nombre arriba y pulsa Crear cuaderno. Después podrás subir tus PDFs.</p>
        </div>
      )}
    </>
  );
}
