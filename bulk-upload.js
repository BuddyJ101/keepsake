const BULK_GALLERY_TAG = "wedding-app";
const BULK_INVITE_KEY = "bulk-upload";
const BYTES_PER_MB = 1024 * 1024;
const MAX_COMPRESS_INPUT_MB = 500;
const COMPRESSION_TARGET_MB = 90;
const COMPRESSION_AUDIO_BITRATE = 96_000;
const FFMPEG_ASSET_PATH = "assets/ffmpeg";

const bulkEnv = {
  cloudName: document.body.dataset.cloudName,
  uploadPreset: document.body.dataset.uploadPreset,
  maxFileSizeMb: Number(document.body.dataset.maxFileSizeMb || "100")
};

const bulkState = {
  files: [], uploadedCount: 0, failedCount: 0, isUploading: false,
  compressionIndex: null, ffmpeg: null, ffmpegScriptPromise: null
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
  return String(name || "").trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase();
}

function sanitizeContextValue(value) {
  return String(value || "").trim().replace(/[|=]/g, " ");
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value || "");
  return element.innerHTML;
}

function formatFileSize(bytes) {
  if (bytes < BYTES_PER_MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}

function getBulkMediaType(file) {
  const mimeType = String(file.type || "").toLowerCase();
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/") || ["mov", "qt"].includes(extension)) return "video";
  return null;
}

function isAcceptedBulkFile(file) {
  return getBulkMediaType(file) !== null;
}

function needsCompression(file) {
  return getBulkMediaType(file) === "video" && file.size > bulkEnv.maxFileSizeMb * BYTES_PER_MB;
}

function canCompressFile(file) {
  return needsCompression(file) && file.size <= MAX_COMPRESS_INPUT_MB * BYTES_PER_MB;
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

function updateBulkSummary() {
  const { selectedCount, uploadedCount, failedCount, progress, progressBar } = getBulkElements();
  const total = bulkState.files.length;
  const completed = bulkState.uploadedCount + bulkState.failedCount;
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  if (selectedCount) selectedCount.textContent = String(total);
  if (uploadedCount) uploadedCount.textContent = String(bulkState.uploadedCount);
  if (failedCount) failedCount.textContent = String(bulkState.failedCount);
  if (progress) progress.setAttribute("aria-valuenow", String(percentage));
  if (progressBar) progressBar.style.width = `${percentage}%`;
}

function renderBulkFileList() {
  const { fileList } = getBulkElements();
  if (!fileList) return;
  if (!bulkState.files.length) {
    fileList.innerHTML = "";
    return;
  }

  fileList.innerHTML = bulkState.files.map((item, index) => {
    const isCompressing = bulkState.compressionIndex === index;
    const sizeText = item.compressedSize
      ? `${formatFileSize(item.originalFile.size)} → ${formatFileSize(item.compressedSize)}`
      : formatFileSize(item.file.size);
    const action = item.needsCompression
      ? `<button class="btn btn-sm ${isCompressing ? "btn-outline-light" : "btn-warning"} bulk-file-action"
          type="button" data-compression-action="${isCompressing ? "cancel" : "compress"}"
          data-bulk-file-index="${index}">${isCompressing ? "Cancel" : "Compress for upload"}</button>`
      : "";
    return `
      <div class="bulk-file-row" data-bulk-file-index="${index}">
        <div class="bulk-file-meta">
          <span class="bulk-file-name">${escapeHtml(item.file.name)}</span>
          <span class="bulk-file-size">${sizeText}</span>
          ${item.detail ? `<span class="bulk-file-detail">${escapeHtml(item.detail)}</span>` : ""}
        </div>
        <div class="bulk-file-result">
          <span class="bulk-file-status ${item.status}">${escapeHtml(item.label)}</span>
          ${action}
        </div>
      </div>`;
  }).join("");
}

function setFileStatus(index, status, label, detail = "") {
  const item = bulkState.files[index];
  if (!item) return;
  item.status = status;
  item.label = label;
  item.detail = detail;
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
  bulkState.files = files.map((file) => {
    const oversizedVideo = needsCompression(file);
    const compressible = canCompressFile(file);
    let status = "queued";
    let label = "Queued";
    let detail = "";
    if (oversizedVideo && compressible) {
      status = "working";
      label = "Compression required";
      detail = "Use a desktop computer. Compression can take several minutes.";
    } else if (oversizedVideo) {
      status = "error";
      label = "Too large";
      detail = `The browser compressor accepts videos up to ${MAX_COMPRESS_INPUT_MB} MB.`;
    }
    return {
      file, originalFile: file, compressedSize: null,
      needsCompression: oversizedVideo && compressible, status, label, detail
    };
  });
  bulkState.uploadedCount = 0;
  bulkState.failedCount = 0;
  updateBulkSummary();
  renderBulkFileList();
  setBulkStatus(files.length ? `${files.length} file${files.length === 1 ? "" : "s"} ready.` : "", "working");
}

function clearBulkQueue() {
  const { fileInput } = getBulkElements();
  if (bulkState.isUploading || bulkState.compressionIndex !== null) return;
  if (fileInput) fileInput.value = "";
  resetBulkProgress();
  setBulkStatus("", "");
}

function validateBulkUpload(name) {
  if (!bulkEnv.cloudName || !bulkEnv.uploadPreset) throw new Error("Cloudinary settings are missing.");
  if (!name.trim()) throw new Error("Add an upload name before uploading.");
  if (!bulkState.files.length) throw new Error("Choose one or more images or videos before uploading.");
  const invalidFile = bulkState.files.find((item) => !isAcceptedBulkFile(item.file));
  if (invalidFile) throw new Error(`${invalidFile.file.name} is not a supported image or video.`);
  const pendingCompression = bulkState.files.find((item) => item.needsCompression);
  if (pendingCompression) throw new Error(`Compress ${pendingCompression.file.name} before uploading.`);
  const oversizedFile = bulkState.files.find((item) => item.file.size > bulkEnv.maxFileSizeMb * BYTES_PER_MB);
  if (oversizedFile) throw new Error(`${oversizedFile.file.name} is larger than ${bulkEnv.maxFileSizeMb} MB.`);
}

function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Could not read the video duration."));
    }, 30_000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      window.clearTimeout(timeoutId);
      const duration = video.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) reject(new Error("The video duration is invalid."));
      else resolve(duration);
    };
    video.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("This browser could not read the video metadata."));
    };
    video.src = objectUrl;
  });
}

