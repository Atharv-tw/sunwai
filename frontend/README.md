# Frontend

Sunwai’s role experience is a React + TypeScript application built with Vite. The app calls the existing FastAPI Incident API in Live mode. Demo mode uses fictional, browser-local incidents and is clearly labeled; it never sends mock actions to Meko.

## Develop

```bash
npm install
npm run dev
```

Start the Python backend separately with `uv run sunwai`. Vite proxies `/api` to `http://127.0.0.1:8765`.

## Build and serve

```bash
npm run build
uv run sunwai
```

Vite writes the production frontend to `web/`, which FastAPI already serves. The generated `web/` assets are committed so Render can deploy the frontend with its existing Python build and start commands; Node is not needed at app startup.

The live Meko swarm remains at `/swarm.html` and continues to read only the logged Meko call API.
