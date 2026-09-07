# Changelog

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
