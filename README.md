# Logitech MX Creative Console: Home Assistant

A plugin for the [Logi Actions SDK](https://logitech.github.io/actions-sdk-docs/nodejs/introduction/)
(Node.js) targeting the MX Creative Keypad. It follows the structure of
[logitech-mx-keypad](https://github.com/maciejmajewski/logitech-mx-keypad): each plugin lives in
`plugins/<name>` and builds to an `.lplug4` package that Logi Options+ installs.

| Plugin | What it does |
| --- | --- |
| [`home-assistant`](plugins/home-assistant) | One key per [Home Assistant](https://www.home-assistant.io/) entity: the face shows the entity's live state with an icon matching its type, a press toggles it. |

## Requirements

- macOS with Logi Options+ 2.2 or newer (Plugin API 6.3, which added Node.js plugins on macOS).
- Node.js 22.18 or newer for development. At runtime the Logi Plugin Service uses its own
  bundled Node 22.
- A Home Assistant instance reachable from this Mac and a long-lived access token for it.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

Per plugin, inside `plugins/<name>`:

```sh
npm run watch        # build, link into the Plugin Service and hot-reload on change
npm run link         # link dist/ into ~/Library/Application Support/Logi/LogiPluginService/Plugins/<Name>
npm run unlink
npm run build:pack   # produce <Name>.lplug4 for distribution
```

Plugin logs land in `~/Library/Application Support/Logi/LogiPluginService/Logs/plugin_logs/<Name>.log`.

## Licence

MIT. See [NOTICE.md](NOTICE.md) for third-party attributions.
