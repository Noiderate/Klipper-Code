# Klipper Code development setup

Test against a simulated printer, never your real one.

## Prerequisites

- Git, Node.js 20+, Docker (Docker Desktop on Windows/macOS)

## 1. Start the virtual printer

```bash
cd dev/virtual-printer
docker compose up -d
```

Moonraker is now on `http://localhost:7125`. Config files appear in
`dev/virtual-printer/printer_data/config/` (git-ignored).

Allow the dev server through Moonraker's CORS by adding this under
`[authorization]` in `printer_data/config/moonraker.conf`, then restart the container
(`docker compose restart`):

```ini
cors_domains:
    *://localhost:8080
```

## 2. Start the Klipper Code UI

```bash
npm ci
cp .env.development.local.example .env.development.local
```

Set `VUE_APP_HOSTNAME=localhost` in `.env.development.local`, then:

```bash
npm run serve
```

Open http://localhost:8080. Changes hot-reload.

## Before committing

```bash
npm run format
npm run lint:fix
npm run test:unit
```

Commits follow Conventional Commits and are signed off (DCO); PRs target `develop`.
