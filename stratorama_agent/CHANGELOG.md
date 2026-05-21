# Changelog

## 0.1.0 — Initial release

- Outbound WebSocket tunnel to the Stratorama server.
- One-time pairing via short code; long-lived agent token persisted in `/data/`.
- Forwards HA REST calls (`states`, `services/...`).
- Subscribes to HA's `state_changed` events and pushes them upstream.
- Multi-arch images: aarch64, amd64, armv7.
