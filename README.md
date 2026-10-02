# Stratorama - Agent (Home Assistant app)

The small Home Assistant app (formerly called an add-on) that links your Home Assistant to
your [Stratorama](https://stratorama.app) account: your home on a floor plan, live and
controllable from anywhere, without exposing Home Assistant to the internet. It opens
**one outbound connection** to Stratorama's relay and nothing else - no port forwarding,
no public URL, no long-lived token handed to a browser.

```
[Stratorama in your browser]  --HTTPS-->  [stratorama.app relay]  <--WebSocket out--   [this app]
                                                                                            |
                                                                                            v  http://supervisor/core
                                                                                    [Home Assistant]
```

Open source, MIT licence. Images for **amd64** and **aarch64**.

## Requirements

- **Home Assistant OS**: install the Home Assistant app below (apps need the Supervisor,
  which Home Assistant OS provides; the unsupported Supervised install has it too).
- **Home Assistant Container**: apps do not run there, so run the same agent as a Docker
  image instead - see [Home Assistant Container (Docker)](#home-assistant-container-docker).
- A 64-bit machine: **amd64** (x86-64) or **aarch64** (Raspberry Pi 4 / 5, Home Assistant
  Green and Yellow, most NUC-class boxes). 32-bit ARM (armv7) is not supported.
- A Stratorama account, free: https://stratorama.app.

## Install

### 1. Add this repository to your Home Assistant app store

[![Open your Home Assistant instance and show the add app repository dialog with this repository pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fstratorama%2Fstratorama-addon)

The button pre-fills the dialog in your own Home Assistant. Manual path: **Settings >
Apps > Install app**, the three-dot menu top right, **Repositories**, then add (before
Home Assistant 2026.2: **Settings > Add-ons > Add-on Store**, same menu):

```
https://github.com/stratorama/stratorama-addon
```

### 2. Install "Stratorama - Agent"

It appears in the store under **Stratorama**. Press **Install** (the image is
pulled, nothing is compiled on your machine).

### 3. Pair it with your Stratorama home

1. In Stratorama, open the settings menu (the three-dot menu, top right), then **Home Assistant >
   Connection**, and press **Generate pairing code**. The code is 8 characters and valid for
   10 minutes.
2. In the app's **Configuration** tab, paste it into **Pairing code** and press **Save**.
   Leave **Tunnel URL** at its default. Home Assistant confirms the save with nothing more than a
   brief toast at the bottom of the screen (or asks to restart, if the app is already running):
   no message is normal, the code is saved.
3. Back on the **Info** tab, **Start** the app. Within seconds the Connection panel shows
   **Connected** and the small Home Assistant mark in the top-right corner of your plan turns green.

The app now holds its own long-lived credential in its `/data` folder: restarts and
Home Assistant updates reconnect on their own, and you can clear the **Pairing code** field.

### 4. Put your devices on the plan

In Stratorama's edit mode, tap a device on the plan (or the pen icon in the Elements list),
then **Device** (on a sensor, **Add reading**), and pick the Home Assistant entity. Supported
today: lights and LED strips (`light.*`), roller shutters (`cover.*`), power outlets and
electro-valves (`switch.*`), and read-only sensors (`sensor.*`, and `binary_sensor.*` such as a
door, motion or leak sensor). What comes next is in [Using the plan](#using-the-plan).

## Home Assistant Container (Docker)

Home Assistant Container has no Supervisor, so it cannot run Home Assistant apps. The same
agent ships as a plain Docker image instead, `ghcr.io/stratorama/stratorama-agent`, for
**amd64** and **arm64**. It runs next to Home Assistant, opens no port, and does exactly what
the app does: one outbound connection to the relay, and the same nine calls to Home
Assistant, no others.

### 1. Create an access token in Home Assistant

The app is handed a token by the Supervisor; a container has to be given one.

1. Recommended: a dedicated user. In Home Assistant, **Settings > People > Users > Add user**,
   name it `Stratorama` and leave **Administrator** off: the agent needs no admin rights. Home Assistant then records what
   the agent does as done by that user, and deleting the user revokes it.
2. Signed in as that user (or as yourself, if you skip step 1), open your profile, **Security**
   tab, **Long-lived access tokens > Create token**, name it `Stratorama agent`, and copy it:
   Home Assistant shows it once.

The token never leaves your network: the agent presents it to Home Assistant and to nothing
else, and the relay never sees it. The relay is not told `HA_URL` either: Stratorama never
learns your Home Assistant's network address.

### 2. Generate a pairing code in Stratorama

The settings menu (the three-dot menu, top right) > **Home Assistant > Connection >
Generate pairing code**. The code is 8 characters, valid for 10 minutes, and works once.

### 3. Start the agent

`compose.yaml`:

```yaml
services:
  stratorama-agent:
    image: ghcr.io/stratorama/stratorama-agent:latest
    container_name: stratorama-agent
    restart: unless-stopped
    environment:
      HA_URL: http://192.168.1.10:8123   # the address you open Home Assistant with
      HA_TOKEN: "paste-the-long-lived-access-token-here"
      PAIRING_CODE: "ABCD2345"           # read at the first start only
    volumes:
      - stratorama-agent-data:/data      # where the agent keeps its credential

volumes:
  stratorama-agent-data:
```

```bash
docker compose up -d
docker compose logs -f stratorama-agent
```

Within seconds the log says `Registered with the relay` and the Connection panel in
Stratorama shows **Connected**; about 30 seconds later `docker ps` shows the container as
`healthy`. The agent now keeps its own credential in the volume, so restarts, reboots and
image updates reconnect on their own, and `PAIRING_CODE` is not read again unless you
disconnect. Then put your devices on the plan, as in
[step 4 of the app install](#4-put-your-devices-on-the-plan).

The same without Compose:

```bash
docker run -d --name stratorama-agent --restart unless-stopped \
  -e HA_URL=http://192.168.1.10:8123 -e HA_TOKEN=paste-the-token-here -e PAIRING_CODE=ABCD2345 \
  -v stratorama-agent-data:/data ghcr.io/stratorama/stratorama-agent:latest
```

**Which `HA_URL`?** Any address at which the agent's container reaches Home Assistant:

- Home Assistant's address on your network, like `http://192.168.1.10:8123`: works in every
  setup;
- `http://homeassistant:8123` when both containers share a Compose network and the Home
  Assistant service is called `homeassistant`;
- `http://localhost:8123` only if the agent runs with `network_mode: host` as well.

HTTPS works too (`https://...`). With a certificate the container does not trust
(self-signed), mount its CA into the container and point `NODE_EXTRA_CA_CERTS` at it.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `HA_URL` | yes | Home Assistant's address: `http(s)://host:port`, no path. |
| `HA_TOKEN` | yes, or `HA_TOKEN_FILE` | A long-lived access token. |
| `HA_TOKEN_FILE` | | A file holding the token instead, such as a Docker secret at `/run/secrets/ha_token`. |
| `PAIRING_CODE` | first start only | The 8-character code from Stratorama. |
| `TUNNEL_URL` | no | `wss://stratorama.app/agent` by default. Change it only if you run your own relay. |

### Updating and disconnecting

- Update: `docker compose pull && docker compose up -d`.
- **Disconnect Home Assistant** in Stratorama (Settings > Home Assistant > Connection)
  revokes the agent's credential at once. `docker compose down -v` then removes the
  container and its volume, and deleting the token (or the `Stratorama` user) in Home
  Assistant withdraws its access there too.

### When something is wrong

`docker ps` shows the container as `unhealthy` whenever the agent is not both registered with
the relay and subscribed to Home Assistant. `docker compose logs stratorama-agent` says why:

| Log says | What to do |
|---|---|
| `HA_URL is not set`, `HA_TOKEN is not set`, `HA_URL must be the address of Home Assistant itself` | fix the variable; until then the container exits and Docker restarts it |
| `Home Assistant rejected HA_TOKEN` | create a new token, set it as `HA_TOKEN`, then `docker compose up -d` |
| `Home Assistant has not answered at ...` | `HA_URL` is wrong, or not reachable from the container (see "Which `HA_URL`?" above) |
| `Pairing refused: ...`, `The relay no longer accepts this agent's credential` | generate a new code in Stratorama, set it as `PAIRING_CODE`, then `docker compose up -d` |
| `Could not store the credential in /data/agent-token.json` | `/data` is a host folder that uid 1000 cannot write: use the named volume above, or give that folder to uid 1000 |
| `Relay WS error` repeating | the container cannot reach `stratorama.app` on port 443: check your firewall and DNS |

On a refusal no retry can fix (a pairing code or credential the relay refuses, a token Home
Assistant rejects), the agent **stays up without connecting** instead of exiting, so that
Docker's restart policy does not present the same refused values again every minute. Change
the configuration, then recreate the container: `docker compose up -d` does that when the
compose file changed, whereas `docker restart` would start it with the old values.

The image runs as an unprivileged user (uid 1000), opens no port, and writes nothing to your
host but its own volume. It is built from [`stratorama_agent/Dockerfile.standalone`](stratorama_agent/Dockerfile.standalone).

## Using the plan

Once Home Assistant is connected, the rest happens in Stratorama, whichever way the agent runs.

### Your devices, named once

The settings menu > **Home Assistant > Devices** is your device library (in edit mode, the
entity picker's **Manage devices** opens it too). Name each Home Assistant device and set a
sensor's comfort range there once: placing an element on the plan then picks from this short
list first, under **Your devices**, by the names you gave.

- **Add device**, then pick the Home Assistant entity: the device is created under the entity's
  Home Assistant name, and you can rename it right after. A humidity sensor, or a temperature
  sensor in Celsius, arrives with a usual comfort range already filled in.
- **Remove from library** only clears the custom name and the comfort range: elements already
  on the plan keep working.

### Comfort range

A sensor's comfort range is a minimum and a maximum: outside it, that device's readings are
tinted on the plan. It belongs to the device rather than to one element, so it applies wherever
the device is shown, and setting it from the library or from a reading on the plan changes the
same value.

### Sensors and readings

A **Sensor** placed on the plan shows only its name until it has a reading: in its
configuration, **Add reading** and pick a Home Assistant `sensor.*` or `binary_sensor.*` entity
(a door, motion or leak sensor, for instance), and its live value appears on the plan. One
sensor can carry several readings, a temperature and a humidity for instance.

### Doors and opening sensors

Every door is drawn closed unless a sensor says otherwise. In the wall inspector (see below), a
door's row offers **Link an opening sensor**: pick a Home Assistant `binary_sensor` (any one,
its class does not have to be door), and the door is drawn open while it reads open.

### Walls

A wall responds once its room is selected: in edit mode, tap a room, then tap one of its walls
on the plan, and the wall inspector opens (thickness, curve, corners, openings).

**Apply to all room walls** gives every wall of the room this wall's thickness and grow
direction, and every corner of the room this wall's corner radius (if its two corners differ,
the one you set last since opening the inspector; if you set neither since, corners are left
as they are). Two things reach past the room:

- a wall shared with a neighbouring room is one wall, so it changes in that room too;
- a corner is shared with whatever meets there, so the radius also lands where other rooms meet
  the room's corners.

On a shared wall the button is disabled, since "the room" could be either one: select a wall
only that room has. The undo button in the inspector's header (or Ctrl+Z / Cmd+Z) takes the
whole apply back in one press.

### Rooms and floors

- **Delete room** acts at once, and the elements placed in the room are deleted with it. A wall
  it shares with a neighbouring room stays: the neighbour still needs it.
- A floor's pen icon in the Floors list sets its roles. **Default floor** (the star in the list):
  presentation opens on it. **Ground floor** (the house): each floor above it is drawn over a
  faint outline of the walls beneath, so an upper floor can be traced over what it stands on;
  nothing is traced under the ground floor. With none set, the bottom floor counts as the ground
  floor.
- **Delete floor** (while the home has more than one) asks you to confirm: its rooms, and the
  elements in them, are deleted with it.

## What the app does, and what leaves your home

| Direction | What | How much |
|---|---|---|
| Relay -> Home Assistant | `GET /api/states` (the entity snapshot when a plan loads, the entity picker opens, or the picker's Show value is pressed; the app answers with what the relay's request names, below) and service calls for the devices on your plan: `light`, `switch` and `cover` services only (turn on / off, brightness and colour, open / close / stop / position). The app itself refuses any other call, whoever asks: the exact list is [`src/ha-allowlist.ts`](stratorama_agent/src/ha-allowlist.ts) | on demand |
| Home Assistant -> relay | the `state_changed` events of the entities on your plan (its devices, their readings, your doors' sensors, your device library), of the five domains below and without the tokens below; nothing else | continuous |
| Home Assistant -> relay, on request | the entity list for the picker: the entities on your plan in full, every other light, switch, cover and sensor by name, kind and unit only; one entity's value when an editor presses Show value | when the picker opens |

Since 1.4.0 the app forwards a state change only for the entities on your plan, which
Stratorama's relay names after every connection and whenever you link or unlink something;
until it has, the app forwards nothing. Every answer to `GET /api/states` is cut to what the
relay's request names ([`src/ha-views.ts`](stratorama_agent/src/ha-views.ts)): the plan's
snapshot to the entities the person or tablet asking may see, the picker's list to names, kinds
and units for everything not on your plan, Show value to one entity. A service call's answer is
its status only. Since 1.3.0, and on every path, only the five domains Stratorama shows ever
leave ([`src/ha-domains.ts`](stratorama_agent/src/ha-domains.ts)): `person` and
`device_tracker` entities, cameras, media players and every other domain stay in your home. A
sensor you do not put on the plan - a phone's geocoded address, a one-time code - leaves as a
name in the picker's list, never as a value unless an editor asks. State changes cross the relay **in memory only**:
nothing is written to disk there, and each browser or wall panel is only sent the entities
bound to its plan. The app never reads your history or logbook, never touches automations,
and never sends Home Assistant credentials anywhere: the Supervisor hands it a local token
that stays inside the app. Home Assistant also puts tokens of its own in some states - an
`access_token` attribute, the `?token=` of a camera's picture link, a stream token in an
`/api/hls/` path - and one can travel into a state the app does send (a template sensor whose
state is a camera's picture link): the app removes them, in the forms Home Assistant writes
them, before the state leaves your home, along with entity picture links and the
`user:password@` of an address ([`src/ha-redact.ts`](stratorama_agent/src/ha-redact.ts)).
Stratorama never learns your Home Assistant's network address either: the connection starts
from your home, so nothing ever has to reach in.
The complete statement is Stratorama's privacy policy: https://stratorama.app/privacy.

## Permissions

The app declares `homeassistant_api: true`, and nothing else. That gives it:

- `http://supervisor/core/api/...` (REST) and `ws://supervisor/core/api/websocket` (state
  events) on your own Home Assistant,
- the `SUPERVISOR_TOKEN` environment variable, injected by the Supervisor, valid only on the
  local network.

No `host_network`, no `hassio_api`, no `auth_api`, no `privileged`, no mapped folders, no
ingress. It makes **outbound** connections only and opens no port.

## Disconnecting and revoking

In Stratorama, **Settings > Home Assistant > Connection > Disconnect Home Assistant** revokes
the app's credential at once: the connection drops within a second and the app cannot
reconnect until it is paired again with a fresh code. Uninstalling the app deletes its
`/data` folder, credential included. Pairing a second Home Assistant to the same home
replaces the first one's credential.

## Configuration reference

| Option | Type | Required | Description |
|---|---|---|---|
| `pairing_code` | string | first start only | The 8-character code from Stratorama. Used once, then ignored. |
| `tunnel_url` | url | yes | `wss://stratorama.app/agent`. Change it only if you run your own relay. |

## Troubleshooting

Everything the app has to say is in its **Log** tab. When it stops on purpose (the first
five rows), Home Assistant shows it as stopped with an error: nothing will change until the
configuration does, so it does not keep knocking on the relay every minute.

| Log says | Meaning | What to do |
|---|---|---|
| `Pairing refused: the relay does not know this pairing code` | mistyped, or refused after too many attempts | generate a new code in Stratorama, paste it into **Pairing code**, save, start |
| `Pairing refused: this pairing code has already been used` | a code works once | same |
| `Pairing refused: this pairing code has expired` | a code is valid for 10 minutes | same |
| `The relay no longer accepts this agent's credential` | Disconnect Home Assistant was pressed in Stratorama, or another Home Assistant was paired to the home | same; if a fresh code is already in the configuration, the app tries it by itself |
| `No stored credential and no pairing code in the configuration` | first start without a code | same |
| `Relay WS error` repeating, app Running, Stratorama Not connected | the app cannot reach `stratorama.app` on port 443 | check your firewall and DNS; the app retries on its own, up to once a minute |
| `No frame from the relay for 90 s` | the network dropped the connection silently (NAT, ISP); the app reconnects by itself | nothing, unless it repeats every few minutes: then look at the network |
| `refusing it for now`, `reconnecting in 5 min` | this address failed too many pairings in 15 minutes | wait, then check the pairing code |
| `Refusing ha:request`, `not one of the calls this agent relays` | Stratorama asked for something this version does not relay | update the app |
| `Home Assistant rejected the Supervisor token` | the Supervisor token is not reaching the app | only possible on a fork that dropped `homeassistant_api: true` |
| The store shows the app as "Not available" | 32-bit (armv7) or i386 machine | not supported |
| Install fails while pulling the image | registry hiccup | retry in a minute, then open an issue |

## Support

- Issues and questions: https://github.com/stratorama/stratorama-addon/issues
- Email: contact@stratorama.app

## Development

The app lives in `./stratorama_agent/` (the Supervisor scans sub-folders for a
`config.yaml`); `repository.yaml` at the root marks this repository as an app repository.

```bash
cd stratorama_agent
npm ci
npm run typecheck
docker build --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.20 -t stratorama-agent:dev .
docker build -f Dockerfile.standalone -t stratorama-agent-standalone:dev .
```

One source, two packagings: the app image (`Dockerfile`, bashio reads the app options) and
the standalone image (`Dockerfile.standalone`, environment variables only). The standalone
image sets `AGENT_RUNTIME=docker`, which is what makes the agent word its instructions for a
container and stay up on a refusal instead of exiting (`src/config.ts`, `src/index.ts`).

`npm test` runs the suite: the client against an in-process relay and a fake Home Assistant,
the configuration matrix of both runtimes, and the pin that `config.yaml` (the version the
store shows) and `package.json` (the version the agent reports) carry the same number.

Outside Home Assistant, the agent runs against any instance: set `HA_URL` to it
(`http://ha.local:8123`), `HA_TOKEN` to a long-lived access token from your profile page,
`TUNNEL_URL` to a relay and `PAIRING_CODE` to a code, then `npm run build && npm start`.
`AGENT_DATA_DIR` moves the credential out of `/data`.

`.github/workflows/builder.yml` runs the tests, builds and publishes the amd64 and aarch64
app images and the multi-arch standalone image to GHCR on every push to `main`, then checks
that a stranger can pull them - the one thing a private image silently breaks. Wire types in `src/types.ts` must stay in step with
the relay's (`stratorama-tunnel/src/types.ts`).

## Licence

MIT - see [LICENSE](LICENSE).
