# Remedy YouTube Caption Overlay — Drupal Module

A lightweight Drupal module that overlays custom **SRT/VTT caption files** on embedded YouTube videos for **ADA Title II and WCAG 2.1 Level AA** compliance — without requiring ownership of the videos.

## The Problem

Many Drupal sites have pages with embedded YouTube videos (via CKEditor, Media, `video_embed_field`, or raw iframes) that lack proper captions. If you don't own those videos, you can't upload captions through YouTube Studio. This module solves that.

## How It Works

The module adds a new **field type** to Drupal called "Remedy YouTube Caption Overlay." Content editors attach this field to any content type and provide:

1. A **YouTube video ID** (the 11-character string from the URL)
2. An **SRT or VTT caption file** upload

At render time, the formatter outputs a responsive YouTube iframe with the caption metadata that JavaScript needs. The JavaScript then automatically:

1. Finds formatter-rendered players and matching existing YouTube iframes on the page
2. Ensures the iframe can be controlled by the YouTube IFrame Player API
3. Wraps the video in a player shell that keeps the overlay, controls, and transcript together
4. Fetches and parses the caption file
5. Overlays synchronized caption text on top of the video using a 100ms polling loop
6. Adds a CC toggle button, custom fullscreen button, and optional scrolling transcript panel

The module can render the captioned player itself or attach to existing direct embeds. For API sync, existing direct embeds may receive YouTube API query parameters, and Drupal oEmbed proxy iframes in modals are replaced with direct YouTube embeds.

### Supported Embed Patterns

The module handles two distinct embed patterns automatically:

**Pattern 1: Direct YouTube iframes** — Standard embeds where a `<iframe src="youtube.com/embed/...">` exists directly in the page DOM. Works with CKEditor paste, `video_embed_field`, raw HTML, etc.

**Pattern 2: Drupal Media oEmbed with lightbox** — Used by LACCD sites (lamission.edu, etc.) and other Drupal sites using core Media with remote video. In this pattern, the page shows a thumbnail with a play button. Clicking opens a Bootstrap modal containing an oEmbed proxy iframe (`/media/oembed?url=...`), which in turn contains the YouTube iframe. The module detects the modal opening, replaces the oEmbed proxy with a direct YouTube embed, and overlays captions inside the modal.

| Embed Method | Pattern | Support |
|---|---|---|
| Remedy YouTube Caption Overlay field formatter | Direct | Yes |
| Raw `<iframe>` in CKEditor | Direct | Yes |
| Media module (remote video, inline) | Direct | Yes |
| `video_embed_field` | Direct | Yes |
| Media module + lightbox (LACCD theme) | oEmbed/Modal | Yes |
| Drupal Media oEmbed + Bootstrap modal | oEmbed/Modal | Yes |

### Visual Layout

```
┌─────────────────────────────────────────────────────┐
│  .yco-container (position: relative)                │
│  ┌───────────────────────────────────────────────┐  │
│  │  <iframe> (original YouTube embed)            │  │
│  │                                               │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  "Welcome to the course"                │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│  [CC]  [Transcript]                                 │
│  ┌───────────────────────────────────────────────┐  │
│  │  00:01  Welcome to the course      ← active   │  │
│  │  00:05  Today we'll discuss...                 │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Requirements

- Drupal core `^10 || ^11` (see `youtube_caption_overlay.info.yml`)
- `drupal:file` (core File module, declared as a dependency)

No dependency on the Media module. Works with any YouTube embed method.

## Installation

The module's directory and machine name remain `youtube_caption_overlay` (the suite display name `Remedy YouTube Caption Overlay` is human-facing only).

1. Copy or clone this repository into your Drupal site's `modules/custom/` folder so the module's own files sit at:

   ```
   modules/custom/youtube_caption_overlay/
   ```

   The `.info.yml` file stem (`youtube_caption_overlay.info.yml`) and the parent folder name must match.

2. Enable the module:

   ```bash
   drush en youtube_caption_overlay
   ```

   Or enable via the Drupal admin UI at `/admin/modules`.

3. Clear caches:

   ```bash
   drush cr
   ```

## Production Deployment Checklist

Before deploying to production:

1. Deploy only the module files needed by Drupal. Local agent files such as `AGENTS.md`, `CLAUDE.md`, and `mempalace.yaml` are not required by the module runtime.
2. Enable the module in a Drupal 10 or 11 environment and rebuild caches with `drush cr`.
3. Confirm the public file system is configured and writable, since caption uploads are stored at `public://youtube_captions` (path is hardcoded in the widget).
4. Test one page with a formatter-rendered video, one page with an existing direct YouTube iframe, and one Bootstrap modal/lightbox embed if the site uses modals.
5. Verify captions, CC toggle, transcript toggle, and custom fullscreen in the target production theme.

