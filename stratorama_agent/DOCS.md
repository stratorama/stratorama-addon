# Stratorama - Agent

Links your Home Assistant to your [Stratorama](https://stratorama.app) account through a
single **outbound** connection, so you can see and control your devices on a floor plan
from anywhere without exposing Home Assistant to the internet.

## Requirements

- Home Assistant **OS**. Home Assistant apps (formerly called add-ons) need its Supervisor;
  an older **Supervised** install runs them too, though Home Assistant no longer supports it.
- A machine on **amd64** (x86-64) or **aarch64** (64-bit ARM: Raspberry Pi 4 and 5, Home
  Assistant Green and Yellow, most NUC-class boxes). 32-bit ARM (armv7) is not supported.
- A Stratorama account: https://stratorama.app.

## Setup

1. In Stratorama, open the settings menu (the three-dot menu, top right), then **Home Assistant >
   Connection**, and press **Generate pairing code**. You get an 8-character code, valid for
   10 minutes.
2. In this app's **Configuration** tab, paste the code into **Pairing code** and press
   **Save**. Leave **Tunnel URL** at its default. Home Assistant confirms the save with nothing
   more than a brief toast at the bottom of the screen (or asks to restart, if the app is
   already running): no message is normal, the code is saved.
3. Back on the **Info** tab, **Start** the app. Within a few seconds the Connection panel in
   Stratorama shows **Connected**, and the small Home Assistant mark in the top-right corner of
   the plan turns green.

That is all. The app now holds its own long-lived credential (stored in its `/data`
folder), so restarts and Home Assistant updates reconnect on their own. You can clear the
**Pairing code** field afterwards; it is never needed again unless you disconnect.

## What the app does, and what leaves your home

- It opens one outbound WebSocket to `wss://stratorama.app/agent`. **No port is opened** on
  your network, and Home Assistant is never reachable from the internet through it.
- Through that connection, Stratorama's server asks Home Assistant for the **state of your
  entities** (`GET /api/states`) and sends **service calls for the devices you placed on
  your plan**: lights, switches and covers - turn on, turn off, set brightness and colour,
  open, close, stop, set position. The app itself refuses any other call, whoever asks.
- It also forwards the **state changes** of the five kinds of entity Stratorama shows -
  lights, switches, covers, sensors and binary sensors - and of nothing else: people and device
  trackers (who is home, where each phone is), cameras, media players and every other entity
  stay in your home, in the entity list as much as in the state changes. A sensor that reports
  a location, such as the Companion app's geocoded address, is a sensor and is forwarded like
  any other. What it does forward travels through
  Stratorama's server **in memory only**: it is never written to disk there, and each browser
  or wall panel is only sent the entities that are actually bound to its plan.
- It never reads your history or logbook, never touches automations, and never sends
  Home Assistant credentials anywhere: the Supervisor gives the app a local token that
  stays inside the app. The tokens Home Assistant itself puts in some states (an
  `access_token`, the `?token=` of a camera's picture link, a stream token) are removed, in
  the forms Home Assistant writes them, before a state leaves your home, even from a sensor
  that copies such a link.

The full statement is in Stratorama's privacy policy: https://stratorama.app/privacy.

## Disconnecting

In Stratorama, **Settings > Home Assistant > Connection > Disconnect Home Assistant** revokes
the credential immediately: the connection drops within a second and the app cannot
reconnect until it is paired again with a fresh code. Uninstalling the app removes its
`/data` folder and the credential with it.

## Troubleshooting

Open the app's **Log** tab. When the app stops on purpose (the first three items),
Home Assistant shows it as stopped with an error: nothing will change until the
configuration does, so it does not keep knocking on the relay every minute.

- **"Pairing refused: ..."** - the pairing code is unknown, already used, or older than 10
  minutes. Generate a new one in Stratorama (Settings > Home Assistant > Connection), paste
  it into Pairing code, save, then start the app.
- **"The relay no longer accepts this agent's credential"** - somebody pressed Disconnect
  Home Assistant in Stratorama, or paired another Home Assistant to the same home. Same fix;
  if a fresh code is already in the configuration, the app tries it by itself.
- **"No stored credential and no pairing code in the configuration"** - first start
  without a code. Same fix.
- **The app says Running but Stratorama says Not connected** - a repeating
  `Relay WS error` line means the app cannot reach `stratorama.app` on port 443: check
  your firewall or DNS. The app retries on its own, up to once a minute.
- **"No frame from the relay for 90 s"** - the network dropped the connection silently;
  the app reconnects by itself. Only worth a look if it repeats every few minutes.
- **"Refusing ha:request ... not one of the calls this agent relays"** - Stratorama asked
  for something this version does not relay: update the app.
- **The store shows the app as "Not available"** - your machine is 32-bit (armv7) or
  i386, which the images do not cover.
- **Installation fails while downloading the image** - a transient registry problem;
  retry in a minute. If it persists, open an issue (below).

## Support

- Issues: https://github.com/stratorama/stratorama-addon/issues
- Email: contact@stratorama.app

The app is open source under the MIT licence: https://github.com/stratorama/stratorama-addon.
