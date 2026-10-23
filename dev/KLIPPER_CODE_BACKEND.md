# Klipper Code backend: design draft

Status: **agreed**, decisions recorded below. Building in the order of section 6.

## Goal

Move the AI calls out of the browser and onto the printer host. The Mainsail panel (already built, demo mode)
talks only to Moonraker; a new Moonraker component talks to the AI provider. API keys never reach the browser.

```
Browser (Mainsail panel)  --websocket/HTTP-->  Moonraker + klipper_code component  --HTTPS-->  Anthropic / OpenAI / custom
                                                     |
                                                     +-- reads config files, Klipper status, klippy.log (read only)
```

## 1. How the API key is stored

- The browser sends the key **once**, to `POST /server/klipper_code/credentials`. Moonraker checks it by
  listing the provider's models, then stores it. No endpoint ever returns the key; the panel only sees
  provider, last 4 characters and connected time (what it shows today).
- Stored in `~/printer_data/klipper_code/credentials.json`, file mode `600`, owned by the Moonraker user.
- **Not** in the config folder (anyone with Mainsail can browse and download it) and **not** in Moonraker's
  database (readable through `/server/database`).
- `DELETE /server/klipper_code/credentials` removes one provider or all (the "Disconnect all" button).
- Keys are not encrypted at rest: anyone with shell access to the printer can read them. Same trust level as
  `moonraker.secrets`.
- **Decided:** keys are not read from `moonraker.secrets` (may be added later).
- **Decided:** one shared key per provider per printer, not per Moonraker user.

## 2. How the panel talks to it

All endpoints live under `/server/klipper_code/` and are also available as websocket JSON-RPC methods
(`server.klipper_code.*`), so they use Moonraker's normal login and trusted-client rules.

| Endpoint                                  | Purpose                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET status`                              | enabled, connected providers (with key hint), default model/effort                         |
| `POST credentials` / `DELETE credentials` | connect / disconnect keys (section 1)                                                      |
| `GET models?provider=`                    | live model list with supported effort levels (replaces the mock in `klipperCodeModels.ts`) |
| `POST chat`                               | send the conversation, model and effort; returns a request id                              |
| `POST chat/cancel`                        | stop a running request                                                                     |

- **Decided:** one chat request at a time per printer; a second one is refused while the first runs.
- **Decided:** the first version supports Anthropic (Claude) only. Providers sit behind a small adapter
  interface (`list_models`, `validate_key`, `chat`) so OpenAI and custom endpoints can be added next.

- Replies stream back as websocket notifications (`notify_klipper_code_message`): text chunks, then zero or
  more **proposals** `{filename, summary, risk, baseContent hash, newContent}`.
- Effort is sent as the neutral names the panel already uses (`low` … `max`); the component maps them to each
  provider's reasoning/thinking setting.
- Model lists: Anthropic `GET /v1/models` gives models and effort support; OpenAI gives models only, so effort
  support comes from a small table in the component with a `low/medium/high` fallback.

## 3. What it can touch

**Can read** (to give the AI context):

- Klipper `.cfg` files in the config root (not `klipper_code_backups/`); never `moonraker.conf` or other `.conf` files
- Klipper status objects (temperatures, printer state, errors) and the last part of `klippy.log`

**Cannot do:**

- Write or delete files. It only **proposes** changes; the panel writes them through the existing
  file API after Apply (or auto-accept), with the backup it already makes. A bug or a bad AI answer can't
  change anything by itself.
- Run G-code, move axes, heat anything, or restart Klipper / Moonraker. Restart stays a button in the panel
  that always asks.
- Read the gcodes folder, timelapses, other roots, or anything outside `printer_data/config`.

**Before anything is sent to the provider:**

- Lines in the `.cfg` files that look like secrets (`api_key`, `password`, `token`,
  `secret`, `{secrets.…}`) are replaced with `<redacted>`. `moonraker.conf` and `moonraker.secrets` are never read.
- Only files the request needs are sent, not the whole folder.

**Decided:**

- Risk scoring runs on the printer and is the authority: each proposal carries the printer's risk, and
  auto-accept follows that value. The panel keeps `klipperCodeRisk.ts` only to display the badge.
- The AI may read Klipper `.cfg` files only, never `moonraker.conf`.

## 4. Cost and abuse limits

- Anyone who can open Mainsail can use the AI on your key. If Moonraker trusts the whole LAN, that is
  everyone on your Wi-Fi.
- **Decided:** limits are on by default and configurable in `[klipper_code]`: 200 chat requests per day and
  16000 output tokens per request. Counters reset at midnight (printer time).

## 5. Install and configuration

- Lives in `backend/` of this repo for now (can move to its own repo later), with `install.sh` that links
  `klipper_code.py` into Moonraker's `components` folder, like other Moonraker extensions.
- `moonraker.conf`:

```ini
[klipper_code]
# all optional
# max_requests_per_day: 200
# max_tokens_per_request: 16000
# custom_base_url: https://my-openai-compatible-server/v1
```

- An `[update_manager klipper_code]` entry so it updates from Mainsail like everything else.
- Needs outbound HTTPS from the printer host to the provider (port 443).

## 6. Build order

1. Component skeleton: `status`, credentials store/delete, `models` (real Anthropic + OpenAI calls).
2. Swap `klipperCodeModels.ts` and the settings tab's Connect to the real endpoints.
3. `chat` with streaming text only, no proposals.
4. Proposals (structured edits), secret redaction, limits.
5. Test against the virtual printer, then a real one with a spare config.

## Answered questions

- Target current Moonraker (Python 3.9 or newer); tested against the virtual printer.
- Chat history stays in the browser for now.
- One shared key per printer (see section 1).
