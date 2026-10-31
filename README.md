# NguonC VietSub for Zangetsu — v0.2.0 (experimental)

This package is an experimental JavaScript provider starter for Zangetsu.

## What changed in v0.2
- No external subtitle files are required.
- Episode lists prefer server groups whose names contain `Vietsub` / `Viet Sub` / `Phụ đề Việt`.
- The intention is to play a Vietsub/hardsub cut when NguonC provides one.
- Search, animation catalogue, latest catalogue, detail and episode discovery are included.

## Important limitations
- A server label containing “Vietsub” is only a hint; it does not prove every episode has Vietnamese subtitles burned into the video.
- NguonC's public API commonly supplies `embed` URLs. An embed page is not the same as a direct HLS/MP4 stream.
- This package returns a video source only if the API provides a direct `.m3u8` or `.mp4` URL.
- It does not scrape protected embed pages, defeat access controls, or claim support for hosts without a documented compatible extractor.
- The JavaScript provider contract and player output have not been tested against your exact TestFlight build. Treat this as a development starter, not a ready-to-install guaranteed source.

## Install after validation
Upload this folder structure to a Git repository or static host, then add the raw `index.json` URL in Zangetsu → Settings → Sources → Add repo.

## Files
- `index.json`
- `providers/nguonc.js`
