# LEU visual identity

LEU's mark combines two rounded L-shaped layers with a lifted square. The forms suggest an app leaving a tidy workspace. Forest green and mint extend the existing interface palette.

## Assets

All deliverables live in [`assets/branding`](../assets/branding/).

| Asset                                     | Purpose                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `leu-icon.svg`                            | Editable desktop icon master, including its transparent corners   |
| `leu-mark.svg`                            | Standalone symbol for light surfaces                              |
| `leu-logo-light.svg`                      | Transparent horizontal logo for light surfaces                    |
| `leu-logo-dark.svg`                       | Transparent horizontal logo for dark surfaces                     |
| `leu-logo-mono.svg`                       | Single-color horizontal logo; inline SVG inherits `currentColor`  |
| `leu-logo-*.png`, `leu-mark.png`          | Transparent PNG exports at four times the SVG dimensions          |
| `app-icons/leu.ico`                       | Windows executable, window, and taskbar icon                      |
| `app-icons/leu-*.png`                     | 16, 20, 24, 32, 40, 48, 64, 128, 256, 512, and 1024 pixel exports |
| `ui-icons.json`                           | Editable path source for the 22 interface icons                   |
| `icons/*.svg`, `ui-icons.svg`             | Individual SVG icons and an SVG symbol sprite                     |
| `preview.html`, `brand-preview.png`       | Local identity and small-size review sheet                        |
| `concept-board.png`, `concept-prompt.txt` | Original AI exploration and the exact generation prompt           |

The logo lettering is outlined geometry and needs no installed fonts. Give the symbol clear space of at least one floating-square width. Use the complete icon at 16 pixels or larger, and interface icons at 16–24 pixels. Keep the mint and white layers intact on the dark desktop tile.

## Palette

| Color   | Value     | Role                                            |
| ------- | --------- | ----------------------------------------------- |
| Forest  | `#123F32` | Light-surface wordmark and symbol               |
| Emerald | `#157450` | Existing interface accent                       |
| Mint    | `#74CBA1` | Lifted square, lower layer, dark-surface accent |
| Chalk   | `#F5F7F4` | Presentation background                         |

## Regenerating exports

Run `pnpm icons:build` after editing the SVG masters or `ui-icons.json`. This replaces the derived PNG, ICO, individual icon, sprite, and preview files. It uses the existing Electron runtime in a hidden window, requires no network access, and adds no dependencies. The Windows ICO contains nine PNG-compressed frames from 16 through 256 pixels for Windows 11 and high-DPI displays.

The interface imports `leu-icon.svg` directly and draws interface icons from `ui-icons.json`, so it always uses the editable sources. Electron Forge embeds the ICO in the executable and copies it into the packaged resources for the window icon. Regenerate before packaging if you change the icon master.

The concept board was generated with the built-in image generation tool. The production SVG sources were drawn as native vector assets from that direction, and their PNG/ICO exports are rendered from those sources.
