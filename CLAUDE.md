# Stratorama — HA Agent Add-on

Home Assistant add-on that opens a single outbound WebSocket to the Stratorama tunnel server and proxies HA REST calls + `state_changed` events through it. No port forwarding, no inbound exposure of HA. See [README.md](README.md) for setup and pairing flow.

## Commands

- `npm run build` — `tsc` compile to `dist/`
- `npm start` — run compiled add-on (`node dist/index.js`)
- `npm run typecheck` — type check only
- Local Docker build: `docker build --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.20 -t stratorama-agent:dev .`

## Architecture

- **Node 22+**, **TypeScript ESM** (`"type": "module"`)
- **ws** for the outbound WebSocket to the tunnel server (`wss://.../agent`)
- Talks to HA via `http://supervisor/core` using the auto-injected `SUPERVISOR_TOKEN` env var
- Persists the long-lived `agent_token` in `/data/agent-token.json` after first pairing — `pairing_code` is one-shot

## Project Structure

```
src/
├── index.ts          # Bootstrap, reads /data, starts tunnel-client
├── tunnel-client.ts  # WS connection to tunnel + ha:request validation/dispatch
├── ha-client.ts      # http://supervisor/core REST + ws://supervisor/core WS
├── token-store.ts    # /data/agent-token.json read/write
├── types.ts          # Wire-format types (must stay in sync with stratorama-tunnel)
└── log.ts            # Structured logging
```

## Conventions

- **Defense-in-depth on `ha:request`** — every incoming WS frame is runtime-validated (`requestId`, `method` ∈ {GET,POST}, `path` starts with `/api/` and has no `..`) before being forwarded to HA. The JSON cast in TypeScript is *not* trusted.
- **Only what Stratorama shows leaves, and without tokens** - every state sent to the relay (`pushEvent`, and every `ha:response` body) goes through `src/ha-domains.ts` (only `light`, `switch`, `cover`, `sensor`, `binary_sensor`; a new device type needs a new entry and a release) and then `src/ha-redact.ts` (drops `access_token`, `entity_picture` and `entity_picture_local` keys, cuts `token` / `access_token` / `authSig` out of URLs in one linear pass - no fixed-point loop, a hostile string must not go quadratic - the token out of `/api/hls/` and `/api/tts_proxy/` paths and `user:password@` out of URLs, bounded depth). A new path that sends states upstream must go through both. Both have twins in `../stratorama-tunnel/src/` applied on arrival, for agents that predate them: the relay file is its own header plus this file's code verbatim, and its spec is this test file verbatim behind an assert shim - change both, same cases.
- **Bound-only (1.4.0)** - `pushEvent` forwards only entities in the relay's last `agent:bound-set` (null on a fresh connection = nothing; the set is applied in `#handleMessage` BEFORE any await, so a request sent after it is answered against it), and every `GET /api/states` answer is cut to the request's `view` by `src/ha-views.ts` (runtime / catalog / value; none or malformed = metadata only). Service-call answers are `body: null`. The hello names `AGENT_CAPABILITIES`; the relay sends the set only to an agent that names `bound-set`. `ha-views.ts` has a twin in the tunnel too.
- **Wire types** in `src/types.ts` must stay synced with `../stratorama-tunnel/src/types.ts`
- **Outbound-only** — the add-on never opens an inbound port

## Sibling repos

Stratorama is split across 3 repos that interact at runtime:

- **`../stratorama-app`** (`C:/Projects/stratorama-app`) — Angular SPA where the user generates the pairing code
- **`../stratorama-tunnel`** (`C:/Projects/stratorama-tunnel`) — the relay this add-on connects to
- **this repo** — the HA-side agent

Runtime data flow:

```
[stratorama-app browser] ──HTTPS──▶ [stratorama-tunnel] ◀──WS out── [this add-on] ──HTTP── [Home Assistant]
```

Sibling paths are declared in `.claude/settings.local.json` so Claude Code can read/edit all 3 repos from one session.
