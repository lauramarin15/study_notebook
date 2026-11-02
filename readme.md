# StudyNotebook

Herramienta web local, parecida a NotebookLM, para preparar parciales. Subes tus archivos de estudio (PDF) y la aplicación genera:

- Un **resumen de estudio** del material.
- **Preguntas tipo parcial** (selección múltiple, verdadero/falso y abiertas) con su respuesta, explicación y la página del documento de donde salen.
- Un **modo práctica** para responder las preguntas y ver la solución.

Todo corre en tu computador con Docker. No requiere cuentas externas ni internet una vez descargados los modelos.

---

## Arquitectura

```
┌────────────┐     HTTP      ┌─────────────┐      SQL      ┌──────────────────────┐
│  Frontend  │ ────────────► │   Backend   │ ────────────► │ PostgreSQL+pgvector  │
│  Next.js   │  :3000→:8000  │   FastAPI   │               │  (texto + embeddings)│
└────────────┘               └──────┬──────┘               └──────────────────────┘
                                    │
                      ┌─────────────┴─────────────┐
                      ▼                           ▼
            sentence-transformers            Ollama (LLM)
            (embeddings, en el contenedor)   (en tu Mac/PC, fuera de Docker)
```

| Componente | Tecnología | Función |
|---|---|---|
| Frontend | Next.js 14 (React) | Interfaz: cuadernos, archivos, resumen, práctica |
| Backend | FastAPI (Python) | API, ingesta de PDFs, resumen y preguntas |
| Base de datos | PostgreSQL 16 + pgvector | Guarda documentos, fragmentos y vectores |
| Embeddings | `intfloat/multilingual-e5-small` | Convierte texto en vectores (384 dimensiones) |
| LLM | Ollama + `qwen2.5:7b` | Redacta resúmenes y preguntas |
| Orquestación | Docker Compose | Levanta todo con un comando |

### Cómo funciona (RAG)

1. **Ingesta:** el PDF se divide en fragmentos de ~250 palabras (con solapamiento de 40), se calcula el embedding de cada uno y se guarda en PostgreSQL.
2. **Resumen:** se resume el material por bloques y luego se combinan los resúmenes parciales en uno final (*map-reduce*).
3. **Preguntas:** a partir del resumen se extraen los temas principales; por cada tema se recuperan los fragmentos más similares (búsqueda vectorial) y el LLM redacta preguntas usando solo ese material.

---

## Requisitos

- **Docker Desktop** instalado y abierto — https://www.docker.com/products/docker-desktop
- **Ollama** instalado en tu máquina (no dentro de Docker) — https://ollama.com
- Unos **10 GB de disco libre** y, idealmente, **8 GB de RAM o más**
- Conexión a internet solo para la primera instalación (descarga de modelos e imágenes)

---

## Instalación y ejecución

### 1. Clonar el proyecto

```bash
git clone <URL-DEL-REPOSITORIO>
cd studynotebook
```

### 2. Descargar el modelo de lenguaje

```bash
ollama pull qwen2.5:7b
```

Comprueba que Ollama está activo:

```bash
curl http://localhost:11434
# Debe responder: Ollama is running
```

Si no responde, abre la aplicación de Ollama o ejecuta `ollama serve` en otra terminal.

### 3. Crear el archivo `.env`

En la raíz del proyecto, crea un archivo `.env` con este contenido:

```
EMBEDDING_MODEL=intfloat/multilingual-e5-small
LLM_PROVIDER=ollama
LLM_MODEL=qwen2.5:7b
OLLAMA_URL=http://host.docker.internal:11434
```

> **Alternativa con la API de Claude** (mejor calidad, requiere API key y tiene costo por uso):
> ```
> LLM_PROVIDER=anthropic
> ANTHROPIC_API_KEY=tu_api_key
> LLM_MODEL=claude-sonnet-4-6
> ```

### 4. Levantar la aplicación

```bash
docker compose up --build
```

La **primera vez tarda entre 10 y 20 minutos**, porque se descarga PyTorch y las imágenes de Docker. Las siguientes veces arranca en segundos.

En el primer uso, el backend también descarga el modelo de embeddings (~470 MB) la primera vez que procesa un PDF.

### 5. Abrir la aplicación

| Servicio | URL |
|---|---|
| Interfaz web | http://localhost:3000 |
| API y documentación interactiva | http://localhost:8000/docs |
| Estado del backend | http://localhost:8000/health |

