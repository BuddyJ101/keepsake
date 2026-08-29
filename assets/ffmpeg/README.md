# Vendored ffmpeg.wasm runtime

This directory contains the browser distributions of:

- `@ffmpeg/ffmpeg` 0.12.10 (`ffmpeg.js` and `814.ffmpeg.js`)
- `@ffmpeg/core` 0.12.10 (`ffmpeg-core.js` and `ffmpeg-core.wasm`)

The files are loaded lazily by the bulk-upload page and are not used by the standard guest uploader.
The upstream project is [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) and is distributed under the MIT license.
