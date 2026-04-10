# Keepsake Technical Specification

## 1. Project Overview

Keepsake is a frontend-only single-page website built with plain HTML, CSS, and JavaScript. It uses Cloudinary for media uploads, hosting, and delivery.

The experience moves through three user-facing phases:

1. Countdown: guests see the event title and a live countdown before uploads open.
2. Upload: guests can upload a limited number of photos or videos during a defined post-event window.
3. Gallery: after the upload window closes, guests can browse all approved media in a fullscreen gallery.

There is no backend, no framework, and no multi-page routing. Runtime behavior is controlled through a central `CONFIG` object, and the active interface is rendered into a single page root.

## 2. Core Constraints

- Frontend only: no server, no database, no API framework.
- Stack: plain HTML, CSS, JavaScript.
- Single-page website architecture.
- Media storage and delivery handled by Cloudinary.
- App behavior must be configurable from JavaScript via a single `CONFIG` object.
- The app must remain functional as a static site.

## 3. Product Goals

- Build anticipation before the event.
- Allow a short contribution window after the event.
- Enforce a per-device upload limit.
- Present uploaded media as a polished shared memory gallery.
- Keep the implementation simple enough to host statically.
- Maintain the full experience within one HTML page.

## 4. Functional Scope

### 4.1 Included

- Countdown screen before the event.
- Upload screen during the upload window.
- Per-device upload limit using `localStorage`.
- Gallery screen after the upload window.
- Fullscreen modal for image/video viewing.
- Desktop arrow navigation and mobile swipe navigation.
- Configurable forced state for demos and testing.
- Direct browser uploads using a Cloudinary unsigned upload preset.
- Media loaded from Cloudinary URLs.

### 4.2 Deferred / Not Finalized

- Invite system.
- Guest identity management.
- Google Sheets integration.
- Cross-device upload tracking.
- Reactions and comments.

## 5. Technical Architecture

### 5.1 Data Model

The app uses two runtime data sources and one root mount point:

- `CONFIG`: controls timing, limits, labels, Cloudinary values, and environment-specific behavior.
- `MEDIA`: a frontend media manifest containing Cloudinary URLs and metadata.
- `#app`: the single root container used to render the active state.

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

const MEDIA = [
  {
    id: "welcome-photo",
    type: "image",
    url: "https://res.cloudinary.com/your-cloud-name/image/upload/v1/keepsake/welcome.jpg",
    alt: "Guests arriving"
  },
  {
    id: "dance-floor",
    type: "video",
    url: "https://res.cloudinary.com/your-cloud-name/video/upload/v1/keepsake/dance-floor.mp4",
    poster: "https://res.cloudinary.com/your-cloud-name/video/upload/v1/keepsake/dance-floor-poster.jpg"
  }
];
```

### 5.2 State System

The application has three primary states:

- `countdown`
- `upload`
- `gallery`

State resolution rules:

1. If `CONFIG.forceState` is set, use it immediately.
2. If current time is before `eventDate`, show `countdown`.
3. If current time is between `eventDate` and `eventDate + uploadDaysAfterEvent`, show `upload`.
4. If current time is after the upload window, show `gallery`.

Reference logic:

```js
function getAppState(config) {
  if (config.forceState) return config.forceState;

  const now = new Date();
  const eventDate = new Date(config.eventDate);

  if (now < eventDate) return "countdown";

  const uploadEnd = new Date(eventDate);
  uploadEnd.setDate(uploadEnd.getDate() + config.uploadDaysAfterEvent);

  if (now <= uploadEnd) return "upload";

  return "gallery";
}
```

## 6. UI States

### 6.1 Countdown

Purpose:
- Build anticipation before uploads open.

Required UI:
- Event title.
- Optional subtitle or supporting message.
- Live countdown timer.

Behavior:
- No upload UI is visible.
- Timer updates every second.
- App automatically transitions to `upload` once the event time is reached.

### 6.2 Upload

Purpose:
- Allow guests to contribute media during the post-event window.

Required UI:
- Upload button or drag/select area.
- Accepted file guidance.
- Upload counter, for example `3 / 10 uploads used`.
- Upload status messaging.

Behavior:
- Images and videos are accepted.
- Files upload directly from the browser to Cloudinary.
- Upload count is tracked locally with `localStorage`.
- Upload UI is hidden when the limit is reached.
- The screen should show time remaining until the gallery-only phase begins.

Local tracking:

```js
const count = parseInt(localStorage.getItem("keepsake_upload_count") || "0", 10);
localStorage.setItem("keepsake_upload_count", String(count + 1));
```

Limit reached state:
- Message: `Upload limit reached — media will be available in X`.
- Live countdown showing days, hours, minutes, and seconds.
- When the upload window closes, switch message to `Media is now available`.

### 6.3 Gallery

Purpose:
- Present all available media once the upload window ends.

Required UI:
- Responsive image/video grid.
- Fullscreen modal viewer.
- Next/previous navigation.
- Close control.

Behavior:
- Clicking a tile opens the modal.
- Arrow keys navigate on desktop.
- Swipe gestures navigate on mobile.
- Current item index is tracked in memory.

## 7. Upload Integration

### 7.1 Cloudinary Upload Flow

Uploads are handled with Cloudinary's unsigned browser upload flow.

Requirements:

- Cloudinary account
- Cloud name
- Unsigned upload preset
- Optional folder such as `keepsake/`

Reference upload logic:

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

### 7.2 Upload Notes

- Uploads happen entirely from the browser.
- No backend signing flow is required if the preset is configured for unsigned uploads.
- Cloudinary provides hosting, CDN delivery, and strong image/video support.

## 8. Single-Page Rendering Strategy

The site uses one HTML document and one root mount point:

```html
<div id="app"></div>
```

Rendering pattern:

- Load the page once.
- Read `CONFIG`.
- Determine the active state.
- Render the matching interface into `#app`.
- Rerender when timers or state boundaries change.