`/health` debe responder: `{"status":"ok","tables":6,"pgvector":true}`

---

## Uso

1. Abre http://localhost:3000 y **crea un cuaderno** (por ejemplo, "Parcial BI").
2. Entra al cuaderno y, en la pestaña **Archivos**, sube uno o varios PDFs. Espera a que el estado pase a `ready`.
3. En **Resumen**, pulsa *Generar resumen*.
4. En **Práctica**, pulsa *Generar preguntas* y responde una por una.

> Con Ollama en un portátil, el resumen y las preguntas pueden tardar **varios minutos**. Es normal. Para comprobar que el modelo está trabajando: `ollama ps`.

---

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del backend y de la base de datos |
| POST | `/notebooks` | Crea un cuaderno (`{"title": "..."}`) |
| GET | `/notebooks` | Lista los cuadernos |
| POST | `/notebooks/{id}/documents` | Sube un PDF (inicia la ingesta en segundo plano) |
| GET | `/notebooks/{id}/documents` | Lista archivos y su estado |
| GET | `/notebooks/{id}/search?q=...&k=5` | Búsqueda semántica en el cuaderno |
| POST | `/notebooks/{id}/summary` | Genera el resumen |
| GET | `/notebooks/{id}/summary` | Devuelve el último resumen |
| POST | `/notebooks/{id}/questions?n_topics=6&per_topic=3` | Genera un set de preguntas |
| GET | `/notebooks/{id}/questions` | Devuelve el último set de preguntas |

Ejemplo:

```bash
curl -X POST http://localhost:8000/notebooks \
  -H "Content-Type: application/json" \
  -d '{"title": "Prueba"}'

curl -X POST http://localhost:8000/notebooks/<ID>/documents \
  -F "file=@/ruta/al/archivo.pdf"

curl -G http://localhost:8000/notebooks/<ID>/search \
  --data-urlencode "q=objetivo estratégico"
```

---

## Estructura del proyecto

```
studynotebook/
├── docker-compose.yml        # Servicios: db, backend, frontend
├── .env                      # Configuración (no se sube a git)
├── db/
│   └── init.sql              # Esquema de la base de datos
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py           # Endpoints de la API
│       ├── db.py             # Conexión a PostgreSQL
│       ├── embeddings.py     # Modelo de embeddings
│       ├── ingest.py         # Extracción, fragmentación e indexado
│       ├── llm.py            # Cliente del LLM (Ollama / Claude)
│       └── generate.py       # Resumen y generación de preguntas
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── app/                  # Páginas de Next.js
└── data/
    └── uploads/              # PDFs subidos (no se sube a git)
```

### Modelo de datos

`notebooks` → `documents` → `chunks` (texto + vector), y `notebooks` → `summaries`, `question_sets` → `questions`.

---

## Comandos útiles

```bash
docker compose up -d                  # Levantar en segundo plano
docker compose down                   # Detener
docker compose logs -f backend        # Ver logs del backend
docker compose up -d --build          # Reconstruir tras cambiar dependencias
docker compose up -d --force-recreate # Recrear contenedores (tras cambiar .env)
docker compose down -v                # Detener y BORRAR la base de datos
```

---

## Solución de problemas

| Problema | Causa y solución |
|---|---|
| `Could not resolve authentication method` | El backend usa el proveedor `anthropic` por defecto. Revisa `LLM_PROVIDER=ollama` en `.env` y ejecuta `docker compose up -d --force-recreate` |
| El backend no conecta con Ollama | Verifica que Ollama esté abierto y que `OLLAMA_URL=http://host.docker.internal:11434` |
| El `docker compose up` inicial es muy lento | Descarga PyTorch (~2 GB). Es normal la primera vez |
| Muy lento o se congela | Poca RAM. Cierra otras aplicaciones o usa un modelo más pequeño (`qwen2.5:3b`) |

---

## Limitaciones conocidas

- Solo acepta **PDFs con texto** (no escaneados).
- La calidad de las preguntas depende del modelo; un modelo de 7B puede generar errores. Cada pregunta cita su página para poder verificarla.
- La generación es **síncrona**: el navegador espera hasta que termina.
- La ingesta usa `BackgroundTasks` de FastAPI: si el contenedor se reinicia a mitad de un proceso, el archivo queda en `processing`.
- **No hay usuarios ni autenticación**: está pensado para uso local de una sola persona.