const CONFIG = {
  eventTitle: "Keepsake",
  eventDate: "2026-07-25T15:00:00",
  cameraUploadCutoffDate: "2026-07-26T05:00:00",
  uploadDaysAfterEvent: 3,
  uploadLimitPerUser: 10,
  forceState: null,
  //  existing states: "countdown" | "upload" | "gallery"
};

const RSVP_API_BASE = "https://script.google.com/macros/s/AKfycbyPe85jGsLQ2yS-BxHCtofzTgHJAwgUOibTXHo2zf7nEqDuKLOXOSrAh31TgiVs43Jd/exec";

const STORAGE_KEYS = {
  inviteKey: "inviteKey",
  selectedUploaderName: "selectedUploaderName",
  uploadCount: "uploadCount"
};

const UNNAMED_GUEST = "Unnamed Guest";
const UNNAMED_FOLDER = "wedding-app/guests/unnamed/";
const GALLERY_TAG = "wedding-app";
const ZIP_FOLDER_NAME = "keepsake-gallery";
const publicEnv = {
  cloudName: document.body.dataset.cloudName,
  uploadPreset: document.body.dataset.uploadPreset,
  maxFileSizeMb: Number(document.body.dataset.maxFileSizeMb || "100")
};
const state = {
  inviteKey: getInviteKeyFromUrl(),
  uploaderOptions: [],
  selectedUploaderName: "",
  uploadCount: 0,
  isUnnamedFallback: true,
  galleryItems: [],
  activeGalleryIndex: 0,
  isDownloadingGallery: false,
  cameraSupported: false,
  cameraEnabled: false,
  rsvpAttending: null,
};
let countdownTimerId = null;
let uploadLimitTimerId = null;
let cameraAvailabilityTimerId = null;
let lightboxTouchStartX = 0;

function getInviteKeyFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const inviteKey = params.get("invite");
  return inviteKey ? inviteKey.trim() : "";
}

function loadUploadCountMap() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.uploadCount);
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    console.error("Failed to read saved upload counts.", error);
    return {};
  }
}

function saveUploadCountMap(map) {
  localStorage.setItem(STORAGE_KEYS.uploadCount, JSON.stringify(map));
}

function getIdentityStorageKey(inviteKey, selectedName) {
  if (!inviteKey || !selectedName || selectedName === UNNAMED_GUEST) {
    return "unnamed";
  }

  return `${inviteKey}::${selectedName}`;
}

function getStoredUploadCount(identityKey) {
  const counts = loadUploadCountMap();
  return Number(counts[identityKey]) || 0;
}

function setStoredUploadCount(identityKey, count) {
  const counts = loadUploadCountMap();
  counts[identityKey] = count;
  saveUploadCountMap(counts);
}

function loadStoredSelectedUploader() {
  return localStorage.getItem(STORAGE_KEYS.selectedUploaderName) || "";
}

function saveStoredSelectedUploader(value) {
  localStorage.setItem(STORAGE_KEYS.selectedUploaderName, value);
}

function loadStoredInviteKey() {
  return localStorage.getItem(STORAGE_KEYS.inviteKey) || "";
}

function saveStoredInviteKey(value) {
  localStorage.setItem(STORAGE_KEYS.inviteKey, value);
}