## 9. Module Breakdown

### 9.1 `script.js` or `js/app.js`

Responsibility:
- Bootstrap the app.
- Read config.
- Resolve current state.
- Mount the correct screen into `#app`.
- Coordinate rerenders and timers.

### 9.2 `media.js`

Responsibility:
- Export the media manifest.
- Store item metadata such as type, title, alt text, poster, and URL.

### 9.3 Countdown Module

Responsibility:
- Calculate remaining time to event start.
- Render countdown UI.
- Emit a refresh when the state boundary is reached.

Public functions:
- `getTimeRemaining(targetDate)`
- `renderCountdown(container, config)`

### 9.4 Upload Module

Responsibility:
- Render upload controls.
- Validate file type and size.
- Track per-device upload counts.
- Upload files to Cloudinary.
- Render limit-reached messaging and countdown to gallery unlock.

Public functions:
- `getUploadCount()`
- `incrementUploadCount()`
- `canUpload(config)`
- `renderUpload(container, config)`
- `uploadFile(file, config)`

### 9.5 Gallery Module

Responsibility:
- Render media grid.
- Open and close modal.
- Track active index.
- Support swipe and keyboard navigation.

Public functions:
- `renderGallery(container, media)`
- `openModal(index)`
- `closeModal()`
- `showNext()`
- `showPrevious()`

### 9.6 State Module

Responsibility:
- Resolve current app state from `CONFIG`.
- Calculate upload window end.
- Format timers shared by countdown and limit-reached UI.

Public functions:
- `getAppState(config)`
- `getUploadEndDate(config)`
- `formatDuration(ms)`

## 10. Suggested File Structure

Keep the current root-level entry files, but organize logic into a small `js` folder as the single-page app grows:

```text
keepsake/
├── index.html
├── style.css
├── README.md
├── TECHNICAL_SPEC.md
├── media.js
├── script.js
├── js/
│   ├── state.js
│   ├── countdown.js
│   ├── upload.js
│   └── gallery.js
└── assets/
    ├── icons/
    └── placeholders/
```

Notes:
- `index.html`, `style.css`, `script.js`, and `media.js` remain in place.
- `script.js` can stay as the app entry point and gradually delegate to `js/` modules.
- This avoids a drastic restructure while keeping responsibilities clean.

## 11. Configuration Contract

Recommended `CONFIG` fields:

```js
const CONFIG = {
  eventTitle: "Keepsake",
  eventDate: "2026-07-25T15:00:00",
  uploadDaysAfterEvent: 3,
  uploadLimitPerDevice: 10,
  cloudName: "your-cloud-name",
  uploadPreset: "keepsake_unsigned",
  acceptedImageTypes: ["image/jpeg", "image/png", "image/webp"],
  acceptedVideoTypes: ["video/mp4", "video/webm", "video/quicktime"],
  maxFileSizeMb: 200,
  forceState: null
};
```

Guidelines:
- Keep `forceState` available for demos and UI testing.
- Keep Cloudinary identifiers configurable rather than hardcoded.
- Avoid storing secrets in frontend code.

## 12. Implementation Order

1. Finalize `CONFIG` shape.
2. Implement the state system.
3. Build countdown screen and timer utilities.
4. Build the upload UI and Cloudinary upload function.
5. Add local device limit logic.
6. Add limit-reached countdown messaging.
7. Build gallery grid and fullscreen modal.
8. Wire keyboard and swipe navigation.

## 13. Risks and Decisions

### Confirmed Decisions

- No backend.
- No frameworks.
- Single-page website architecture.
- Cloudinary-hosted media uploaded and consumed by URL.
- App state driven by config and time windows.

### Open Decisions

- Whether the media list is maintained manually in `media.js` or generated externally.
- Whether upload limits are intentionally per-device rather than per-user identity.

### Known Risk

`localStorage` can only enforce upload limits on the current browser/device. Without a backend or identity layer, users can bypass the limit by switching browsers, devices, or clearing storage.
