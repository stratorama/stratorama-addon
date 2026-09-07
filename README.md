# Stratorama - Agent (Home Assistant add-on)

The small add-on that links your Home Assistant to your [Stratorama](https://stratorama.app)
account: your home on a floor plan, live and controllable from anywhere, without exposing
Home Assistant to the internet. It opens **one outbound connection** to Stratorama's relay
and nothing else - no port forwarding, no public URL, no long-lived token handed to a
browser.

```
[Stratorama in your browser]  --HTTPS-->  [stratorama.app relay]  <--WebSocket out--  [this add-on]
                                                                                            |
                                                                                            v  http://supervisor/core
                                                                                    [Home Assistant]
```

Open source, MIT licence. Images for **amd64** and **aarch64**.

## Requirements

- Home Assistant **OS** or **Supervised** (add-ons need the Supervisor). Home Assistant
  Container and Core cannot run add-ons.
- A 64-bit machine: **amd64** (x86-64) or **aarch64** (Raspberry Pi 4 / 5, Home Assistant
  Green and Yellow, most NUC-class boxes). 32-bit ARM (armv7) is not supported.
- A Stratorama account, free: https://stratorama.app.

## Install

### 1. Add this repository to your add-on store

[![Open your Home Assistant instance and show the dialog to add a repository to the add-on store.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fstratorama%2Fstratorama-addon)

The button pre-fills the dialog in your own Home Assistant. Manual path: **Settings >
Add-ons > Add-on Store**, the three-dot menu top right, **Repositories**, then add:

```
https://github.com/stratorama/stratorama-addon
```

### 2. Install "Stratorama - Agent"

It appears in the store under **Stratorama Add-ons**. Press **Install** (the image is
pulled, nothing is compiled on your machine).

### 3. Pair it with your Stratorama home

1. In Stratorama, open the settings menu (the gear, top right), then **Home Assistant >
   Connection**, and press **Generate pairing code**. The code is 8 characters and valid for
   10 minutes.
2. In the add-on's **Configuration** tab, paste it into **Pairing code**, press **Save**.
   Leave **Tunnel URL** at its default.
3. **Start** the add-on. Within seconds the Connection panel shows **Connected** and the small
   Home Assistant mark in the top-right corner of your plan turns green.

The add-on now holds its own long-lived credential in its `/data` folder: restarts and
Home Assistant updates reconnect on their own, and you can clear the **Pairing code** field.

### 4. Put your devices on the plan

In Stratorama's edit mode, tap a device on the plan (or the pen icon in the Elements list),
then **Device**, and pick the Home Assistant entity. Supported today: lights and LED strips
(`light.*`), roller shutters (`cover.*`), power outlets and electro-valves (`switch.*`), and
read-only sensors (`sensor.*`).

## What the add-on does, and what leaves your home

| Direction | What | How much |
|---|---|---|
| Relay -> Home Assistant | `GET /api/states` (the entity snapshot when a plan loads or the entity picker opens) and service calls for the devices on your plan: `light`, `switch` and `cover` services only (turn on / off, brightness and colour, open / close / stop / position) | on demand |
| Home Assistant -> relay | every `state_changed` event | continuous |

State changes cross the relay **in memory only**: nothing is written to disk there, and each
browser or wall panel is only sent the entities bound to its plan. The add-on never reads
your history or logbook, never touches automations, and never sends Home Assistant
credentials anywhere: the Supervisor hands it a local token that stays inside the add-on.
The complete statement is Stratorama's privacy policy: https://stratorama.app/privacy.

## Permissions

The add-on declares `homeassistant_api: true`, and nothing else. That gives it:

- `http://supervisor/core/api/...` (REST) and `ws://supervisor/core/api/websocket` (state
  events) on your own Home Assistant,
- the `SUPERVISOR_TOKEN` environment variable, injected by the Supervisor, valid only on the
  local network.

No `host_network`, no `hassio_api`, no `auth_api`, no `privileged`, no mapped folders, no
ingress. It makes **outbound** connections only and opens no port.

## Disconnecting and revoking

In Stratorama, **Settings > Home Assistant > Connection > Disconnect add-on** revokes the
add-on's credential at once: the connection drops within a second and the add-on cannot
reconnect until it is paired again with a fresh code. Uninstalling the add-on deletes its
`/data` folder, credential included. Pairing a second Home Assistant to the same home
replaces the first one's credential.

## Configuration reference

| Option | Type | Required | Description |
|---|---|---|---|
| `pairing_code` | string | first start only | The 8-character code from Stratorama. Used once, then ignored. |
| `tunnel_url` | url | yes | `wss://stratorama.app/agent`. Change it only if you run your own relay. |

## Troubleshooting

Everything the add-on has to say is in its **Log** tab.

| Log says | Meaning | What to do |
|---|---|---|
| `Code invalide`, `Code expiré`, `Code déjà utilisé` | the pairing code is wrong, older than 10 minutes, or already used | generate a new code in Stratorama, paste it, save, restart |
| `Token agent invalide` | the credential was revoked (Disconnect was pressed, or another Home Assistant was paired to the home) | pair again with a fresh code |
| `Tunnel WS error` repeating, add-on shows Running, Stratorama shows Not connected | the add-on cannot reach `stratorama.app` on port 443 | check your firewall and DNS; the add-on retries on its own, up to once a minute |
| `HA WS auth invalid` | the Supervisor token is not reaching the add-on | only possible on a fork that dropped `homeassistant_api: true` |
| Store says "not compatible with your system" | 32-bit (armv7) or i386 machine | not supported |
| Install fails while pulling the image | registry hiccup | retry in a minute, then open an issue |

## Support

- Issues and questions: https://github.com/stratorama/stratorama-addon/issues
- Email: contact@stratorama.app

## Development

The add-on lives in `./stratorama_agent/` (the Supervisor scans sub-folders for a
`config.yaml`); `repository.yaml` at the root marks this repository as an add-on store.

```bash
cd stratorama_agent
npm ci
npm run typecheck
docker build --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.20 -t stratorama-agent:dev .
```

`.github/workflows/builder.yml` builds and publishes the amd64 and aarch64 images to GHCR on
every push to `main`, then checks that a stranger can pull them - the one thing a private
image silently breaks. Wire types in `src/types.ts` must stay in step with the relay's
(`stratorama-tunnel/src/types.ts`).

## Licence

MIT - see [LICENSE](LICENSE).
