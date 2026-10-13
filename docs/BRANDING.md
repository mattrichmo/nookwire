# Nookwire — Brand and asset guide

- **Product line:** An inbox for your agents.
- **Concept:** Separate chat sessions connect to one shared inbox, with durable local storage. The design should make that flow clear without implying chats are awake, autonomous or automatically synchronized.
- **Brand direction:** Quiet infrastructure, clear status, precise boundaries. The uppercase `N` symbol is an original creative visual based on a generated N-shaped ribbon, not a modification of the logos of OpenAI, ChatGPT, MCP or Claude.

## Visual system

| Token | Hex | Suggested use |
| --- | --- | --- |
| `ink` | `#101A2F` | Dark app icon, diagrams and outlines |
| `ink_deep` | `#071122` | Diagram background |
| `surface` | `#19264B` | Elevated panels and diagrams |
| `lilac` | `#C9AAFF` | Symbol gradient start, restrained accents |
| `indigo` | `#717AFC` | Symbol gradient midpoint |
| `electric` | `#2565FF` | Symbol gradient end |
| `aqua` | `#64D6E8` | Alternate identity and connection indicator |
| `offwhite` | `#F6F7FF` | Bright text on dark canvas |
| `light_surface` | `#F4F3FF` | Light icon background |

**Typography:** Inter/Inter Display when available, otherwise a clean system sans-serif. Typography is not embedded or shipped as a font file. Use generous spacing. Keep copy legible when viewed in a narrow README or directory listing.

## Asset inventory

### README and general brand (`assets/brand/`)

- `nookwire-hero.png` — README hero illustration: separate agent chat/profile cards connected to a central mailbox, with the Nookwire wordmark and tagline. Illustrative artwork, not a product screenshot.
- `social-preview.png` — 1200×630 social sharing / Open Graph image. It is not an actual screenshot of a running product.
- `architecture-flow.svg` and `architecture-flow.png` — architecture diagram showing separate chat sessions and Box Keys connecting through Nookwire to durable SQLite state. PNG for GitHub/other viewers; SVG source for design edits.
- `wordmark-dark.svg` / `.png` — light type for dark background. `wordmark-light.svg` / `.png` — dark type for light background.
- `mark.svg` — brand gradient monogram. `mark-mono-dark.svg`, `mark-mono-light.svg` — 1-color alternatives.
- `feature-1.png` … `feature-4.png` — explanation cards; **illustrative**, not real product UI.
- `palette.json` — machine-readable palette.
- `original-generated-icon.png`, `original-generated-network.png` — the original generated raster source artwork used to produce the final assets.

### MCP/plugin marketplace and site assets (`assets/marketplace/`)

| File | Dimensions | Use |
| --- | --- | --- |
| `app-icon-512.png` | 512×512 | Primary square listing/app logo |
| `app-icon-1024.png` | 1024×1024 | High-resolution master for listings |
| `app-icon-256.png`, `-128.png`, `-64.png`, `-48.png` | As named | Scaled logos, cards, small listings |
| `app-icon-light-512.png`, `app-icon-light-256.png` | 512/256 square | Light-surface alternate |
| `composer-icon-256.png`, `composer-icon-dark-256.png` | 256×256 | Monochrome composer marks, light/dark UI contexts |
| `composer-icon-512.png`, `composer-icon-dark-512.png` | 512×512 | Large monochrome marks |
| `app-icon.svg`, `app-icon-light.svg` | 1024-square viewBox | Vector app icons |
| `composer-icon.svg`, `composer-icon-dark.svg` | 1024-square viewBox | Vector monochrome marks |
| `favicon-32.png`, `favicon-48.png`, `favicon.ico` | 32/48/multi | Future product website/favicon |
| `apple-touch-icon-180.png` | 180×180 | Future website touch icon |

All square PNGs are standard decodeable PNG files. The app/composer icons are separate from generated marketing covers. Each supported listing icon is under 5 MiB; exact minimum and maximum requirements may change and should be reconfirmed during submission.

## Do and don't

**Do:** use generous clear space around the monogram; pair a square logo with a simple product name; use the dark master by default; use the monochrome composer image when the host asks for one; provide descriptive alt text.

**Don't:** crop the `N` to the edge, paste an OpenAI/ChatGPT logo into it, claim a special relationship with an MCP host, claim that an inactive chat will receive push notifications, or show simulated UI images as actual dashboard screenshots. Nookwire v1 has no dashboard.

## Implementation notes

The README uses `nookwire-hero.png` as its cover to illustrate agent chats connected through a shared inbox. The hand-authored `architecture-flow.svg` and its PNG rendering remain available for technical explanations; the SVG is the editable source. The SVG logo is an independently-authored, scalable approximation of the visual direction; gradient renderers can differ slightly, so the primary `app-icon-512.png` is recommended for a listing. Original generated source images remain available for the other brand assets.

**Legal status:** The name/tagline are selected but not trademark-cleared. The repository remains `UNLICENSED`; the artwork does not change software licensing or public-distribution permissions.

