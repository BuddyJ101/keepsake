const CONFIG = {
  eventTitle: "Keepsake",
  eventDate: "2026-07-25T15:00:00",
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
const publicEnv = {
  cloudName: document.body.dataset.cloudName,
  uploadPreset: document.body.dataset.uploadPreset,
  maxFileSizeMb: Number(document.body.dataset.maxFileSizeMb || "100")
};
const state = {
  inviteKey: getInviteKeyFromUrl(),
  sessionInviteKey: null,
  uploaderOptions: [],
  selectedUploaderName: "",
  uploadCount: 0,
  uploadCountSource: "local session",
  isUnnamedFallback: true,
  rsvpLoaded: false
};
let countdownTimerId = null;
let uploadLimitTimerId = null;

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

function updateUploadCount() {
  const counter = document.getElementById("upload-count");
  const source = document.getElementById("upload-count-source");
  if (!counter) return;
  counter.textContent = `${state.uploadCount} / ${CONFIG.uploadLimitPerUser}`;

  if (source) {
    source.textContent = `Count source: ${state.uploadCountSource}`;
  }
}

function showState(activeState) {
  document.querySelectorAll(".state-panel").forEach((panel) => {
    const shouldShow = panel.dataset.state === activeState;
    panel.classList.toggle("d-none", !shouldShow);
  });
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
  if (!countdown || !message) return;

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

function updateUploaderIdentityUi() {
  const identityLabel = document.getElementById("uploader-identity-label");
  const uploadButton = document.getElementById("upload-button");
  const selectWrap = document.getElementById("uploader-select-wrap");
  const uploaderSelect = document.getElementById("uploader-select");
  const uploadForm = document.getElementById("upload-form");
  const limitPanel = document.getElementById("upload-limit-panel");
  const limitReached = state.uploadCount >= CONFIG.uploadLimitPerUser;

  if (identityLabel) {
    identityLabel.textContent = `Uploading as ${state.selectedUploaderName || UNNAMED_GUEST}`;
  }

  if (selectWrap) {
    selectWrap.classList.toggle("d-none", state.uploaderOptions.length === 0);
  }

  if (uploaderSelect) {
    uploaderSelect.disabled = state.uploaderOptions.length === 0;
  }

  if (uploadButton) {
    uploadButton.disabled = !canUploadForCurrentIdentity() || limitReached;
  }

  if (uploadForm) {
    uploadForm.classList.toggle("d-none", limitReached);
  }

  if (limitPanel) {
    limitPanel.classList.toggle("d-none", !limitReached);
  }

  if (limitReached) {
    startUploadLimitCountdown();
  } else {
    clearUploadLimitCountdown();
  }
}

function canUploadForCurrentIdentity() {
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

function getUploadFolder() {
  if (state.isUnnamedFallback || !state.inviteKey || !state.selectedUploaderName) {
    return UNNAMED_FOLDER;
  }

  return `wedding-app/guests/${state.inviteKey}/${normalizeGuestName(state.selectedUploaderName)}/`;
}

function refreshUploadCount() {
  const identityKey = getIdentityStorageKey(state.inviteKey, state.selectedUploaderName);
  state.uploadCount = getStoredUploadCount(identityKey);
  state.uploadCountSource = state.isUnnamedFallback
    ? "local session"
    : "cached local count (Cloudinary folder count requires a secure server-side Admin API call)";
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
  state.sessionInviteKey = state.inviteKey || "";

  if (!state.inviteKey) {
    state.isUnnamedFallback = true;
    state.uploaderOptions = [];
    state.selectedUploaderName = UNNAMED_GUEST;
    saveStoredInviteKey("");
    saveStoredSelectedUploader(UNNAMED_GUEST);
    refreshUploadCount();
    populateUploaderSelect();
    updateUploaderIdentityUi();
    setInviteBanner("No invite detected. Uploading as Unnamed Guest.", "info");
    return;
  }

  try {
    const rsvpData = await fetchRsvpData(state.inviteKey);
    state.rsvpLoaded = true;
    state.uploaderOptions = buildUploaderOptions(rsvpData);
    state.isUnnamedFallback = state.uploaderOptions.length === 0;

    if (previousInviteKey !== state.inviteKey) {
      resetIdentityForInviteChange();
    }

    if (state.isUnnamedFallback) {
      state.selectedUploaderName = UNNAMED_GUEST;
      saveStoredSelectedUploader(UNNAMED_GUEST);
      setInviteBanner("Invite found, but no guest names were available. Falling back to Unnamed Guest.", "warning");
    } else {
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
    saveStoredInviteKey("");
    saveStoredSelectedUploader(UNNAMED_GUEST);
    setInviteBanner("Invite lookup failed. Falling back to Unnamed Guest.", "warning");
  }

  populateUploaderSelect();
  refreshUploadCount();
  updateUploaderIdentityUi();
}

async function handleUploadSubmit(event) {
  event.preventDefault();

  const fileInput = document.getElementById("media-file");
  const button = document.getElementById("upload-button");
  const file = fileInput.files[0];

  if (!file) {
    setStatus("Choose a file before uploading.", "error");
    return;
  }

  if (!isAcceptedFile(file)) {
    setStatus("Only image and video files are supported.", "error");
    return;
  }

  if (!canUploadForCurrentIdentity()) {
    setStatus("Please choose which guest is uploading before continuing.", "error");
    return;
  }

  if (file.size > publicEnv.maxFileSizeMb * 1024 * 1024) {
    setStatus(`File is too large. Maximum size is ${publicEnv.maxFileSizeMb} MB.`, "error");
    return;
  }

  if (state.uploadCount >= CONFIG.uploadLimitPerUser) {
    setStatus(`Upload limit reached. You have already used ${CONFIG.uploadLimitPerUser} uploads.`, "error");
    return;
  }

  button.disabled = true;
  fileInput.disabled = true;
  setStatus(`Uploading ${file.name}...`, "working");

  try {
    await uploadFile(file);

    state.uploadCount += 1;
    setStoredUploadCount(getIdentityStorageKey(state.inviteKey, state.selectedUploaderName), state.uploadCount);
    updateUploadCount();
    updateUploaderIdentityUi();
    setStatus(`Upload successfully.`, "success");
    fileInput.value = "";
    button.disabled = false;
    fileInput.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Upload failed. Check your Cloudinary preset and try again.", "error");
    button.disabled = false;
    fileInput.disabled = false;
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

syncConfigToUi();
bindUploadEvents();

const initialState = getAppState();
showState(initialState);

if (initialState === "countdown") {
  startCountdown();
}

if (initialState === "upload") {
  initializeInviteIdentity();
}
