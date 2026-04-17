# Keepsake Technical Specification

## 1. Overview

Keepsake is a frontend-only single-page wedding web app built with plain HTML, CSS, and JavaScript. It uses Cloudinary for unsigned browser uploads, media hosting, and media delivery.

The app has three user-facing states:

1. `countdown`
2. `upload`
3. `gallery`

All states live in one HTML document and are shown or hidden by JavaScript.

## 2. Core Constraints

- No backend
- No framework
- Static-site friendly
- Single-page architecture
- Runtime behavior controlled by `CONFIG`
- Cloudinary credentials exposed to the browser must remain public-only

## 3. Current Architecture

### 3.1 Files

- [`index.html`](D:/Projects/keepsake/index.html): all state sections and lightbox markup
- [`style.css`](D:/Projects/keepsake/style.css): custom app styling
- [`script.js`](D:/Projects/keepsake/script.js): app bootstrap, state management, invite flow, uploads, countdown, and gallery

### 3.2 State Rendering

The page contains:

- `#state-countdown`
- `#state-upload`
- `#state-gallery`

JavaScript resolves the active app state and toggles `d-none` on the inactive sections.

## 4. Configuration Contract

The current configuration is defined in `script.js`:

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

### Field Meanings

- `eventTitle`: shared event label in the UI
- `eventDate`: countdown target and upload-state start
- `cameraUploadCutoffDate`: when native phone camera capture becomes unavailable
- `uploadDaysAfterEvent`: how long the upload window stays open before gallery-only mode
- `uploadLimitPerUser`: local upload cap per resolved uploader identity
- `forceState`: development override for `countdown`, `upload`, or `gallery`

## 5. State Logic

State resolution rules:

1. If `forceState` is set, use it.
2. If current time is before `eventDate`, show `countdown`.
3. If current time is before `eventDate + uploadDaysAfterEvent`, show `upload`.
4. Otherwise, show `gallery`.

Additional upload rule:

- Native camera capture is disabled after `cameraUploadCutoffDate`
- Standard file uploads remain available until the upload window ends

## 6. Countdown State

### Purpose

Build anticipation before the event begins.

### UI

- Event title
- Main countdown message
- Large `dd:hh:mm:ss` timer

### Behavior

- Updates every second
- Automatically transitions into the upload state when the event date is reached

## 7. Upload State

### Layout

The upload state is split into three cards:

1. Heading and upload status
2. Invite details
3. Upload media

### Invite System

Invite support is URL-based:

```text
?invite=granny-grandpa
```

Behavior:

- Read the invite key from the URL
- Fetch RSVP data from `RSVP_API_BASE`
- Build uploader options from:
  - `selectedNamedGuests`
  - `extraGuestNames`
- Persist the selected uploader in `localStorage`
- Fallback to `Unnamed Guest` when:
  - no invite is present
  - RSVP lookup fails
  - no guest names are returned

### Upload Options

Two upload paths are supported:

- Native mobile camera capture
- Standard image/video file selection

### Upload Rules

- Accept images and videos only
- Enforce a maximum file size from public page config
- Enforce a per-identity local upload limit
- Show status feedback during upload
- Hide the upload form when the limit is reached
- Show a countdown to the gallery unlock when the limit is reached

### Storage and Identity

`localStorage` keys:

- `inviteKey`
- `selectedUploaderName`
- `uploadCount`

Uploader folder rules:

- Named uploader:
  - `wedding-app/guests/${inviteKey}/${normalizeGuestName(selectedUploaderName)}/`
- Unnamed fallback:
  - `wedding-app/guests/unnamed/`

## 8. Cloudinary Upload Integration

Uploads are sent directly from the browser using an unsigned preset.

The page exposes public Cloudinary settings through `data-` attributes on `<body>`:

- `data-cloud-name`
- `data-upload-preset`
- `data-max-file-size-mb`

Upload metadata includes:

- `folder`
- `tags = wedding-app`
- `context` containing:
  - `inviteKey`
  - `uploaderName`

## 9. Gallery State

### Purpose

Display all tagged wedding uploads after the upload phase.

### Loading Strategy

The gallery is loaded from the Cloudinary client-side tag listing for `wedding-app`.

### Gallery UI

- Responsive grid of images and videos
- Uploader tag shown on each item
- Empty-state messaging when no assets are available

### Lightbox UI

- Enlarged image or video view
- Video playback only in the lightbox
- Guest tag shown in the lightbox
- Download link for the active asset
- Arrow navigation on desktop
- Swipe navigation on touch devices

## 10. Known Constraints

- Upload limits are local to the current browser storage
- Clearing local storage resets local upload counts and uploader selection
- Cloudinary folder counts are not securely available in a frontend-only app
- Gallery loading depends on Cloudinary client-side asset list access being enabled
- The app does not include Google Sheets integration, reactions, comments, or a backend identity layer

## 11. Implementation Status

### Implemented

- Countdown state
- Upload state
- Gallery state
- Invite-based uploader selection
- Unnamed guest fallback
- Cloudinary direct uploads
- Camera capture on mobile
- Camera cutoff after a configured date/time
- Upload limit handling
- Gallery lightbox with swipe, keyboard navigation, and downloads

### Not Implemented

- Google Sheets integration
- Secure server-side Cloudinary admin operations
- Cross-device upload enforcement
- Reactions
- Comments