## Usage

### For Site Builders

1. Go to **Admin → Structure → Content Types → [Your Type] → Manage Fields**
2. Click **Add field** and select **Remedy YouTube Caption Overlay** (under the Media category)
3. Set **Number of values** to "Unlimited" if you need to caption multiple videos on a single page
4. On the **Manage Display** tab, configure the formatter settings:
   - **Caption font size** — CSS value (e.g., `1.2em`, `16px`)
   - **Caption background** — CSS value (e.g., `rgba(0, 0, 0, 0.75)`)
   - **Caption text color** — CSS value (e.g., `#FFFFFF`)
   - **Show transcript panel** — Toggle the scrolling transcript below the video

### For Content Editors

1. Edit a node that has a YouTube video embedded in the body or a media field
2. Scroll to the **Remedy YouTube Caption Overlay** field
3. Enter the **YouTube Video ID** — the 11-character string after `v=` in the URL
   - Example: For `https://www.youtube.com/watch?v=dQw4w9WgXcQ`, enter `dQw4w9WgXcQ`
4. Upload an **.srt** or **.vtt** caption file
5. Set the language code (e.g., `en`) and label (e.g., `English`)
6. Save the node

The captions will automatically appear on the matching YouTube video.

## Module Structure

All Drupal-facing names below (`youtube_caption_overlay`, file stems, plugin IDs) are stable machine names. Only the human-readable label `Remedy YouTube Caption Overlay` is rebranded.

```
youtube_caption_overlay/
├── youtube_caption_overlay.info.yml        # Module metadata (name, core_version_requirement, file dep)
├── youtube_caption_overlay.module          # hook_theme()
├── youtube_caption_overlay.libraries.yml   # Library "youtube_caption_overlay/youtube_caption_overlay"
├── config/
│   └── schema/
│       └── youtube_caption_overlay.schema.yml  # Field/widget/formatter schemas
├── src/
│   └── Plugin/
│       └── Field/
│           ├── FieldType/
│           │   └── YoutubeCaptionOverlayItem.php       # id: youtube_caption_overlay
│           ├── FieldWidget/
│           │   └── YoutubeCaptionOverlayWidget.php     # id: youtube_caption_overlay_widget
│           └── FieldFormatter/
│               └── YoutubeCaptionOverlayFormatter.php  # id: youtube_caption_overlay_formatter
├── templates/
│   └── youtube-caption-overlay.html.twig   # Theme hook: youtube_caption_overlay
├── js/
│   ├── srt-parser.js                       # SRT file parser
│   ├── vtt-parser.js                       # WebVTT file parser
│   └── youtube-caption-overlay.js          # Main behavior (DOM, API, sync, modal handling)
├── css/
│   └── youtube-caption-overlay.css         # Overlay and control styles
└── README.md
```

## Architecture Details

### Field Type

The field type ID is `youtube_caption_overlay` (label `Remedy YouTube Caption Overlay`, category `Media`). It stores four columns per value:

| Column | Type | Description |
|--------|------|-------------|
| `youtube_video_id` | `varchar(20)` | The 11-character YouTube video ID |
| `caption_fid` | `int unsigned` | Drupal file entity ID for the SRT/VTT file (indexed) |
| `caption_lang` | `varchar(10)` | ISO 639-1 language code (widget default: `en`) |
| `caption_label` | `varchar(255)` | Human-readable label (widget default: `English`) |

The field constraint enforces the video ID matches `^[a-zA-Z0-9_-]{11}$`. The widget restricts uploads to `srt`/`vtt` extensions with a 5 MB size cap, stored under `public://youtube_captions`, and marks files permanent on save.

### Formatter (Rendered Player Pattern)

