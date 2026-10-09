# Home Assistant

Live [Home Assistant](https://www.home-assistant.io/) entities on the Logitech MX Creative
Keypad. Each key shows one entity with an icon matching its type and a colour matching its
state; one press toggles it (or runs it, for scenes, scripts and buttons). State arrives by
push over the Home Assistant WebSocket API, so a light switched from the wall or the app
repaints its key within a few hundred milliseconds.

## Keys

All actions appear in Logi Options+ under **Home Assistant**. Drag them onto any
profile; the plugin has no application binding, so a page of tiles keeps working while you
type elsewhere.

| Group | Action | Face | Press |
| --- | --- | --- | --- |
| Home Assistant lights, switches, … (one group per domain) | One action per configured entity, named by its label | The entity's glyph on a rounded square: coloured while on (amber for lights, green for switches, blue for fans, teal for covers, purple for playing media, orange or blue for heating or cooling), dark grey while off, dark red with N/A while unavailable, MISSING when Home Assistant has no such entity. States that are not just on or off get a caption (OPEN, CLOSED, LOCKED, UNLOCKED, HEAT, COOL, PLAYING, DOCKED…). Label: the configured label, else the entity's friendly name. | Toggle the entity. Scenes, scripts and buttons run; automations trigger; locks lock or unlock by their state. The key flashes white for a moment on every press. |
| Home Assistant status | Home Assistant connection | The Home Assistant logo: green ONLINE while subscribed, red TOKEN when the token is rejected, slate WAIT while connecting, grey OFFLINE or CONFIG. Label: the Home Assistant version. | Reconnect now. |

Only configured entities get keys. In the Options+ picker they are grouped by domain
("Home Assistant lights", "Home Assistant switches"), named by their label, with the entity
id in the description and the entity's glyph as the symbol. The plugin icon and the connection
key use the official Home Assistant logomark (see NOTICE.md for its licence). While the plugin
is not connected every entity key reads "HA offline" (or "bad token") under a greyed-out glyph.

Keys are identified by entity id (`light.the_office_c1` becomes the action
`ha_light__the_office_c1`), so a key placed on a profile survives reordering or relabelling the
config and disappears only when its entity is removed.

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

## Configuration

`~/.config/home-assistant/config.json`:

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

## Install

```sh
npm install
npm run build
npm run link      # symlinks dist/ into the Plugin Service and reloads the plugin
```

Then in Logi Options+ open your keypad, choose a profile, and add actions from
**Home Assistant**.

The action picker caches the contents of a group once it has shown it (observed with
Options+ 2.8 in the Orca Console plugin). An entity added to a domain whose group the picker
has already shown may not appear until the Plugin Service is restarted, while an entity in a
new domain appears at once because it creates a new group.
Log file: `~/Library/Application Support/Logi/LogiPluginService/Logs/plugin_logs/HomeAssistant.log`.

For a distributable package run `npm run build:pack` and double-click
`HomeAssistant.lplug4`.

## Development

```sh
npm run watch     # rebuild, relink and reload on every change
npm test          # node --test over tests/**/*.test.ts (TypeScript, no build step)
npm run icons     # regenerate Icon256x256.png, src/logo.ts and the connection key's SVGs (needs rsvg-convert)
npm run deck      # render every glyph and face variant to deck.png
npm run smoke     # build, then run dist/ against a fake Plugin Service and a fake Home Assistant
```

The tests include a fake Home Assistant (a local `ws` server) that drives the full
authenticate, subscribe, toggle and reconnect flow.

## Known limits and ideas

- Options+ insets a Node plugin's image inside the key and writes the label underneath, so
  the glyph plus a short caption is the whole face. Full-canvas faces need the C# SDK.
- Only command keys for now. A dial action for brightness or volume, and sensor keys showing
  a value, would fit the same store.
- Each entry is one entity; `data` lets a key call a specific service, but there is no
  per-key long-press or second action.
- macOS only.
