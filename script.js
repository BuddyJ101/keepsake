const CONFIG = {
  eventTitle: "Keepsake",
  eventDate: "2026-07-25T15:00:00",
  uploadDaysAfterEvent: 3,
  uploadLimitPerUser: 10,
  forceState: null,
  //  existing states: "countdown" | "upload" | "gallery"
};

const STORAGE_KEY = "keepsake_upload_count";
const publicEnv = {
  cloudName: document.body.dataset.cloudName,
  uploadPreset: document.body.dataset.uploadPreset,
  maxFileSizeMb: Number(document.body.dataset.maxFileSizeMb || "100")
};
const state = {
  uploadCount: loadUploadCount()
};

function loadUploadCount() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) || 0 : 0;
  } catch (error) {
    console.error("Failed to read saved upload count.", error);
    return 0;
  }
}

function saveUploadCount() {
  localStorage.setItem(STORAGE_KEY, String(state.uploadCount));
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

function syncConfigToUi() {
  const eventTitle = document.getElementById("upload-event-title");
  const helpText = document.getElementById("upload-help-text");

  if (eventTitle) {
    eventTitle.textContent = CONFIG.eventTitle;
  }

  if (helpText) {
    helpText.textContent = `Images and videos only. Max size: ${publicEnv.maxFileSizeMb} MB.`;
  }
}

function bindUploadEvents() {
  const form = document.getElementById("upload-form");
  if (!form) return;
  form.addEventListener("submit", handleUploadSubmit);
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
    saveUploadCount();
    updateUploadCount();
    setStatus(`Upload complete. You have used ${state.uploadCount} of ${CONFIG.uploadLimitPerUser} uploads.`, "success");
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
updateUploadCount();
showState(getAppState());
