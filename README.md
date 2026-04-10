# Keepsake

Keepsake is a frontend-only single-page website for collecting and sharing event memories. It is built with plain HTML, CSS, and JavaScript, and uses Cloudinary for direct browser uploads, media hosting, and delivery.

The experience is intentionally time-based:

- Before the event: guests see a countdown.
- During the upload window: guests can contribute a limited number of photos or videos.
- After the upload window: everyone browses the shared gallery.

## Stack

- HTML
- CSS
- JavaScript
- Cloudinary
- `CONFIG`-driven client-side state

## Principles

- No backend
- No frameworks
- Single-page website
- Static-site friendly
- Simple, modular frontend architecture

## How the Site Works

Keepsake uses one HTML page with a single app root. JavaScript decides which screen to render into that root based on the event date and upload window.

Primary states:

- `countdown`
- `upload`
- `gallery`

This keeps the UX simple while still giving the project a clean state-driven structure.

## Project Files

Current core files:

- [`index.html`](D:/Projects/keepsake/index.html) as the main page shell
- [`style.css`](D:/Projects/keepsake/style.css) for presentation
- [`script.js`](D:/Projects/keepsake/script.js) for app bootstrap and state orchestration
- [`media.js`](D:/Projects/keepsake/media.js) for the media manifest

The full implementation plan is documented in [`TECHNICAL_SPEC.md`](D:/Projects/keepsake/TECHNICAL_SPEC.md).

## Recommended File Structure

This keeps your current setup mostly intact:

```text
keepsake/
├── index.html
├── style.css
├── script.js
├── media.js
├── README.md
├── TECHNICAL_SPEC.md
├── js/
│   ├── state.js
│   ├── countdown.js
│   ├── upload.js
│   └── gallery.js
└── assets/
    ├── icons/
    └── placeholders/
```

## Module Plan

### App Entry

`script.js`

- Initializes the application
- Reads `CONFIG`
- Determines the active app state
- Mounts the correct screen into `#app`

### State System

`js/state.js`

- Resolves `countdown`, `upload`, or `gallery`
- Calculates upload end time
- Provides shared time formatting helpers

### Countdown

`js/countdown.js`

- Renders the pre-event screen
- Updates the timer every second
- Triggers a rerender when the event starts

### Upload

`js/upload.js`

- Renders upload UI
- Validates selected files
- Uploads media to Cloudinary
- Tracks upload count with `localStorage`
- Handles limit-reached messaging and countdown

### Gallery

`js/gallery.js`

- Renders the media grid
- Opens a fullscreen modal
- Supports keyboard and swipe navigation

### Media Manifest

`media.js`

- Holds the media list
- Stores item metadata such as type, URL, alt text, and poster

## Configuration

Keepsake should be controlled through a central `CONFIG` object.

Example:

```js
const CONFIG = {
  eventTitle: "Keepsake",
  eventDate: "2026-07-25T15:00:00",
  uploadDaysAfterEvent: 3,
  uploadLimitPerDevice: 10,
  cloudName: "your-cloud-name",
  uploadPreset: "keepsake_unsigned",
  forceState: null // "countdown" | "upload" | "gallery"
};
```

## Cloudinary Setup

Keepsake is designed to use Cloudinary for direct browser uploads.

You will need:

- Cloudinary account
- Cloud name
- Unsigned upload preset
- Optional upload folder such as `keepsake/`

Reference upload flow:

```js
async function uploadFile(file, config) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", config.uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/upload`,
    {
      method: "POST",
      body: formData
    }
  );

  const data = await response.json();

  return {
    id: data.public_id,
    type: file.type.startsWith("video") ? "video" : "image",
    url: data.secure_url
  };
}
```

## State Logic

- If `forceState` is set, use it.
- If the current time is before `eventDate`, show the countdown.
- If the current time is within the upload window, show uploads.
- Otherwise, show the gallery.

## Media Model

Media should be represented as plain objects in `media.js`.

Example:

```js
const MEDIA = [
  {
    id: "photo-001",
    type: "image",
    url: "https://res.cloudinary.com/your-cloud-name/image/upload/v1/keepsake/photo-001.jpg",
    alt: "Ceremony moment"
  },
  {
    id: "video-001",
    type: "video",
    url: "https://res.cloudinary.com/your-cloud-name/video/upload/v1/keepsake/video-001.mp4",
    poster: "https://res.cloudinary.com/your-cloud-name/video/upload/v1/keepsake/video-001-poster.jpg"
  }
];
```

## Local Development

Because this is a static single-page frontend site, you can run it with any simple static server.

Examples:

```powershell
python -m http.server 8000
```

or

```powershell
npx serve .
```

Then open `http://localhost:8000`.

## Build Order

1. Finalize the `CONFIG` schema.
2. Implement the state system.
3. Build the countdown screen.
4. Build the upload UI and Cloudinary integration.
5. Add upload count and limit handling.
6. Build the limit-reached countdown state.
7. Build the gallery and modal.
8. Add keyboard and swipe navigation.

## Known Constraints

- Upload limits stored in `localStorage` are per browser/device, not truly per user.
- Without a backend, there is no secure user identity or global upload quota enforcement.
- Auto-fetching all Cloudinary assets may need a later enhancement if you do not want to maintain `media.js` manually.

## Documentation

- Full technical spec: [`TECHNICAL_SPEC.md`](D:/Projects/keepsake/TECHNICAL_SPEC.md)
