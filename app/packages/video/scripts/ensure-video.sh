#!/usr/bin/env bash
#
# Generates public/frame_indexed.mp4 if it does not already exist.
# 510x510, 30 fps, 17 s (510 frames) — uses ffmpeg's `testsrc` filter, which
# renders a built-in frame counter on each frame so frame-decoding demos can
# verify they're showing the right frame visually.
#
set -euo pipefail

cd "$(dirname "$0")/.."

VIDEO="public/frame_indexed.mp4"

if [ -f "$VIDEO" ]; then
  exit 0
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to generate $VIDEO. Install with:"
  echo "  macOS:   brew install ffmpeg"
  echo "  Ubuntu:  sudo apt-get install ffmpeg"
  exit 1
fi

mkdir -p public
echo "Generating $VIDEO (510 frames, 30 fps)..."
ffmpeg -hide_banner -loglevel error \
  -f lavfi -i "testsrc=duration=17:size=510x510:rate=30" \
  -c:v libx264 -pix_fmt yuv420p -preset fast \
  -movflags +faststart \
  -y "$VIDEO"
echo "Wrote $VIDEO"
