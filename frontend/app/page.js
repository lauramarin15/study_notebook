"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [notebooks, setNotebooks] = useState([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const r = await fetch(`${API}/notebooks`);
      setNotebooks(await r.json());
    } catch {
      setError("No se pudo conectar con el backend (¿está corriendo?)");
    }
  }

  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch(`${API}/notebooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setTitle("");
    load();
  }

  return (
    <>
      <h1>StudyNotebook</h1>
      <p className="muted">Sube tu material y genera resúmenes y preguntas de parcial.</p>
      {error && <div className="error">{error}</div>}

      <form onSubmit={create} className="card row">
        <input
          type="text" placeholder="Nombre del cuaderno (ej. Parcial BI)"
          value={title} onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit">Crear</button>
      </form>

      {notebooks.map((n) => (
        <Link key={n.id} href={`/notebooks/${n.id}`}>
          <div className="card">
            <strong>{n.title}</strong>
            <div className="muted">{new Date(n.created_at).toLocaleDateString()}</div>
          </div>
        </Link>
      ))}
    </>
  );
}