# Changelog

## 1.4.0 - Only what is on your plan leaves your home

- The agent now forwards a state change only for the entities your plan uses: its devices,
  their readings, your doors' and windows' sensors, and the devices in your device library.
  Stratorama's relay tells it which after every connection and whenever you link or unlink
  something; until it has, the agent forwards nothing at all. Everything else stays home, a
  sensor of a kind Stratorama shows included - a phone's geocoded address, a one-time code, a
  notification's text.
- The device picker still lists the rest, by name, kind and unit only, with no value. Its "Show
  value" reads one entity's current value when an editor asks, and that is the only moment the
  value of something not on your plan leaves your home.
- The plan's own snapshot carries only the entities the person or tablet asking may see, and a
  service call's answer carries its status only (the relay never read the rest).
- The calls the agent makes to Home Assistant do not change: still the nine of
  `src/ha-allowlist.ts`. The relay's request names what the answer may carry
  (`src/ha-views.ts`); the agent reads `GET /api/states` as before and cuts the answer to it.
- It needs a relay that names your plan's entities, which Stratorama's has done since
  2026-10-02. Against an older one (a `tunnel_url` / `TUNNEL_URL` of your own), it connects
  and forwards nothing: stay on 1.3.0 there.

## 1.3.0 - Only what Stratorama shows leaves your home

- The agent now sends the relay the states of the five domains Stratorama shows - `light`,
  `switch`, `cover`, `sensor` and `binary_sensor` - and nothing else, in state changes, in the
  entity snapshot and in service-call answers (`src/ha-domains.ts`). Until now it sent every
  entity Home Assistant has, each time it changed: who is home and where everyone is
  (`person`, `device_tracker`), cameras with their access tokens, media players, calendars.
  Stratorama never showed any of it, and its device picker lists exactly what it listed
  before. The filter is by domain: a sensor that reports a location, such as the Companion
  app's geocoded address, is a sensor and is still sent. A device type Stratorama starts
  supporting will come with a new agent version, the way a new call does.
- Home Assistant's own tokens are also removed from what does leave (`src/ha-redact.ts`), in
  the forms Home Assistant writes them: an `access_token` attribute, an entity picture link
  (`entity_picture`, `entity_picture_local`: Stratorama shows none), the `token`,
  `access_token` and `authSig` parameters of a link, the token in an `/api/hls/` or
  `/api/tts_proxy/` path, and the `user:password@` of an address. A template sensor whose
  state is a camera's picture link, for example, carries that camera's token, which opens its
  live stream without signing in to anyone who can reach Home Assistant; a garadget garage door
  carries its maker's cloud token.
- Stratorama's relay applies the same two rules to an agent that is not updated yet, so no
  browser receives any of it whichever version you run; updating keeps it inside your home.

## 1.2.0 - Also runs without Home Assistant OS

- New: the same agent as a standalone Docker image, `ghcr.io/stratorama/stratorama-agent`
  (amd64 and arm64), for Home Assistant Container, which cannot run apps. It is configured
  with `HA_URL`, `HA_TOKEN` (a long-lived access token, from a non-admin user if you like)
  and `PAIRING_CODE`: see the README. It runs as an unprivileged user and reports `healthy`
  or `unhealthy` to Docker. On a refusal no retry can fix, it stays up without connecting
  instead of exiting, so that Docker's restart policy never presents a refused code or token
  again every minute.
- For the Home Assistant app, nothing changes in what it does. Its log lines now say "app" or
  "agent" (Home Assistant renamed add-ons to apps in 2026.2), and every hello tells the relay
  whether it comes from the app or from the Docker image, next to the version.
- A token Home Assistant rejects is no longer retried every 30 seconds, since each retry was
  a failed login in Home Assistant's eyes: the agent stops and says what to do.
- A credential that cannot be saved is reported in the log, and no longer stops the events of
  the connection that just received it.

## 1.1.0 - Notices, refuses, stops, and says its version

- A dead connection is noticed. The relay pings every 30 seconds; a socket that has
  carried nothing for 90 seconds is closed and reopened. Until now a NAT that dropped the
  mapping left the add-on "connected" indefinitely while nothing reached Home Assistant.
- Only the nine calls Stratorama makes are relayed: `GET /api/states` and the `light`,
  `switch` and `cover` services listed in the README. Anything else is answered 403 and
  Home Assistant never sees it.
- A refusal no retry can fix - an unknown, used or expired pairing code, or a revoked
  credential with no code to fall back on - stops the add-on with one line saying what to
  do, instead of retrying every minute. A revoked credential with a pairing code in the
  configuration is forgotten and the code tried at once, so re-pairing takes one restart.
- Nothing the relay or Home Assistant sends can end the process any more: an error while
  handling a message is logged and the connection kept.
- The version is in the first log line and in every hello, so a support question can be
  answered from the relay's journal.
- Development outside Home Assistant: `HA_HTTP_URL` and `HA_WS_URL` point the agent at any
  instance; `npm test` runs the suite against an in-process relay.

## 1.0.0 - First public release

The relay itself is unchanged since 0.1.0; what changes is that a stranger can now
install it and trust it.

- The prebuilt images are public on GHCR (they were private until 2026-09-07, so the
  add-on could not be installed by anyone else), and the build fails if that ever regresses.
- English store listing: description, link to the repository, an icon and a logo, a
  Documentation tab (`DOCS.md`) and labelled configuration options (`translations/en.yaml`).
- Open source under the MIT licence (`LICENSE`).
- Reproducible image: dependencies installed with `npm ci` from the committed lockfile.
- Architectures stated where the reader is: amd64 and aarch64; armv7 was never published.

## 0.1.0 - Initial release

- Outbound WebSocket tunnel to the Stratorama server.
- One-time pairing via short code; long-lived agent token persisted in `/data/`.
- Forwards HA REST calls (`states`, `services/...`).
- Subscribes to HA's `state_changed` events and pushes them upstream.
- Images built for aarch64 and amd64 (armv7 was planned, never published: the emulated
  build exceeded the CI time limit).