function isAcceptedFile(file) {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

function getAppState() {
  if (CONFIG.forceState) return CONFIG.forceState;

  const now = new Date();
  const eventDate = new Date(CONFIG.eventDate);

  if (now < eventDate) return "countdown";

  const uploadEnd = new Date(eventDate);
  uploadEnd.setDate(uploadEnd.getDate() + CONFIG.uploadDaysAfterEvent);

  if (now <= uploadEnd) return "upload";

  return "gallery";
}

function getUploadEndDate() {
  const uploadEnd = new Date(CONFIG.eventDate);
  uploadEnd.setDate(uploadEnd.getDate() + CONFIG.uploadDaysAfterEvent);
  return uploadEnd;
}

function getCameraUploadCutoffDate() {
  return new Date(CONFIG.cameraUploadCutoffDate);
}

function isCameraUploadWindowOpen() {
  return Date.now() < getCameraUploadCutoffDate().getTime();
}

function syncConfigToUi() {
  const countdownTitle = document.getElementById("countdown-event-title");
  const eventTitle = document.getElementById("upload-event-title");
  const helpText = document.getElementById("upload-help-text");

  if (countdownTitle) {
    countdownTitle.textContent = CONFIG.eventTitle;
  }

  if (eventTitle) {
    eventTitle.textContent = CONFIG.eventTitle;
  }

  if (helpText) {
    helpText.textContent = `Images and videos only. Max size: ${publicEnv.maxFileSizeMb} MB.`;
  }
}

function bindUploadEvents() {
  const form = document.getElementById("upload-form");
  const uploaderSelect = document.getElementById("uploader-select");
  if (!form) return;
  form.addEventListener("submit", handleUploadSubmit);

  if (uploaderSelect) {
    uploaderSelect.addEventListener("change", handleUploaderChange);
  }
}

function bindCameraEvents() {
  const cameraButton = document.getElementById("camera-button");
  const cameraFileInput = document.getElementById("camera-file-input");

  if (cameraButton) {
    cameraButton.addEventListener("click", () => {
      if (!state.cameraEnabled || !cameraFileInput) return;

      if (!isUploadAllowed()) {
        setStatus("Uploads are not allowed for this RSVP.", "error");
        return;
      }

      if (!canUploadForCurrentIdentity()) {
        setStatus("Please choose which guest is uploading before continuing.", "error");
        return;
      }

      if (state.uploadCount >= CONFIG.uploadLimitPerUser) {
        updateUploaderIdentityUi();
        return;
      }

      if (!isCameraUploadWindowOpen()) {
        updateCameraAvailabilityUi();
        setStatus("Camera capture has closed. Please use the upload field to add media.", "error");
        return;
      }

      cameraFileInput.click();
    });
  }

  if (cameraFileInput) {
    cameraFileInput.addEventListener("change", handleCameraFileChange);
  }
}

function bindGalleryEvents() {
  const closeButton = document.getElementById("lightbox-close");
  const prevButton = document.getElementById("lightbox-prev");
  const nextButton = document.getElementById("lightbox-next");
  const lightbox = document.getElementById("gallery-lightbox");
  const downloadAllButton = document.getElementById("gallery-download-all");

  if (closeButton) {
    closeButton.addEventListener("click", closeLightbox);
  }

  if (prevButton) {
    prevButton.addEventListener("click", showPreviousMedia);
  }

  if (nextButton) {
    nextButton.addEventListener("click", showNextMedia);
  }

  if (lightbox) {
    lightbox.addEventListener("click", handleLightboxBackdropClick);
    lightbox.addEventListener("touchstart", handleLightboxTouchStart, { passive: true });
    lightbox.addEventListener("touchend", handleLightboxTouchEnd, { passive: true });
  }

  if (downloadAllButton) {
    downloadAllButton.addEventListener("click", handleDownloadAllItems);
  }

  document.addEventListener("keydown", handleLightboxKeydown);
}

function updateUploadCount() {
  const counter = document.getElementById("upload-count");
  if (!counter) return;
  counter.textContent = `${state.uploadCount} / ${CONFIG.uploadLimitPerUser}`;
}

function showState(activeState) {
  document.querySelectorAll(".state-panel").forEach((panel) => {
    const shouldShow = panel.dataset.state === activeState;
    panel.classList.toggle("d-none", !shouldShow);
  });

  if (activeState === "gallery") {
    clearCameraAvailabilityWatcher();
    loadGalleryItems();
    return;
  }

  if (activeState === "upload") {
    startCameraAvailabilityWatcher();
    return;
  }

  clearCameraAvailabilityWatcher();
}

function detectCameraSupport() {
  const input = document.createElement("input");
  input.type = "file";
  const hasNativeCapture = "capture" in input;
  const likelyMobile = window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  state.cameraSupported = hasNativeCapture;
  state.cameraEnabled = hasNativeCapture && likelyMobile;

  const cameraButton = document.getElementById("camera-button");
  const cameraHelp = document.getElementById("camera-help");

  if (!cameraButton || !cameraHelp) return;

  if (!state.cameraSupported) {
    cameraButton.disabled = true;
    cameraButton.setAttribute("title", "Native camera capture is not available on this device.");
    cameraHelp.textContent = "Native camera capture is not available on this device.";
    return;
  }

  if (!state.cameraEnabled) {
    cameraButton.disabled = true;
    cameraButton.setAttribute("title", "Native camera capture is intended for mobile devices.");
    cameraHelp.textContent = "Native camera capture is currently enabled for mobile devices only.";
    return;
  }

  updateCameraAvailabilityUi();
}

function updateCameraAvailabilityUi() {
  const cameraButton = document.getElementById("camera-button");
  const cameraHelp = document.getElementById("camera-help");

  if (!cameraButton || !cameraHelp || !state.cameraSupported || !state.cameraEnabled) return;

  const cameraWindowOpen = isCameraUploadWindowOpen();
  const cutoffText = getCameraUploadCutoffDate().toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });

  cameraButton.disabled = !cameraWindowOpen;

  if (cameraWindowOpen) {
    cameraButton.removeAttribute("title");
    cameraHelp.textContent = `Open your phone camera, take a photo with the native camera app, and upload it automatically. Camera capture closes ${cutoffText}.`;
    return;
  }

  cameraButton.setAttribute("title", `Camera capture closed ${cutoffText}.`);
  cameraHelp.textContent = `Camera capture closed ${cutoffText}. Please use the upload field below for photos and videos.`;
}

