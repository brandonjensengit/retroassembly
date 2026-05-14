# Docker Deployment

A pre-built image is published to Docker Hub at [`braniam/nextuon-retro`](https://hub.docker.com/r/braniam/nextuon-retro). If you just want to run the app, skip to [Run](#run). Build instructions below are for developing/modifying the image.

> Configure Authentik first. See [docs/sso-setup.md](sso-setup.md) for creating the OIDC Provider, Application, and uploader group.

## Pull (most users)

```bash
docker pull braniam/nextuon-retro:latest
```

## Build from source (maintainers)

From the repo root:

```bash
docker build -t braniam/nextuon-retro:latest .
```

Build time is ~3-5 minutes on a clean cache. The image is ~250 MB.

To publish a new version (requires `docker login` to Docker Hub as `braniam`):

```bash
docker buildx build \
  --platform linux/amd64 \
  -t braniam/nextuon-retro:latest \
  -t braniam/nextuon-retro:<new-version> \
  --push \
  .
```

Add `,linux/arm64` to `--platform` if you need an arm64 image (slower; needs QEMU emulation on amd64 dev machines).

## Run

Minimum invocation:

```bash
docker run -d \
  --name retroassembly \
  -p 8000:8000 \
  -v retroassembly-data:/app/data \
  -e RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER="https://auth.example.com/application/o/retroassembly/" \
  -e RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID="your-client-id" \
  -e RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET="your-client-secret" \
  -e RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI="https://retroassembly.example.com/auth/callback" \
  -e RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP="retroassembly-uploaders" \
  -e RETROASSEMBLY_RUN_TIME_SESSION_SECRET="$(openssl rand -hex 32)" \
  braniam/nextuon-retro:latest
```

- The app refuses to start if any required env var is missing or empty.
- Port `8000` is the in-container HTTP port. Terminate TLS at a reverse proxy in front of the container.
- The `/app/data` volume holds the SQLite database (`retroassembly.sqlite`) and uploaded ROM files. Persist it.

## docker-compose.yml

```yaml
services:
  retroassembly:
    image: braniam/nextuon-retro:latest
    # Or build from source:
    # build: .
    container_name: retroassembly
    restart: unless-stopped
    ports:
      - '8000:8000'
    volumes:
      - retroassembly-data:/app/data
    environment:
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER: 'https://auth.example.com/application/o/retroassembly/'
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID: '${AUTHENTIK_CLIENT_ID}'
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET: '${AUTHENTIK_CLIENT_SECRET}'
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI: 'https://retroassembly.example.com/auth/callback'
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP: 'retroassembly-uploaders'
      RETROASSEMBLY_RUN_TIME_AUTHENTIK_LOGIN_BUTTON_LABEL: 'Log in with SSO'
      RETROASSEMBLY_RUN_TIME_SESSION_SECRET: '${SESSION_SECRET}'

volumes:
  retroassembly-data:
```

Put secrets in a sibling `.env`:

```
AUTHENTIK_CLIENT_ID=...
AUTHENTIK_CLIENT_SECRET=...
SESSION_SECRET=...
```

Then `docker compose up -d`.

## Reverse proxy (HTTPS)

The container serves plain HTTP on port 8000. Run a TLS-terminating reverse proxy in front of it (Caddy, nginx, Traefik). Examples:

### Caddy

```
retroassembly.example.com {
  reverse_proxy retroassembly:8000
}
```

### nginx

```
server {
  listen 443 ssl http2;
  server_name retroassembly.example.com;
  ssl_certificate /etc/ssl/cert.pem;
  ssl_certificate_key /etc/ssl/key.pem;

  location / {
    proxy_pass http://retroassembly:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

The `Host` and `X-Forwarded-Proto` headers matter for the OIDC callback URL to match what you registered in Authentik.

## Cookie security note

The session and OIDC state cookies are currently set with `secure: false` so they work over plain HTTP for local development. When deploying behind HTTPS, **flip `secure` to `true`** in:

- `src/pages/routes/auth.start.ts` (4 cookies: `oidc_state`, `oidc_nonce`, `oidc_verifier`, `oidc_redirect_to`)
- `src/pages/routes/auth.callback.ts` (the `token` cookie)

A future revision should expose this via an env var (e.g. `RETROASSEMBLY_RUN_TIME_COOKIE_SECURE=true`). Until then, edit the source and rebuild.

## Updating

```bash
git pull
docker build -t braniam/nextuon-retro:latest .
docker compose up -d --force-recreate
```

The SQLite database in `/app/data` survives container recreation. Drizzle migrations run automatically at container startup if a new migration was added.

## Tearing down

```bash
docker compose down
docker volume rm retroassembly-data    # WARNING: deletes all ROMs + save states
```

## Troubleshooting

**Container exits immediately with "Missing required env var: ..."** — One of the required Authentik env vars wasn't set. Check the container logs (`docker logs retroassembly`) for the exact var name.

**SSO login redirects to the callback URL but returns 401** — The `RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI` doesn't match what the reverse proxy is forwarding to. Check that Authentik's Provider's "Redirect URIs" entry exactly matches the public URL (scheme, host, port, path).

**Group claim missing from ID token** — In Authentik, edit the Provider and ensure the scopes include the groups scope mapping. Re-login for the new claim to flow through.

**Library shows nothing after first login** — Expected on a fresh deployment with no uploads yet. Have a user in the uploader group upload a ROM to populate the shared library.

## Image internals

- Build stage: `node:25.8.1-slim` with full source + dev deps
- Runtime stage: `node:25.8.1-alpine` with only `dist/`, `node_modules` (prod only), and `src/databases` (for migration files)
- Patches under `patches/` are applied via `pnpm-workspace.yaml`'s `patchedDependencies`
- Entrypoint: `node --run=start` (resolves to `node dist/server/serve.js`)
- Exposed port: 8000
- Volume: `/app/data`
