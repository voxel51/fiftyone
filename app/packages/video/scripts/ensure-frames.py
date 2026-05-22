"""
Generates public/frames/000001.png ... 000510.png if they do not already
exist, using the FiftyOne SDK's per-frame sampling. The PNGs are used by
the demo's "Compare with SDK frame" feature to verify that the browser-side
VideoDecoder output matches the SDK's ffmpeg-decoded reference frames.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(HERE)
VIDEO = os.path.join(PKG, "public", "frame_indexed.mp4")
FRAMES_DIR = os.path.join(PKG, "public", "frames")
# `to_frames` nests output under <output_dir>/<video_basename>/, so the first
# extracted frame lands here. The browser fetches from the same nested path.
SENTINEL = os.path.join(FRAMES_DIR, "frame_indexed", "000001.png")

if os.path.exists(SENTINEL):
    sys.exit(0)

try:
    import fiftyone as fo
except ImportError:
    sys.stderr.write(
        "fiftyone is required to generate per-frame PNGs. Install with:\n"
        "  pip install fiftyone\n"
    )
    sys.exit(1)

if not os.path.exists(VIDEO):
    sys.stderr.write(f"{VIDEO} does not exist — run ensure-video.sh first\n")
    sys.exit(1)

print(f"Sampling {VIDEO} → {FRAMES_DIR}/...")

dataset = fo.Dataset("video-frame-indexed-ensure", overwrite=True)
try:
    dataset.add_sample(fo.Sample(filepath=VIDEO))
    dataset.to_frames(
        sample_frames=True,
        output_dir=FRAMES_DIR,
        frames_patt="%06d.png",
    )
finally:
    dataset.delete()

written = os.path.join(FRAMES_DIR, "frame_indexed")
print(f"Wrote {len(os.listdir(written))} frames to {written}")
