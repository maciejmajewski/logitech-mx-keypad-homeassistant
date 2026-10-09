# Home Assistant for the Logitech MX Creative Console

A plugin for the [Logi Actions SDK](https://logitech.github.io/actions-sdk-docs/nodejs/introduction/)
(Node.js) targeting the MX Creative Keypad, built like
[logitech-mx-keypad](https://github.com/maciejmajewski/logitech-mx-keypad).

Live [Home Assistant](https://www.home-assistant.io/) entities on the keypad. Each key shows
one entity with an icon matching its type and a colour matching its state; one press toggles
it (or runs it, for scenes, scripts and buttons). State arrives by push over the Home
Assistant WebSocket API, so a light switched from the wall or the app repaints its key within
a few hundred milliseconds.

## Disclaimer

This plugin was vibe-coded with Claude for personal use. Every effort was made to review,
check, test and verify that it works properly, but nothing is guaranteed; use it at your own
risk.

It was developed and tested on macOS only.

## Requirements

- Logi Options+ with a Logi Plugin Service that runs Node.js plugins.
- Node.js 22 or newer to build. At runtime the Logi Plugin Service uses its own bundled Node.
- A Home Assistant instance reachable from this computer and a long-lived access token for it.

## Installation

1. **Get a HA token.** In Home Assistant open your profile (bottom of the sidebar), the
   **Security** tab, **Long-lived access tokens**, **Create token**. Copy it; it is shown once.
2. **Write the config** at `~/.config/logitech-options-plus-home-assistant/config.json`
   (create the folder). The minimum is the URL, the token and the entities you want keys for:

   ```json
   {
     "url": "https://homeassistant.example.pl/",
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "entities": ["light.the_office_c1", "light.the_office_c4"]
   }
   ```

   Entity ids are listed in Home Assistant under **Settings**, **Devices & services**,
   **Entities**. See [Configuration](#configuration) for labels, icons and custom services.
3. **Build and link the plugin:**

   ```sh
   npm install
   npm run build
   npm run link      # symlinks dist/ into the Plugin Service's plugin folder and reloads the plugin
   ```

   For a distributable package instead, run `npm run build:pack` and double-click
   `HomeAssistant.lplug4`. `npm run unlink` removes the symlink again.
4. **Place the keys.** In Logi Options+ open your keypad, pick a profile and a page, and add
   actions from the **Home Assistant** groups: one group per domain ("Home Assistant lights"),
   one action per configured entity, plus **Home Assistant connection** under "Home Assistant
   status". Keys light up as soon as the plugin is subscribed.

Check the connection key or the log if nothing lights up. On macOS the log is
`~/Library/Application Support/Logi/LogiPluginService/Logs/plugin_logs/HomeAssistant.log`.
"bad token" under a key means Home Assistant rejected the token; "HA offline" means the URL
is unreachable; "no config" means the file is missing or has no url or token.

The Options+ action picker caches the contents of a group once it has shown it (observed with
Options+ 2.8). An entity added to a domain whose group the picker has already shown may not
appear until the Plugin Service is restarted, while an entity in a new domain appears at once
because it creates a new group.

## Configuration

`~/.config/logitech-options-plus-home-assistant/config.json`:

```json
{
  "url": "https://homeassistant.example.pl/",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "entities": [
    { "entity": "light.the_office_c1", "label": "Office C1" },
    { "entity": "light.the_office_c4", "label": "Office C4" },
    { "entity": "light.the_office_c5", "label": "Office C5" },
    { "entity": "light.xmas_the_office_olas_desk", "label": "Xmas desk", "icon": "mdi:string-lights" },
    "switch.desk_outlet",
    { "entity": "scene.movie_night", "label": "Movie" },
    { "entity": "light.desk", "label": "Desk 40%", "service": "light.turn_on", "data": { "brightness_pct": 40 } }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `url` | Base URL of Home Assistant, with the port if it is not the default. `http` and `https` both work; the plugin talks to `/api/websocket`. Also `HOME_ASSISTANT_URL` in the environment. |
| `token` | A long-lived access token: in Home Assistant open your profile, **Security**, **Long-lived access tokens**, **Create token**. Also `HOME_ASSISTANT_TOKEN`, or `tokenFile` with a path to a file holding just the token. |
| `reconnectMs` | Delay before the first reconnect after a drop (default 3000); it doubles per failed attempt up to 30 s. |
| `entities` | One key each (up to 64; duplicates are dropped). An entry is an entity id, or an object with: |
| `entity` | The entity id (`domain.object_id`). |
| `label` | Shown under the key and in the picker. Defaults to the entity's friendly name. |
| `icon` | Glyph override: a glyph name or an `mdi:` name (see Icons). |
| `service` | Service to call instead of the default, as `domain.service`. |
| `data` | Service data merged into the call. |

Edits to the file apply within two seconds: a changed `url` or `token` reconnects, and when
an entity is added, removed or relabelled the plugin restarts itself once so the new set of
keys registers and the Options+ picker follows (Options+ may need to be reopened to refresh
its list).

A rejected token is reported on the connection key and in the log and is not retried, because
Home Assistant counts failed logins per IP address and can ban the address. Fix the token in
the file, or press the connection key to try again.

Set `HOME_ASSISTANT_DEBUG=1` in the Plugin Service environment for SDK message traces, and
`HOME_ASSISTANT_CONFIG` to use another config file.

## Keys

The plugin has no application binding, so a page of keys keeps working while you type
elsewhere. Keys are named by entity id (`light.the_office_c1` is the action
`ha_light__the_office_c1`), so a key placed on a profile survives reordering or relabelling the
config and disappears only when its entity is removed.

What an entity key shows:

- The entity's glyph (see [Icons](#icons)) on a coloured square while on: amber for lights,
  green for switches, blue for fans, teal for covers, purple for playing media, orange or blue
  for heating or cooling.
- Dark grey while off; dark red with N/A while unavailable; MISSING when Home Assistant has no
  such entity; greyed out with "HA offline" or "bad token" underneath while not connected.
- A caption for states that are not just on or off: OPEN, CLOSED, LOCKED, UNLOCKED, HEAT,
  COOL, PLAYING, DOCKED and so on.
- Its label: the configured one, else the entity's friendly name.

What a press does:

- Toggles the entity. Scenes, scripts and buttons run; automations trigger; locks lock or
  unlock depending on their state. `service` in the config replaces the default.
- Flashes the key white for a moment, so a press on a scene or script is visible too.

The **Home Assistant connection** key shows the Home Assistant logo: green ONLINE while
subscribed, red TOKEN when the token is rejected, slate WAIT while connecting, grey OFFLINE or
CONFIG. Its label is the Home Assistant version. Pressing it reconnects.

## Icons

The glyph is chosen the way the Home Assistant frontend chooses its icon, in this order:

1. `icon` in the config entry: a glyph name from the table below or an `mdi:` name;
2. the entity's `icon` attribute (set in Home Assistant under the entity's settings), if it
   maps to a glyph;
3. the entity's `device_class` (outlet, garage, blind, tv, speaker…);
4. the domain.

| Glyph | Domains and classes | Some `mdi:` names |
| --- | --- | --- |
| `bulb` | light | lightbulb, led-* |
| `lamp` | | ceiling-light, floor-lamp, desk-lamp, lamp, wall-sconce |
| `strip` | | led-strip |
| `lights` | | string-lights |
| `tree` | | pine-tree |
| `power` | switch | power |
| `outlet` | switch with device_class outlet | power-socket-*, power-plug |
| `toggle` | input_boolean, switch with device_class switch | toggle-switch, light-switch |
| `fan` | fan | fan |
| `blinds` | cover (blind, shade, shutter, curtain, window, awning) | blinds, roller-shade, window-shutter, curtains |
| `garage` | cover with device_class garage, gate or door | garage, gate, door |
| `lock` / `unlock` | lock (open padlock while unlocked) | lock, lock-open |
| `play` | media_player | play |
| `tv` | media_player with device_class tv | television, monitor, cast |
| `speaker` | media_player with device_class speaker or receiver | speaker, music |
| `thermometer` | climate, water_heater | thermostat, thermometer |
| `flame` | | fire, radiator |
| `snowflake` | | air-conditioner, snowflake |
| `sparkle` | scene | palette, star, creation |
| `script` | script | script, file |
| `robot` | automation | robot |
| `vacuum` | vacuum | robot-vacuum, vacuum |
| `drop` | humidifier, valve | water, air-humidifier |
| `bell` | siren, alarm_control_panel | bell, siren, alarm, bullhorn |
| `camera` | camera | camera, cctv, video |
| `remote` | remote | remote |
| `button` | button, input_button | gesture-tap, button |
| `house` | group | home |
| `question` | anything else | |

Run `npm run deck` to render every glyph and face variant into `deck.png`.

## How it works

- On start the plugin opens one WebSocket to `/api/websocket`, authenticates with the token,
  calls `get_states` and keeps the configured entities, then `subscribe_events` for
  `state_changed`. Every event for a configured entity repaints just that key. A ping every
  30 s detects a dead connection; the plugin reconnects with backoff.
- Key presses map to `call_service`: `light.toggle`, `switch.toggle`, `cover.toggle`,
  `scene.turn_on`, `script.turn_on`, `button.press`, `automation.trigger`, `lock.lock` /
  `lock.unlock`, and `homeassistant.toggle` for anything else, always targeted at the one
  entity. The new state arrives back over the subscription.
- On start the plugin writes an icon and a picker symbol SVG per configured entity into its
  own package folder (`actionicons/`, `actionsymbols/`), named after the action, because
  Options+ finds them by name on disk.
- Key faces are 80x80 PNGs rendered in-process (no native dependencies) from 16x16 pixel
  glyphs; the connection key draws the Home Assistant logomark from a 48x48 mask generated
  at build time (`scripts/gen-logo.ts`, needs `rsvg-convert` from librsvg). The Node SDK has no public image API, so `src/bridge.ts` answers the Plugin
  Service's `GetActionImage` and `GetActionText` requests directly on the SDK's WebSocket
  client and pushes `ActionImageChanged` events. This relies on private SDK internals;
  `@logitech/plugin-sdk` is pinned to 0.1.1 and the bridge degrades to static icons with a
  logged error if they change.

## Development

```sh
npm run typecheck
npm run watch     # rebuild, relink and reload on every change
npm test          # node --test over tests/**/*.test.ts (TypeScript, no build step)
npm run icons     # regenerate Icon256x256.png, src/logo.ts and the connection key's SVGs (needs rsvg-convert)
npm run deck      # render every glyph and face variant to deck.png
npm run smoke     # build, then run dist/ against a fake Plugin Service and a fake Home Assistant
```

The tests include a fake Home Assistant (a local `ws` server) that drives the full
authenticate, subscribe, toggle and reconnect flow.

## Licence

MIT, except the Home Assistant logo. See [NOTICE.md](NOTICE.md) for third-party attributions.
