# Upwell

[![Netlify Status](https://api.netlify.com/api/v1/badges/f4b2cf82-77a4-478e-be46-07557df4d669/deploy-status)](https://vigilant-dijkstra-055cb3.netlify.app)

This repository consists of multiple directories:

- `app`: The example application for non-fiction professional text editing
- `api`: The backend api that wraps the underlying logic for the upwell collaboration engine
- `docs`: Documentation for developer api
- `server`: Reference implementation for compatible remote server


## Get started

1. Follow `README.md` in `api`
2. `cd app`
3. `npm install`

## Rebuilding `api`

Every time the api changes, it needs to be rebuilt using `npm run build`

## Deploying to Netlify

The app is a static React build deployed to Netlify. A `netlify.toml` in the
repo root configures the build automatically (base directory, build command,
Node 18, and SPA routing fallback).

### Deploy via Netlify UI (Git integration)

1. Push your repository to GitHub/GitLab/Bitbucket
2. Log in to [Netlify](https://app.netlify.com) and click **"Add new site" → "Import an existing project"**
3. Connect your repository — Netlify will detect `netlify.toml` automatically
4. Click **Deploy site**

Netlify will redeploy on every push to your default branch.

### Deploy via CLI

```bash
npm install -g netlify-cli

# Build the API first, then the app
cd api && npm install && npm run build && cd ..
cd app && npm install && npm run build && cd ..

# Deploy
netlify deploy --dir=app/build          # Preview deploy
netlify deploy --dir=app/build --prod   # Production deploy
```

### Environment variables

If your app connects to a sync server, set the server URL in the Netlify UI
under **Site settings → Environment variables**:

| Variable | Example | Description |
|---|---|---|
| `REACT_APP_SYNC_SERVER` | `wss://your-server.fly.dev` | WebSocket sync server URL |

### Node version

The build requires **Node >= 18** (esbuild dependency). This is set in
`netlify.toml` via `NODE_VERSION = "18"`. The `.nvmrc` at the repo root
still references Node 16 for historical reasons.

