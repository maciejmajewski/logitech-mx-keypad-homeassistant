# Third-party notices

## Code adapted from MIT-licensed projects

### herdr-logi-plugin

[herdr-logi-plugin](https://github.com/niklasberglund/herdr-logi-plugin) by Niklas Berglund,
MIT License. This plugin adapts code from it:

- `src/bridge.ts`: the live key-face bridge that answers `GetActionImage` / `GetActionText` on
  the Logi Plugin SDK's private WebSocket client and pushes `ActionImageChanged` events, as
  described in its `docs/dynamic-tile-images.md`.
- `src/png.ts`: the dependency-free PNG encoder (CRC table, chunk writer, RGBA rows).
- `src/actions.ts`: the single press queue, so rapid key presses run one at a time.
- The zero-width-space blank label and the 10-character label cut in `src/tiles.ts`.

### @logitech/plugin-toolkit

[`@logitech/plugin-toolkit`](https://www.npmjs.com/package/@logitech/plugin-toolkit) by
Logitech, MIT License. `tsup.config.ts`, the `package/` layout and the npm scripts follow its
TypeScript project template.

### ws

[ws](https://github.com/websockets/ws), MIT License, is bundled into the plugin as the
WebSocket client that talks to Home Assistant.

## Home Assistant logo (not MIT)

`assets/ha-logomark-*.svg`, and everything generated from them
(`package/metadata/Icon256x256.png`, `package/action*/ha_connection.svg`, `src/logo.ts`),
are the Home Assistant logomark from [home-assistant/assets](https://github.com/home-assistant/assets),
licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The logo is a
trademark of the Open Home Foundation and is not available for commercial use without its
written permission; this plugin is free and non-commercial. The MIT licence of this repository
does not extend to these files.

## Documentation

The [Logitech Actions SDK documentation](https://logitech.github.io/actions-sdk-docs/) and the
[Home Assistant WebSocket API](https://developers.home-assistant.io/docs/api/websocket/)
were the API references.

## Pixel glyphs

The 16x16 glyphs in `src/icons.ts` were drawn for this plugin as bitmaps. They show the same
subjects as the [Material Design Icons](https://pictogrammers.com/library/mdi/) Home Assistant
uses per domain (bulb, padlock, fan, and so on) so that keys read the same way as the Home
Assistant UI, but no MDI artwork was traced or converted. The 5x7 pixel font in `src/png.ts`
is a plain bitmap font.
