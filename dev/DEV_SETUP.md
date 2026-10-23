# Klipper Code development setup

Test against a simulated printer, never your real one.

## Prerequisites

- Git, Node.js 20+, Docker (Docker Desktop on Windows/macOS)

## 1. Start the virtual printer

Keep this outside the repo (or git-ignored), for example inside your project folder:

```bash
git clone https://github.com/mainsail-crew/virtual-klipper-printer
cd virtual-klipper-printer
docker compose up -d
```

Moonraker is now on `http://localhost:7125`. Config files appear in
`virtual-klipper-printer/printer_data/config/`.

If the printer stops with "Timer too close" on first boot, run `docker restart printer`.

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

## 3. Turn on Klipper Code

In Interface Settings (cog icon) open the **Klipper Code** tab, switch on **Enable Klipper Code** and
connect any API key. Connecting is simulated for now and the chat runs in demo mode, so no real key is
needed. The Klipper Code button then appears in the top bar next to the notifications bell.

## Before committing

```bash
npm run format
npm run lint:fix
npm run test:unit
```

Commits follow Conventional Commits and are signed off (DCO).