function updateGalleryStatus(message, tone) {
  const status = document.getElementById("gallery-status");
  if (!status) return;

  if (!message) {
    status.className = "invite-banner info mb-4 d-none";
    status.textContent = "";
    return;
  }

  status.className = `invite-banner mb-4 ${tone || "info"}`.trim();
  status.textContent = message;
}

function getDownloadableGalleryItems() {
  return state.galleryItems;
}

function updateGalleryDownloadButton() {
  const button = document.getElementById("gallery-download-all");
  if (!button) return;

  const itemCount = getDownloadableGalleryItems().length;
  button.disabled = itemCount === 0 || state.isDownloadingGallery;

  if (state.isDownloadingGallery) {
    button.textContent = "Preparing...";
    return;
  }

  // button.textContent = itemCount === 1
  //   ? "Download 1 item"
  //   : `Download ${itemCount} items`;
}

function sanitizeZipName(value) {
  return String(value || "image")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .toLowerCase() || "image";
}

function getExtensionFromContentType(contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const extensions = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/heic": "heic",
    "image/heif": "heif",
    "video/mp4": "mp4",
    "video/mpeg": "mpeg",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-msvideo": "avi"
  };

  return extensions[type] || "";
}

function getExtensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : "";
  } catch (error) {
    return "";
  }
}

function getZipDateParts(date = new Date()) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    return value >>> 0;
  });
}

const CRC_TABLE = makeCrcTable();

