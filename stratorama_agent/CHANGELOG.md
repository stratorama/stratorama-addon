# Changelog

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
