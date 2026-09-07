# Stratorama - Agent

Links your Home Assistant to your [Stratorama](https://stratorama.app) account through a
single **outbound** connection, so you can see and control your devices on a floor plan
from anywhere without exposing Home Assistant to the internet.

## Requirements

- Home Assistant **OS** or **Supervised** (add-ons need the Supervisor).
- A machine on **amd64** (x86-64) or **aarch64** (64-bit ARM: Raspberry Pi 4 and 5, Home
  Assistant Green and Yellow, most NUC-class boxes). 32-bit ARM (armv7) is not supported.
- A Stratorama account: https://stratorama.app.

## Setup

1. In Stratorama, open the settings menu (the gear, top right), then **Home Assistant >
   Connection**, and press **Generate pairing code**. You get an 8-character code, valid for
   10 minutes.
2. In this add-on's **Configuration** tab, paste the code into **Pairing code** and press
   **Save**. Leave **Tunnel URL** at its default.
3. **Start** the add-on. Within a few seconds the Connection panel in Stratorama shows
   **Connected**, and the small Home Assistant mark in the top-right corner of the plan turns
   green.

That is all. The add-on now holds its own long-lived credential (stored in its `/data`
folder), so restarts and Home Assistant updates reconnect on their own. You can clear the
**Pairing code** field afterwards; it is never needed again unless you disconnect.

## What the add-on does, and what leaves your home

- It opens one outbound WebSocket to `wss://stratorama.app/agent`. **No port is opened** on
  your network, and Home Assistant is never reachable from the internet through it.
- Through that connection, Stratorama's server asks Home Assistant for the **state of your
  entities** (`GET /api/states`) and sends **service calls for the devices you placed on
  your plan**: lights, switches and covers - turn on, turn off, set brightness and colour,
  open, close, stop, set position.
- It also forwards every **state change** Home Assistant emits. State changes travel through
  Stratorama's server **in memory only**: they are never written to disk there, and each
  browser or wall panel is only sent the entities that are actually bound to its plan.
- It never reads your history or logbook, never touches automations, and never sends
  Home Assistant credentials anywhere: the Supervisor gives the add-on a local token that
  stays inside the add-on.

The full statement is in Stratorama's privacy policy: https://stratorama.app/privacy.

## Disconnecting

In Stratorama, **Settings > Home Assistant > Connection > Disconnect add-on** revokes the
credential immediately: the connection drops within a second and the add-on cannot
reconnect until it is paired again with a fresh code. Uninstalling the add-on removes its
`/data` folder and the credential with it.

## Troubleshooting

Open the add-on's **Log** tab.

- **"Code invalide" / "Code expiré" / "Code déjà utilisé"** - the pairing code is wrong,
  older than 10 minutes, or was already used. Generate a new one in Stratorama, paste it,
  save, restart the add-on.
- **"Token agent invalide"** - the credential was revoked (somebody pressed Disconnect, or
  paired another Home Assistant to the same home). Pair again with a fresh code.
- **The add-on says Running but Stratorama says Not connected** - read the Log tab first.
  A `Tunnel WS error` line means the add-on cannot reach `stratorama.app` on port 443:
  check your firewall or DNS. The add-on retries on its own, up to once a minute.
- **"This add-on is not compatible with your system"** in the store - your machine is
  32-bit (armv7) or i386, which the images do not cover.
- **Installation fails while downloading the image** - a transient registry problem;
  retry in a minute. If it persists, open an issue (below).

## Support

- Issues: https://github.com/stratorama/stratorama-addon/issues
- Email: contact@stratorama.app

The add-on is open source under the MIT licence: https://github.com/stratorama/stratorama-addon.