The formatter (`youtube_caption_overlay_formatter`) builds a render array using the `youtube_caption_overlay` theme hook and attaches the `youtube_caption_overlay/youtube_caption_overlay` library. The Twig template emits a `.yco-field-wrapper.yco-player` element with caption configuration carried in `data-*` attributes (`data-video-id`, `data-caption-url`, `data-caption-format`, `data-caption-font-size`, `data-caption-background`, `data-caption-color`, `data-show-transcript`) and a responsive `<iframe>` pointing at `youtube.com/embed/VIDEO_ID?enablejsapi=1&fs=0&origin=...`. The JavaScript reads those attributes, registers the video/caption pair, adds overlay controls, and starts synchronization through the YouTube IFrame Player API.

### JavaScript Runtime

The JS uses a dual-strategy approach:

**Strategy 1 — Direct iframes:**
1. **DOM Scanning** — Uses `Drupal.behaviors` and `once()` to find `.yco-field-wrapper` elements, with legacy `.yco-data` support retained for compatibility
2. **Iframe Wrapping** — Wraps matched iframes in a `.yco-player` shell with a `.yco-container` video frame, caption overlay, and controls
3. **Caption Sync** — Polls `player.getCurrentTime()` at 100ms intervals and updates the overlay with the matching cue

**Strategy 2 — oEmbed lightbox modals:**
1. **Caption Registry** — Builds a registry of video IDs to caption configs from all formatter wrappers
2. **Modal Observer** — Listens for Bootstrap `shown.bs.modal` events and uses a `MutationObserver` fallback
3. **oEmbed Replacement** — When a lightbox modal opens containing a `.media-oembed-content` iframe, extracts the video ID from the oEmbed URL, looks it up in the registry, and replaces the oEmbed proxy with a direct `youtube.com/embed/VIDEO_ID?enablejsapi=1` iframe
4. **Overlay in Modal** — Wraps the direct iframe with the caption overlay inside the modal's ratio wrapper

**Shared:**
- **API Loading** — Loads the YouTube IFrame API once, preserving any existing `onYouTubeIframeAPIReady` callback
- **CC Toggle** — Toggles caption visibility without stopping the sync loop (instant resume)
- **Transcript** — Builds a scrollable panel from the parsed cues with auto-scroll to the active cue

### Caption Parsers

Both parsers normalize to `[{ start: seconds, end: seconds, text: string }]`:

- **SRT Parser** — Handles `HH:MM:SS,mmm` timestamps (also accepts `.`), splits blocks by sequence number
- **VTT Parser** — Handles `HH:MM:SS.mmm` and `MM:SS.mmm` timestamps, strips VTT tags (`<v>`, `<c>`, etc.), ignores positioning metadata

## Accessibility

- Caption overlay: `aria-live="polite"`, `aria-atomic="true"`, `role="status"`
- CC toggle: `role="button"`, `aria-pressed` state, visible focus indicator
- Transcript panel: `role="log"`, `aria-label="Video transcript"`
- All interactive elements are keyboard accessible
- `@media (prefers-contrast: high)` — High-contrast caption styling with borders
- `@media (prefers-reduced-motion: reduce)` — Disables transitions and smooth scrolling
- Caption text is HTML-escaped to prevent XSS from caption file content

## Known Limitations

1. **Fullscreen** — The module uses a custom fullscreen button so the overlay remains visible. Native YouTube iframe fullscreen is disabled on managed embeds because it cannot include external overlay captions.
2. **YouTube API** — The iframe must accept `enablejsapi=1`. Some restricted embeds may not allow this, but it works for the vast majority.
3. **Timing** — The 100ms polling loop means captions may appear up to 100ms late. This is imperceptible and matches industry-standard approaches.
4. **Dynamic content** — YouTube iframes loaded via AJAX will be picked up automatically if `Drupal.attachBehaviors()` is called (standard Drupal practice).
5. **oEmbed modal re-open** — When a lightbox modal is closed and reopened for the same video, the module replaces the oEmbed proxy each time. This is handled gracefully via the `.yco-container` parent check.

## Caption File Formats

### SRT Example

```
1
00:00:01,000 --> 00:00:04,000
Welcome to the course.

2
00:00:05,000 --> 00:00:08,500
Today we'll discuss accessibility.
```

### VTT Example

```
WEBVTT

00:00:01.000 --> 00:00:04.000
Welcome to the course.

00:00:05.000 --> 00:00:08.500
Today we'll discuss accessibility.
```

## License

This project is licensed under the [GNU General Public License v2.0 or later](https://www.gnu.org/licenses/gpl-2.0.html), consistent with Drupal's licensing.