function getCrc32(bytes) {
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function createZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;
  const { time, date } = getZipDateParts();

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const crc = getCrc32(file.bytes);
    const localHeader = [];

    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0x0800);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, time);
    writeUint16(localHeader, date);
    writeUint32(localHeader, crc);
    writeUint32(localHeader, file.bytes.length);
    writeUint32(localHeader, file.bytes.length);
    writeUint16(localHeader, nameBytes.length);
    writeUint16(localHeader, 0);

    const centralHeader = [];
    writeUint32(centralHeader, 0x02014b50);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 0x0800);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, time);
    writeUint16(centralHeader, date);
    writeUint32(centralHeader, crc);
    writeUint32(centralHeader, file.bytes.length);
    writeUint32(centralHeader, file.bytes.length);
    writeUint16(centralHeader, nameBytes.length);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, 0);
    writeUint32(centralHeader, offset);

    chunks.push(new Uint8Array(localHeader), nameBytes, file.bytes);
    centralDirectory.push(new Uint8Array(centralHeader), nameBytes);
    offset += localHeader.length + nameBytes.length + file.bytes.length;
  });

  const centralDirectorySize = centralDirectory.reduce((total, chunk) => total + chunk.length, 0);
  const endOfCentralDirectory = [];
  writeUint32(endOfCentralDirectory, 0x06054b50);
  writeUint16(endOfCentralDirectory, 0);
  writeUint16(endOfCentralDirectory, 0);
  writeUint16(endOfCentralDirectory, files.length);
  writeUint16(endOfCentralDirectory, files.length);
  writeUint32(endOfCentralDirectory, centralDirectorySize);
  writeUint32(endOfCentralDirectory, offset);
  writeUint16(endOfCentralDirectory, 0);

  return new Blob([...chunks, ...centralDirectory, new Uint8Array(endOfCentralDirectory)], {
    type: "application/zip"
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatCountdownPart(value) {
  return String(Math.max(0, value)).padStart(2, "0");
}

function getCountdownParts(targetDate) {
  const totalMs = new Date(targetDate).getTime() - Date.now();

  if (totalMs <= 0) {
    return {
      days: "00",
      hours: "00",
      minutes: "00",
      seconds: "00"
    };
  }

  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days: formatCountdownPart(days),
    hours: formatCountdownPart(hours),
    minutes: formatCountdownPart(minutes),
    seconds: formatCountdownPart(seconds)
  };
}

function renderCountdown() {
  const countdownDisplay = document.getElementById("countdown-display");
  if (!countdownDisplay) return;

  const parts = getCountdownParts(CONFIG.eventDate);
  countdownDisplay.textContent = `${parts.days}:${parts.hours}:${parts.minutes}:${parts.seconds}`;
}

function startCountdown() {
  clearCountdown();
  renderCountdown();
  countdownTimerId = window.setInterval(() => {
    renderCountdown();

    const nextState = getAppState();

    if (nextState !== "countdown") {
      clearCountdown();
      showState(nextState);

      if (nextState === "upload") {
        initializeInviteIdentity();
      }
    }
  }, 1000);
}

function clearCountdown() {
  if (countdownTimerId) {
    window.clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
}

function renderUploadLimitCountdown() {
  const countdown = document.getElementById("upload-limit-countdown");
  const message = document.getElementById("upload-limit-message");
  const title = document.getElementById("upload-limit-title");
  if (!countdown || !message || !title) return;

  if (state.rsvpAttending === "NO") {
    title.textContent = "You’ll be able to view all the memories when the gallery opens 💙";
  }

  const parts = getCountdownParts(getUploadEndDate());
  countdown.textContent = `${parts.days}:${parts.hours}:${parts.minutes}:${parts.seconds}`;

  if (getAppState() === "gallery") {
    message.textContent = "Media is now available.";
  } else {
    message.textContent = "Come back to view the gallery.";
  }
}

function startUploadLimitCountdown() {
  clearUploadLimitCountdown();
  renderUploadLimitCountdown();
  uploadLimitTimerId = window.setInterval(() => {
    renderUploadLimitCountdown();

    const nextState = getAppState();
    if (nextState === "gallery") {
      clearUploadLimitCountdown();
      showState(nextState);
    }
  }, 1000);
}

function clearUploadLimitCountdown() {
  if (uploadLimitTimerId) {
    window.clearInterval(uploadLimitTimerId);
    uploadLimitTimerId = null;
  }
}

function startCameraAvailabilityWatcher() {
  clearCameraAvailabilityWatcher();
  updateCameraAvailabilityUi();
  cameraAvailabilityTimerId = window.setInterval(() => {
    updateCameraAvailabilityUi();
  }, 30000);
}

function clearCameraAvailabilityWatcher() {
  if (cameraAvailabilityTimerId) {
    window.clearInterval(cameraAvailabilityTimerId);
    cameraAvailabilityTimerId = null;
  }
}

async function handleCameraFileChange(event) {
  const input = event.target;
  const file = input.files?.[0];

  if (!file) return;

  try {
    await processUpload(file, {
      pendingMessage: "Uploading captured photo...",
      successMessage: "Captured photo uploaded successfully."
    });
  } finally {
    input.value = "";
  }
}

function getUploaderDisplayName(name) {
  const normalized = normalizeGuestName(name);
  return normalized || "unnamed";
}

function setInviteBanner(message, tone) {
  const banner = document.getElementById("invite-status");
  if (!banner) return;

  if (!message) {
    banner.className = "invite-banner d-none mb-3";
    banner.textContent = "";
    return;
  }

  banner.className = `invite-banner mb-3 ${tone || ""}`.trim();
  banner.textContent = message;
}

function setInviteLoading(isLoading) {
  const loading = document.getElementById("invite-loading");
  const banner = document.getElementById("invite-status");
  const selectWrap = document.getElementById("uploader-select-wrap");

  if (loading) {
    loading.classList.toggle("d-none", !isLoading);
  }

  if (banner) {
    banner.classList.toggle("d-none", isLoading || !banner.textContent);
  }

  if (selectWrap && isLoading) {
    selectWrap.classList.add("d-none");
  }
}

function updateUploaderIdentityUi() {
  const isRsvpNo = state.rsvpAttending === "NO";
  const rsvpBlocked = !isUploadAllowed();
  const uploadButton = document.getElementById("upload-button");
  const uploadStatus = document.getElementById("upload-info");
  const selectWrap = document.getElementById("uploader-select-wrap");
  const uploaderSelect = document.getElementById("uploader-select");
  const uploadForm = document.getElementById("upload-form");
  const limitPanel = document.getElementById("upload-limit-panel");
  const limitReached = state.uploadCount >= CONFIG.uploadLimitPerUser;

  const shouldShowCountdown = limitReached || isRsvpNo;

  // 🚫 HARD BLOCK UI
  if (isRsvpNo) {
    if (uploadStatus) uploadStatus.classList.add("d-none");
  }

  if (selectWrap) {
    selectWrap.classList.toggle("d-none", state.uploaderOptions.length === 0);
  }

  if (uploaderSelect) {
    uploaderSelect.disabled = state.uploaderOptions.length === 0;
  }

  if (uploadButton) {
    uploadButton.disabled = rsvpBlocked || !canUploadForCurrentIdentity() || limitReached;
  }

  if (uploadForm) {
    uploadForm.classList.toggle("d-none", shouldShowCountdown || rsvpBlocked);
  }

  if (limitPanel) {
    limitPanel.classList.toggle("d-none", !shouldShowCountdown);
  }

  if (shouldShowCountdown) {
    startUploadLimitCountdown();
  } else {
    clearUploadLimitCountdown();
  }
}

function canUploadForCurrentIdentity() {
  if (!isUploadAllowed()) return false;
  if (state.isUnnamedFallback) return true;
  return Boolean(state.selectedUploaderName);
}

function populateUploaderSelect() {
  const uploaderSelect = document.getElementById("uploader-select");
  if (!uploaderSelect) return;

  uploaderSelect.innerHTML = '<option value="">Select a guest</option>';

  state.uploaderOptions.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    uploaderSelect.appendChild(option);
  });

  uploaderSelect.value = state.selectedUploaderName && state.uploaderOptions.includes(state.selectedUploaderName)
    ? state.selectedUploaderName
    : "";
}

