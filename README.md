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

The app is a static React build that can be deployed to Netlify.

### Option 1: Deploy via Netlify UI (Git integration)

1. Push your repository to GitHub/GitLab/Bitbucket
2. Log in to [Netlify](https://app.netlify.com) and click **"Add new site" → "Import an existing project"**
3. Connect your repository
4. Configure the build settings:
   - **Base directory**: `app`
   - **Build command**: `npm run build:api && npm run build`
   - **Publish directory**: `app/build`
   - **Node version**: Set the environment variable `NODE_VERSION` to `16` (or add an `.nvmrc` in the app directory)
5. Click **Deploy site**

Netlify will automatically redeploy on every push to your default branch.

### Option 2: Deploy via CLI

Install the Netlify CLI and deploy manually:

```bash
npm install -g netlify-cli

# Build the API first, then the app
cd api && npm install && npm run build && cd ..
cd app && npm install && npm run build && cd ..

# Deploy
netlify deploy --dir=app/build          # Preview deploy
netlify deploy --dir=app/build --prod   # Production deploy
```

### Option 3: Add a `netlify.toml`

Create a `netlify.toml` in the repository root for repeatable config:

```toml
[build]
  base = "app"
  command = "npm run build:api && npm run build"
  publish = "build"

[build.environment]
  NODE_VERSION = "16"

# SPA fallback: serve index.html for all routes
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Environment variables

If your app connects to a sync server, set the server URL in the Netlify UI
under **Site settings → Environment variables**:

| Variable | Example | Description |
|---|---|---|
| `REACT_APP_SYNC_SERVER` | `wss://your-server.fly.dev` | WebSocket sync server URL |

### SPA routing

The app uses client-side routing. Without a redirect rule, refreshing on a
deep URL (e.g. `/vault/abc/note/123`) will return a 404. The `netlify.toml`
above includes the required `/* → /index.html` fallback. If you are not using
`netlify.toml`, add the same rule in the Netlify UI under **Site settings →
Redirects**.

