# Keepsake

Keepsake is a frontend-only single-page wedding web app for timed media sharing. It is built with plain HTML, CSS, and JavaScript, uses Cloudinary for direct browser uploads and media delivery, and runs entirely as a static site.

The experience is time-based:

- Before the event, guests see a countdown.
- During the upload window, guests can upload photos and videos.
- After the upload window, guests browse the shared gallery.

## Current Setup

- Plain `HTML`, `CSS`, and `JavaScript`
- Single-page layout with three state sections in one `index.html`
- Direct unsigned uploads to Cloudinary
- Invite-aware uploader selection via URL and RSVP lookup
- Local upload count tracking with `localStorage`
- Gallery loaded from Cloudinary tag listings
- No backend
- No framework

## App Flow

### 1. Countdown

Before the event date, the countdown section is shown.

- Displays the event title
- Displays a live `dd:hh:mm:ss` countdown
- Switches automatically to the upload state when the event starts

### 2. Upload

During the upload window, the upload state is shown.

- Heading/status section
- Invite details section
- Upload media section

Upload features:

- Invite key support from `?invite=...`
- RSVP lookup from `RSVP_API_BASE`
- Named guest selection when RSVP data is available
- Unnamed guest fallback when no invite or lookup fails
- Native mobile camera capture
- Standard image/video upload from device storage
- Per-identity upload counts stored in `localStorage`
- Upload limit handling with automatic countdown-to-gallery messaging
- Camera upload cutoff via `cameraUploadCutoffDate`

### 3. Gallery

After the upload window closes, the gallery is shown.

- Responsive media grid
- Guest tag under each item
- Fullscreen lightbox
- Swipe navigation on mobile
- Arrow key navigation on desktop
- Video playback only in the enlarged view
- Download action in the lightbox

## Configuration

Runtime behavior is controlled in [`script.js`](D:/Projects/keepsake/script.js) through `CONFIG`.

```js
const CONFIG = {
  eventTitle: "Keepsake",
  eventDate: "2026-07-25T15:00:00",
  cameraUploadCutoffDate: "2026-07-26T05:00:00",
  uploadDaysAfterEvent: 3,
  uploadLimitPerUser: 10,
  forceState: "upload"
};
```

Notes:

- `eventDate` controls when countdown ends
- `cameraUploadCutoffDate` controls when native camera capture stops
- `uploadDaysAfterEvent` controls when the gallery unlocks
- `forceState` is useful for development and demos

## Cloudinary Requirements

The app expects public Cloudinary values to be provided in `data-` attributes on [`index.html`](D:/Projects/keepsake/index.html):

- `data-cloud-name`
- `data-upload-preset`
- `data-max-file-size-mb`

Uploads use:

- folder naming based on invite identity
- the `wedding-app` tag for gallery discovery
- upload context for the uploader name and invite key

## Project Files

- [`index.html`](D:/Projects/keepsake/index.html): all page sections and UI structure
- [`style.css`](D:/Projects/keepsake/style.css): custom styling layered on Bootstrap
- [`script.js`](D:/Projects/keepsake/script.js): state system, invite flow, uploads, countdown, gallery, and lightbox
- [`TECHNICAL_SPEC.md`](D:/Projects/keepsake/TECHNICAL_SPEC.md): current technical spec

## Local Development

Run the project with any static server.

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Constraints

- Upload counts are browser-local, not globally enforced
- Cloudinary folder counts are not securely available from a frontend-only app
- Gallery loading depends on Cloudinary client-side asset list access and the `wedding-app` tag
- Cloudinary secrets must never be exposed in frontend code

## Technical Spec

The detailed implementation spec lives in [`TECHNICAL_SPEC.md`](D:/Projects/keepsake/TECHNICAL_SPEC.md).
