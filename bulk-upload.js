const BULK_GALLERY_TAG = "wedding-app";
const BULK_INVITE_KEY = "bulk-upload";

const bulkEnv = {
  cloudName: document.body.dataset.cloudName,
  uploadPreset: document.body.dataset.uploadPreset,
  maxFileSizeMb: Number(document.body.dataset.maxFileSizeMb || "100")
};

const bulkState = {
  files: [],
  uploadedCount: 0,
  failedCount: 0,
  isUploading: false
};

function getBulkElements() {
  return {
    form: document.getElementById("bulk-upload-form"),
    nameInput: document.getElementById("bulk-uploader-name"),
    fileInput: document.getElementById("bulk-media-files"),
    helpText: document.getElementById("bulk-help-text"),
    uploadButton: document.getElementById("bulk-upload-button"),
    clearButton: document.getElementById("bulk-clear-button"),
    status: document.getElementById("bulk-status"),
    selectedCount: document.getElementById("bulk-selected-count"),
    uploadedCount: document.getElementById("bulk-uploaded-count"),
    failedCount: document.getElementById("bulk-failed-count"),
    progress: document.querySelector(".bulk-progress"),
    progressBar: document.getElementById("bulk-progress-bar"),
    fileList: document.getElementById("bulk-file-list")
  };
}

function normalizeBulkName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .toLowerCase();
}

function sanitizeContextValue(value) {
  return String(value || "")
    .trim()
    .replace(/[|=]/g, " ");
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAcceptedBulkFile(file) {
  return file.type.startsWith("image/");
}

function setBulkStatus(message, tone) {
  const { status } = getBulkElements();
  if (!status) return;

  status.className = `status-message mt-3 mb-0 ${tone || ""}`.trim();
  status.textContent = message;
}

function setBulkControlsDisabled(isDisabled) {
  const { nameInput, fileInput, uploadButton, clearButton } = getBulkElements();

  if (nameInput) nameInput.disabled = isDisabled;
  if (fileInput) fileInput.disabled = isDisabled;
  if (uploadButton) uploadButton.disabled = isDisabled;
  if (clearButton) clearButton.disabled = isDisabled;
}

function getCompletedCount() {
  return bulkState.uploadedCount + bulkState.failedCount;
}

function updateBulkSummary() {
  const {
    selectedCount,
    uploadedCount,
    failedCount,
    progress,
    progressBar
  } = getBulkElements();
  const total = bulkState.files.length;
  const completed = getCompletedCount();
  const percentage = total ? Math.round((completed / total) * 100) : 0;

  if (selectedCount) selectedCount.textContent = String(total);
  if (uploadedCount) uploadedCount.textContent = String(bulkState.uploadedCount);
  if (failedCount) failedCount.textContent = String(bulkState.failedCount);

  if (progress) {
    progress.setAttribute("aria-valuenow", String(percentage));
  }

  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
  }
}

function renderBulkFileList() {
  const { fileList } = getBulkElements();
  if (!fileList) return;

  if (!bulkState.files.length) {
    fileList.innerHTML = "";
    return;
  }

  fileList.innerHTML = bulkState.files
    .map((item, index) => `
      <div class="bulk-file-row" data-bulk-file-index="${index}">
        <div class="bulk-file-meta">
          <span class="bulk-file-name">${item.file.name}</span>
          <span class="bulk-file-size">${formatFileSize(item.file.size)}</span>
        </div>
        <span class="bulk-file-status ${item.status}">${item.label}</span>
      </div>
    `)
    .join("");
}

function setFileStatus(index, status, label) {
  const item = bulkState.files[index];
  if (!item) return;

  item.status = status;
  item.label = label;
  renderBulkFileList();
}

function resetBulkProgress() {
  bulkState.uploadedCount = 0;
  bulkState.failedCount = 0;
  bulkState.files = [];
  updateBulkSummary();
  renderBulkFileList();
}

function handleBulkFileSelection(event) {
  const files = Array.from(event.target.files || []);

  bulkState.files = files.map((file) => ({
    file,
    status: "queued",
    label: "Queued"
  }));
  bulkState.uploadedCount = 0;
  bulkState.failedCount = 0;

  updateBulkSummary();
  renderBulkFileList();
  setBulkStatus(files.length ? `${files.length} image${files.length === 1 ? "" : "s"} ready.` : "", "working");
}