function normalizeGuestName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .toLowerCase();
}

function getCloudinaryListUrl() {
  return `https://res.cloudinary.com/${publicEnv.cloudName}/any/list/${GALLERY_TAG}.json`;
}

function getResourceUrl(resource) {
  if (resource.secure_url) return resource.secure_url;

  const version = resource.version ? `v${resource.version}/` : "";
  return `https://res.cloudinary.com/${publicEnv.cloudName}/${resource.resource_type}/upload/${version}${resource.public_id}.${resource.format}`;
}

function mapGalleryResource(resource) {
  const context = resource.context?.custom || resource.context || {};
  const rawName = context.uploaderName || context.uploadername || UNNAMED_GUEST;
  const displayName = rawName === UNNAMED_GUEST ? "unnamed" : getUploaderDisplayName(rawName);

  return {
    id: resource.asset_id || resource.public_id,
    type: resource.resource_type === "video" ? "video" : "image",
    url: getResourceUrl(resource),
    thumbUrl: resource.resource_type === "video"
      ? `https://res.cloudinary.com/${publicEnv.cloudName}/video/upload/so_0/${resource.public_id}.jpg`
      : getResourceUrl(resource),
    tag: displayName,
    alt: displayName
  };
}

function renderGallery() {
  const grid = document.getElementById("gallery-grid");
  const count = document.getElementById("gallery-count");
  if (!grid || !count) return;

  count.textContent = `${state.galleryItems.length} item${state.galleryItems.length === 1 ? "" : "s"}`;
  updateGalleryDownloadButton();

  if (!state.galleryItems.length) {
    grid.innerHTML = `
      <div class="gallery-empty">
        <p class="mb-1 fw-semibold">No gallery media yet</p>
        <p class="mb-0 text-secondary">Uploads tagged with ${GALLERY_TAG} will appear here.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = state.galleryItems
    .map((item, index) => `
      <button class="gallery-card" type="button" data-gallery-index="${index}" aria-label="Open media ${index + 1}">
        <div class="gallery-media-shell">
          <img class="gallery-media" src="${item.thumbUrl}" alt="${item.alt}">
        </div>
        <span class="gallery-tag">${item.tag}</span>
      </button>
    `)
    .join("");

  grid.querySelectorAll("[data-gallery-index]").forEach((button) => {
    button.addEventListener("click", () => openLightbox(Number(button.dataset.galleryIndex)));
  });
}

async function fetchGalleryItemFile(item, index) {
  const response = await fetch(item.url);

  if (!response.ok) {
    throw new Error(`Could not download item ${index + 1}.`);
  }

  const blob = await response.blob();
  const fallbackExtension = item.type === "video" ? "mp4" : "jpg";
  const extension = getExtensionFromContentType(response.headers.get("content-type")) || getExtensionFromUrl(item.url) || fallbackExtension;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const paddedIndex = String(index + 1).padStart(2, "0");

  return {
    name: `${ZIP_FOLDER_NAME}/${paddedIndex}-${sanitizeZipName(item.tag)}.${extension}`,
    bytes
  };
}

async function handleDownloadAllItems() {
  const items = getDownloadableGalleryItems();

  if (!items.length || state.isDownloadingGallery) {
    return;
  }

  state.isDownloadingGallery = true;
  updateGalleryDownloadButton();
  updateGalleryStatus(`Preparing ${items.length} item${items.length === 1 ? "" : "s"}...`, "info");

  try {
    const files = await Promise.all(items.map(fetchGalleryItemFile));
    const zip = createZip(files);
    downloadBlob(zip, `${ZIP_FOLDER_NAME}.zip`);
    updateGalleryStatus(`Downloaded ${items.length} item${items.length === 1 ? "" : "s"} as a zip.`, "success");
  } catch (error) {
    console.error(error);
    updateGalleryStatus("The gallery zip could not be created. Please try again.", "warning");
  } finally {
    state.isDownloadingGallery = false;
    updateGalleryDownloadButton();
  }
}

async function loadGalleryItems() {
  updateGalleryStatus("Loading gallery...", "info");

  try {
    const response = await fetch(getCloudinaryListUrl(), { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Gallery list could not be loaded.");
    }

    state.galleryItems = Array.isArray(data.resources)
      ? data.resources.map(mapGalleryResource)
      : [];

    renderGallery();
    updateGalleryStatus("", "info");
  } catch (error) {
    console.error(error);
    state.galleryItems = [];
    renderGallery();
    updateGalleryStatus(
      "Gallery media could not be loaded. Make sure Cloudinary client-side asset lists are enabled and uploads are tagged with wedding-app.",
      "warning"
    );
  }
}

function renderLightboxMedia(item) {
  const container = document.getElementById("lightbox-media");
  const tag = document.getElementById("lightbox-tag");
  const download = document.getElementById("lightbox-download");
  if (!container || !tag || !download) return;

  container.innerHTML = item.type === "video"
    ? `<video class="lightbox-asset" src="${item.url}" controls autoplay playsinline></video>`
    : `<img class="lightbox-asset" src="${item.url}" alt="${item.alt}">`;

  tag.textContent = item.tag;
  download.href = item.url;
  download.setAttribute("download", "");
}

function openLightbox(index) {
  if (!state.galleryItems.length) return;

  state.activeGalleryIndex = index;
  renderLightboxMedia(state.galleryItems[index]);

  const lightbox = document.getElementById("gallery-lightbox");
  if (!lightbox) return;
  lightbox.classList.remove("d-none");
  lightbox.setAttribute("aria-hidden", "false");
}

function closeLightbox() {
  const lightbox = document.getElementById("gallery-lightbox");
  const media = document.getElementById("lightbox-media");
  if (!lightbox || !media) return;

  lightbox.classList.add("d-none");
  lightbox.setAttribute("aria-hidden", "true");
  media.innerHTML = "";
}

function showNextMedia() {
  if (!state.galleryItems.length) return;
  state.activeGalleryIndex = (state.activeGalleryIndex + 1) % state.galleryItems.length;
  renderLightboxMedia(state.galleryItems[state.activeGalleryIndex]);
}

function showPreviousMedia() {
  if (!state.galleryItems.length) return;
  state.activeGalleryIndex = (state.activeGalleryIndex - 1 + state.galleryItems.length) % state.galleryItems.length;
  renderLightboxMedia(state.galleryItems[state.activeGalleryIndex]);
}

function handleLightboxBackdropClick(event) {
  if (event.target.id === "gallery-lightbox" || event.target.classList.contains("gallery-lightbox-backdrop")) {
    closeLightbox();
  }
}

function handleLightboxKeydown(event) {
  const lightbox = document.getElementById("gallery-lightbox");
  if (!lightbox || lightbox.classList.contains("d-none")) return;

  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowRight") showNextMedia();
  if (event.key === "ArrowLeft") showPreviousMedia();
}

function handleLightboxTouchStart(event) {
  lightboxTouchStartX = event.changedTouches[0]?.clientX || 0;
}

function handleLightboxTouchEnd(event) {
  const touchEndX = event.changedTouches[0]?.clientX || 0;
  const delta = touchEndX - lightboxTouchStartX;

  if (Math.abs(delta) < 40) return;
  if (delta < 0) showNextMedia();
  if (delta > 0) showPreviousMedia();
}

function getUploadFolder() {
  if (state.isUnnamedFallback || !state.inviteKey || !state.selectedUploaderName) {
    return UNNAMED_FOLDER;
  }

  return `wedding-app/guests/${state.inviteKey}/${normalizeGuestName(state.selectedUploaderName)}/`;
}

function refreshUploadCount() {
  const identityKey = getIdentityStorageKey(state.inviteKey, state.selectedUploaderName);
  state.uploadCount = getStoredUploadCount(identityKey);
  updateUploadCount();
}

function resetIdentityForInviteChange() {
  state.selectedUploaderName = state.isUnnamedFallback ? UNNAMED_GUEST : "";
  saveStoredSelectedUploader(state.selectedUploaderName);
}

function handleUploaderChange(event) {
  state.selectedUploaderName = event.target.value || "";
  saveStoredSelectedUploader(state.selectedUploaderName);
  refreshUploadCount();
  updateUploaderIdentityUi();
  syncUploadCountFromCloudinary();
}

function buildUploaderOptions(payload) {
  const selectedNamedGuests = Array.isArray(payload?.rsvp?.selectedNamedGuests)
    ? payload.rsvp.selectedNamedGuests
    : [];
  const extraGuestNames = Array.isArray(payload?.rsvp?.extraGuestNames)
    ? payload.rsvp.extraGuestNames
    : [];

  return [...selectedNamedGuests, ...extraGuestNames]
    .map((name) => String(name || "").trim())
    .filter(Boolean);
}

async function fetchRsvpData(inviteKey) {
  const response = await fetch(`${RSVP_API_BASE}?invite=${encodeURIComponent(inviteKey)}`);
  const data = await response.json();

  if (!response.ok || data?.ok !== true) {
    throw new Error("RSVP invite could not be verified.");
  }

  return data;
}

async function initializeInviteIdentity() {
  const previousInviteKey = loadStoredInviteKey();

  if (!state.inviteKey) {
    setInviteLoading(false);
    state.isUnnamedFallback = true;
    state.uploaderOptions = [];
    state.selectedUploaderName = UNNAMED_GUEST;
    state.rsvpAttending = "PUBLIC";
    saveStoredInviteKey("");
    saveStoredSelectedUploader(UNNAMED_GUEST);
    refreshUploadCount();
    populateUploaderSelect();
    updateUploaderIdentityUi();
    setInviteBanner("No invite detected. Uploading as Unnamed Guest.", "info");
    return;
  }

  setInviteLoading(true);

  try {
    const rsvpData = await fetchRsvpData(state.inviteKey);
    state.uploaderOptions = buildUploaderOptions(rsvpData);
    state.isUnnamedFallback = state.uploaderOptions.length === 0;

    state.rsvpAttending = rsvpData?.rsvp?.attending || null;

    if (previousInviteKey !== state.inviteKey) {
      resetIdentityForInviteChange();
    }

    if (state.rsvpAttending === "NO") {
      setInviteBanner("This RSVP is marked as not attending. Uploads are disabled.", "warning");
    } else if (state.isUnnamedFallback) {
      state.selectedUploaderName = UNNAMED_GUEST;
      saveStoredSelectedUploader(UNNAMED_GUEST);
      setInviteBanner("Invite found, but no guest names were available. Falling back to Unnamed Guest.", "warning");
    } else  {
      const cachedName = loadStoredSelectedUploader();
      state.selectedUploaderName = state.uploaderOptions.includes(cachedName) ? cachedName : "";
      saveStoredSelectedUploader(state.selectedUploaderName);
      setInviteBanner(`Invite loaded. Choose who is uploading.`, "success");
    }

    saveStoredInviteKey(state.inviteKey);
  } catch (error) {
    console.error(error);
    state.isUnnamedFallback = true;
    state.uploaderOptions = [];
    state.selectedUploaderName = UNNAMED_GUEST;
    state.rsvpAttending = "PUBLIC";
    saveStoredInviteKey("");
    saveStoredSelectedUploader(UNNAMED_GUEST);
    setInviteBanner("Invite lookup failed. Falling back to Unnamed Guest.", "warning");
  } finally {
    setInviteLoading(false);
  }

  populateUploaderSelect();
  refreshUploadCount();
  updateUploaderIdentityUi();
  await syncUploadCountFromCloudinary(); 
}

async function handleUploadSubmit(event) {
  event.preventDefault();

  const fileInput = document.getElementById("media-file");
  const file = fileInput.files[0];

  if (!file) {
    setStatus("Choose a file before uploading.", "error");
    return;
  }

  await processUpload(file, {
    pendingMessage: `Uploading ${file.name}...`,
    successMessage: "Upload successful."
  });
}

async function processUpload(file, messages) {
  const fileInput = document.getElementById("media-file");
  const button = document.getElementById("upload-button");
  const identityKey = getIdentityStorageKey(state.inviteKey, state.selectedUploaderName);
  const pendingMessage = messages?.pendingMessage || `Uploading ${file.name}...`;
  const successMessage = messages?.successMessage || "Upload successful.";

  if (!isAcceptedFile(file)) {
    setStatus("Only image and video files are supported.", "error");
    throw new Error("Only image and video files are supported.");
  }

  if (!canUploadForCurrentIdentity()) {
    setStatus("Please choose which guest is uploading before continuing.", "error");
    throw new Error("Please choose which guest is uploading before continuing.");
  }

  if (file.size > publicEnv.maxFileSizeMb * 1024 * 1024) {
    setStatus(`File is too large. Maximum size is ${publicEnv.maxFileSizeMb} MB.`, "error");
    throw new Error(`File is too large. Maximum size is ${publicEnv.maxFileSizeMb} MB.`);
  }

  if (state.uploadCount >= CONFIG.uploadLimitPerUser) {
    setStatus(`Upload limit reached. You have already used ${CONFIG.uploadLimitPerUser} uploads.`, "error");
    updateUploaderIdentityUi();
    throw new Error(`Upload limit reached. You have already used ${CONFIG.uploadLimitPerUser} uploads.`);
  }

  if (button) button.disabled = true;
  if (fileInput) fileInput.disabled = true;
  setStatus(pendingMessage, "working");

  try {
    await uploadFile(file);

    state.uploadCount += 1;
    setStoredUploadCount(identityKey, state.uploadCount);
    updateUploadCount();
    updateUploaderIdentityUi();
    setStatus(successMessage, "success");
    if (fileInput) fileInput.value = "";
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Upload failed. Check your Cloudinary preset and try again.", "error");
    throw error;
  } finally {
    if (button) button.disabled = false;
    if (fileInput) fileInput.disabled = false;
  }
}

function setStatus(message, tone) {
  const status = document.getElementById("status");
  if (!status) return;
  status.className = `status-message mt-3 mb-0 ${tone || ""}`.trim();
  status.textContent = message;
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", publicEnv.uploadPreset);
  formData.append("folder", getUploadFolder());
  formData.append("tags", GALLERY_TAG);
  formData.append("context", `inviteKey=${state.inviteKey || "unnamed"}|uploaderName=${state.selectedUploaderName || UNNAMED_GUEST}`);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${publicEnv.cloudName}/auto/upload`,
    {
      method: "POST",
      body: formData
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Cloudinary upload failed.");
  }

  return {
    type: file.type.startsWith("video/") ? "video" : "image",
    url: data.secure_url
  };
}

function isUploadAllowed() {
  // No invite = always allowed
  if (!state.inviteKey) return true;

  if (state.rsvpAttending === "PUBLIC") return true;

  // Explicit RSVP rules
  if (state.rsvpAttending === "NO") return false;

  if (state.rsvpAttending === "YES") return true;

  // unknown / not loaded yet = block safely
  return false;
}

async function syncUploadCountFromCloudinary() {
  if (!state.inviteKey || !state.selectedUploaderName) return;

  try {
    const response = await fetch(getCloudinaryListUrl(), { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error("Failed to fetch Cloudinary list");
    }

    const normalizedName = state.selectedUploaderName;
    
    const count = (data.resources || []).filter((resource) => {
      const ctx = resource.context?.custom || resource.context || {};

      return (
        ctx.inviteKey === state.inviteKey &&
        ctx.uploaderName === normalizedName
      );
    }).length;

    // 🔥 Important: trust the higher value
    const identityKey = getIdentityStorageKey(state.inviteKey, state.selectedUploaderName);
    const localCount = getStoredUploadCount(identityKey);

    state.uploadCount = Math.max(localCount, count);

    setStoredUploadCount(identityKey, state.uploadCount);
    updateUploadCount();
    updateUploaderIdentityUi();

  } catch (error) {
    console.error("Cloudinary sync failed:", error);
  }
}

syncConfigToUi();
bindUploadEvents();
bindGalleryEvents();
bindCameraEvents();
detectCameraSupport();

const initialState = getAppState();

if (initialState === "countdown") {
  startCountdown();
}

if (initialState === "upload") {
  initializeInviteIdentity().then(() => {
    showState("upload");
  });
} else {
  showState(initialState);

  if (initialState === "countdown") {
    startCountdown();
  }
}