function calculateVideoBitrate(durationSeconds) {
  const targetBits = COMPRESSION_TARGET_MB * BYTES_PER_MB * 8;
  const videoBitrate = Math.floor((targetBits * 0.96) / durationSeconds - COMPRESSION_AUDIO_BITRATE);
  if (videoBitrate < 250_000) {
    throw new Error("This video is too long to compress below 100 MB at an acceptable quality.");
  }
  return videoBitrate;
}

function loadFfmpegScript() {
  if (window.FFmpegWASM?.FFmpeg) return Promise.resolve();
  if (bulkState.ffmpegScriptPromise) return bulkState.ffmpegScriptPromise;
  bulkState.ffmpegScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${FFMPEG_ASSET_PATH}/ffmpeg.js`;
    script.onload = resolve;
    script.onerror = () => reject(new Error("The video compressor could not be loaded."));
    document.head.appendChild(script);
  });
  return bulkState.ffmpegScriptPromise;
}

async function getFfmpeg() {
  if (!window.WebAssembly || !window.Worker) throw new Error("This browser does not support local video compression.");
  if (bulkState.ffmpeg?.loaded) return bulkState.ffmpeg;
  await loadFfmpegScript();
  const ffmpeg = new window.FFmpegWASM.FFmpeg();
  const coreURL = new URL(`${FFMPEG_ASSET_PATH}/ffmpeg-core.js`, document.baseURI).href;
  const wasmURL = new URL(`${FFMPEG_ASSET_PATH}/ffmpeg-core.wasm`, document.baseURI).href;
  await ffmpeg.load({ coreURL, wasmURL });
  bulkState.ffmpeg = ffmpeg;
  return ffmpeg;
}

function getCompressedFileName(fileName) {
  return `${String(fileName || "video").replace(/\.[^.]+$/, "")}-compressed.mp4`;
}

async function cleanupFfmpegFiles(ffmpeg, paths) {
  await Promise.all(paths.map(async (path) => {
    try { await ffmpeg.deleteFile(path); } catch { /* A failed encode may not create every file. */ }
  }));
}

async function compressBulkVideo(index) {
  const item = bulkState.files[index];
  if (!item?.needsCompression || bulkState.compressionIndex !== null || bulkState.isUploading) return;
  const originalFile = item.originalFile;
  const extension = String(originalFile.name || "video.mov").split(".").pop().replace(/[^a-zA-Z0-9]/g, "") || "mov";
  const uniqueId = Date.now();
  const inputPath = `input-${uniqueId}.${extension}`;
  const outputPath = `output-${uniqueId}.mp4`;
  bulkState.compressionIndex = index;
  setBulkControlsDisabled(true);
  setFileStatus(index, "working", "Preparing compressor", "Loading the desktop compression engine…");
  setBulkStatus(`Preparing ${originalFile.name} for compression…`, "working");

  let ffmpeg;
  let progressHandler;
  try {
    const duration = await getVideoDuration(originalFile);
    const videoBitrate = calculateVideoBitrate(duration);
    if (bulkState.compressionIndex !== index) throw new DOMException("Compression cancelled", "AbortError");
    ffmpeg = await getFfmpeg();
    if (bulkState.compressionIndex !== index) throw new DOMException("Compression cancelled", "AbortError");
    progressHandler = ({ progress }) => {
      if (bulkState.compressionIndex !== index) return;
      const percentage = Math.max(0, Math.min(99, Math.round((progress || 0) * 100)));
      setFileStatus(index, "working", `Compressing ${percentage}%`, "Keep this tab open until compression finishes.");
    };
    ffmpeg.on("progress", progressHandler);
    setFileStatus(index, "working", "Reading video", "Large videos require substantial desktop memory.");
    await ffmpeg.writeFile(inputPath, new Uint8Array(await originalFile.arrayBuffer()));
    setFileStatus(index, "working", "Compressing 0%", "Keep this tab open until compression finishes.");
    const exitCode = await ffmpeg.exec([
      "-i", inputPath,
      "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
      "-c:v", "libx264", "-preset", "veryfast",
      "-b:v", String(videoBitrate), "-maxrate", String(videoBitrate), "-bufsize", String(videoBitrate * 2),
      "-c:a", "aac", "-b:a", String(COMPRESSION_AUDIO_BITRATE), "-movflags", "+faststart", outputPath
    ]);
    if (exitCode !== 0) throw new Error("FFmpeg could not decode or compress this video.");
    setFileStatus(index, "working", "Finalizing", "Checking the compressed file size…");
    const outputData = await ffmpeg.readFile(outputPath);
    const compressedFile = new File([outputData], getCompressedFileName(originalFile.name), { type: "video/mp4" });
    if (compressedFile.size >= bulkEnv.maxFileSizeMb * BYTES_PER_MB) {
      throw new Error("The compressed video is still too large. Use a desktop compressor with a lower-quality setting.");
    }
    item.file = compressedFile;
    item.compressedSize = compressedFile.size;
    item.needsCompression = false;
    setFileStatus(index, "queued", "Ready to upload", "Compressed locally to H.264 MP4.");
    setBulkStatus(`${originalFile.name} compressed from ${formatFileSize(originalFile.size)} to ${formatFileSize(compressedFile.size)}.`, "success");
  } catch (error) {
    if (error?.name === "AbortError" || bulkState.compressionIndex !== index) {
      setFileStatus(index, "working", "Compression required", "Compression was cancelled; the original file is still selected.");
      setBulkStatus("Compression cancelled. The original video was not changed.", "working");
    } else {
      console.error(error);
      item.file = originalFile;
      item.compressedSize = null;
      item.needsCompression = true;
      setFileStatus(index, "error", "Compression failed", error.message || "Try a native desktop video compressor.");
      setBulkStatus(error.message || "Video compression failed.", "error");
    }
  } finally {
    if (progressHandler && ffmpeg) ffmpeg.off("progress", progressHandler);
    if (ffmpeg?.loaded) await cleanupFfmpegFiles(ffmpeg, [inputPath, outputPath]);
    if (bulkState.compressionIndex === index) bulkState.compressionIndex = null;
    setBulkControlsDisabled(false);
    renderBulkFileList();
  }
}

function cancelBulkCompression(index) {
  if (bulkState.compressionIndex !== index) return;
  const item = bulkState.files[index];
  bulkState.compressionIndex = null;
  if (bulkState.ffmpeg) {
    bulkState.ffmpeg.terminate();
    bulkState.ffmpeg = null;
  }
  if (item) {
    item.file = item.originalFile;
    item.compressedSize = null;
    item.needsCompression = true;
  }
  setBulkControlsDisabled(false);
  renderBulkFileList();
}

function handleCompressionAction(event) {
  const button = event.target.closest("[data-compression-action]");
  if (!button) return;
  const index = Number(button.dataset.bulkFileIndex);
  if (!Number.isInteger(index)) return;
  if (button.dataset.compressionAction === "cancel") cancelBulkCompression(index);
  else compressBulkVideo(index);
}

function getBulkUploadFolder(name) {
  return `wedding-app/guests/bulk-upload/${normalizeBulkName(name) || "unnamed"}/`;
}

async function uploadBulkFile(file, uploaderName) {
  const mediaType = getBulkMediaType(file);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", bulkEnv.uploadPreset);
  formData.append("folder", getBulkUploadFolder(uploaderName));
  formData.append("tags", BULK_GALLERY_TAG);
  formData.append("context", `inviteKey=${BULK_INVITE_KEY}|uploaderName=${sanitizeContextValue(uploaderName)}`);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${bulkEnv.cloudName}/${mediaType}/upload`, {
    method: "POST", body: formData
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Cloudinary upload failed.");
  return data;
}

async function handleBulkUploadSubmit(event) {
  event.preventDefault();
  const { nameInput } = getBulkElements();
  const uploaderName = nameInput?.value || "";
  try { validateBulkUpload(uploaderName); } catch (error) {
    setBulkStatus(error.message, "error");
    return;
  }
  bulkState.isUploading = true;
  bulkState.uploadedCount = 0;
  bulkState.failedCount = 0;
  bulkState.files.forEach((item) => { item.status = "queued"; item.label = "Queued"; item.detail = ""; });
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
      setFileStatus(index, "error", "Upload failed", error.message || "Cloudinary upload failed.");
    }
    updateBulkSummary();
  }
  bulkState.isUploading = false;
  setBulkControlsDisabled(false);
  if (bulkState.failedCount) {
    setBulkStatus(`${bulkState.uploadedCount} uploaded, ${bulkState.failedCount} failed.`, "error");
    return;
  }
  setBulkStatus(`${bulkState.uploadedCount} file${bulkState.uploadedCount === 1 ? "" : "s"} uploaded successfully.`, "success");
}

function initializeBulkUploadPage() {
  const { form, fileInput, clearButton, helpText, fileList } = getBulkElements();
  if (helpText) {
    helpText.textContent = `Images and videos up to ${bulkEnv.maxFileSizeMb} MB. Desktop compression is available for videos up to ${MAX_COMPRESS_INPUT_MB} MB.`;
  }
  if (form) form.addEventListener("submit", handleBulkUploadSubmit);
  if (fileInput) fileInput.addEventListener("change", handleBulkFileSelection);
  if (clearButton) clearButton.addEventListener("click", clearBulkQueue);
  if (fileList) fileList.addEventListener("click", handleCompressionAction);
  updateBulkSummary();
}

initializeBulkUploadPage();