function clearBulkQueue() {
  const { fileInput } = getBulkElements();

  if (bulkState.isUploading) return;
  if (fileInput) fileInput.value = "";

  resetBulkProgress();
  setBulkStatus("", "");
}

function validateBulkUpload(name) {
  if (!bulkEnv.cloudName || !bulkEnv.uploadPreset) {
    throw new Error("Cloudinary settings are missing.");
  }

  if (!name.trim()) {
    throw new Error("Add an upload name before uploading.");
  }

  if (!bulkState.files.length) {
    throw new Error("Choose one or more images before uploading.");
  }

  const invalidFile = bulkState.files.find((item) => !isAcceptedBulkFile(item.file));
  if (invalidFile) {
    throw new Error(`${invalidFile.file.name} is not an image.`);
  }

  const oversizedFile = bulkState.files.find((item) => item.file.size > bulkEnv.maxFileSizeMb * 1024 * 1024);
  if (oversizedFile) {
    throw new Error(`${oversizedFile.file.name} is larger than ${bulkEnv.maxFileSizeMb} MB.`);
  }
}

function getBulkUploadFolder(name) {
  return `wedding-app/guests/bulk-upload/${normalizeBulkName(name) || "unnamed"}/`;
}

async function uploadBulkFile(file, uploaderName) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", bulkEnv.uploadPreset);
  formData.append("folder", getBulkUploadFolder(uploaderName));
  formData.append("tags", BULK_GALLERY_TAG);
  formData.append(
    "context",
    `inviteKey=${BULK_INVITE_KEY}|uploaderName=${sanitizeContextValue(uploaderName)}`
  );

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${bulkEnv.cloudName}/auto/upload`,
    {
      method: "POST",
      body: formData
    }
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Cloudinary upload failed.");
  }

  return data;
}

async function handleBulkUploadSubmit(event) {
  event.preventDefault();

  const { nameInput } = getBulkElements();
  const uploaderName = nameInput?.value || "";

  try {
    validateBulkUpload(uploaderName);
  } catch (error) {
    setBulkStatus(error.message, "error");
    return;
  }

  bulkState.isUploading = true;
  bulkState.uploadedCount = 0;
  bulkState.failedCount = 0;
  bulkState.files.forEach((item) => {
    item.status = "queued";
    item.label = "Queued";
  });
  setBulkControlsDisabled(true);
  updateBulkSummary();
  renderBulkFileList();

  for (const [index, item] of bulkState.files.entries()) {
    setFileStatus(index, "working", "Uploading");
    setBulkStatus(`Uploading ${index + 1} of ${bulkState.files.length}: ${item.file.name}`, "working");

    try {
      await uploadBulkFile(item.file, uploaderName);
      bulkState.uploadedCount += 1;
      setFileStatus(index, "success", "Uploaded");
    } catch (error) {
      console.error(error);
      bulkState.failedCount += 1;
      setFileStatus(index, "error", "Failed");
    }

    updateBulkSummary();
  }

  bulkState.isUploading = false;
  setBulkControlsDisabled(false);

  if (bulkState.failedCount) {
    setBulkStatus(`${bulkState.uploadedCount} uploaded, ${bulkState.failedCount} failed.`, "error");
    return;
  }

  setBulkStatus(`${bulkState.uploadedCount} image${bulkState.uploadedCount === 1 ? "" : "s"} uploaded successfully.`, "success");
}

function initializeBulkUploadPage() {
  const { form, fileInput, clearButton, helpText } = getBulkElements();

  if (helpText) {
    helpText.textContent = `Images only. Max size: ${bulkEnv.maxFileSizeMb} MB.`;
  }

  if (form) {
    form.addEventListener("submit", handleBulkUploadSubmit);
  }

  if (fileInput) {
    fileInput.addEventListener("change", handleBulkFileSelection);
  }

  if (clearButton) {
    clearButton.addEventListener("click", clearBulkQueue);
  }

  updateBulkSummary();
}

initializeBulkUploadPage();
