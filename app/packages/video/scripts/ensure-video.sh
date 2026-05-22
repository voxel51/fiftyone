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
# Black background with a centered white frame number (1…510) drawn on each
# frame — same content as the user's original ask. Most pixels are pure
# black, only the digit edges have any chroma activity, which makes the
# cross-check diff easy to read at a glance.
# yuv444p (full-res chroma) is required for odd dimensions — H.264's
# yuv420p needs both width and height divisible by 2 so the half-res
# chroma planes have integer dimensions.
ffmpeg -hide_banner -loglevel error \
  -f lavfi -i "color=c=black:s=51x51:r=30:d=1.7" \
  -vf "drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='%{eif\\:n+1\\:d}':fontsize=14:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
  -frames:v 51 \
  -c:v libx264 -pix_fmt yuv444p -profile:v high444 -preset fast \
  -movflags +faststart \
  -y "$VIDEO"
echo "Wrote $VIDEO"
