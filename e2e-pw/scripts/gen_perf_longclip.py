"""
Perf fixture generator for e2e-pw/scripts/playback-perf.cjs.
Registers a long (~10 minute, 30 fps) clip
as a video dataset with dense per-frame detections, so Annotate's whole-clip
label warmup actually fans out: 18000 frames / chunkSize 60 = 300 chunks.

Any long mp4 works; a static 10-minute clip encoded with ffmpeg is enough.

Usage:
    python gen_perf_longclip.py --video /path/to/longclip.mp4 [--dets-per-frame N] [--name NAME] [--frames N]
"""
import argparse
import random

import fiftyone as fo

SEED = 51

parser = argparse.ArgumentParser()
parser.add_argument("--video", type=str, required=True)
parser.add_argument("--dets-per-frame", type=int, default=10)
parser.add_argument("--frames", type=int, default=18000)
parser.add_argument("--name", type=str, default="perf_longclip")
args = parser.parse_args()

random.seed(SEED)

if args.name in fo.list_datasets():
    fo.delete_dataset(args.name)

dataset = fo.Dataset(args.name, persistent=True)
sample = fo.Sample(filepath=args.video)

CLASSES = ["person", "car", "dog", "package", "bicycle"]
N_FRAMES = args.frames

# Detections walk smoothly frame to frame so tracks/interpolation have
# something realistic to chew on, rather than pure per-frame noise.
tracks = []
for i in range(args.dets_per_frame):
    tracks.append(
        {
            "label": CLASSES[i % len(CLASSES)],
            "x": random.uniform(0.05, 0.75),
            "y": random.uniform(0.05, 0.75),
            "w": random.uniform(0.06, 0.18),
            "h": random.uniform(0.06, 0.18),
            "dx": random.uniform(-0.004, 0.004),
            "dy": random.uniform(-0.004, 0.004),
            "index": i + 1,
        }
    )

for fn in range(1, N_FRAMES + 1):
    dets = []
    for t in tracks:
        t["x"] += t["dx"]
        t["y"] += t["dy"]
        if not (0.0 <= t["x"] <= 1.0 - t["w"]):
            t["dx"] *= -1
            t["x"] = min(max(t["x"], 0.0), 1.0 - t["w"])
        if not (0.0 <= t["y"] <= 1.0 - t["h"]):
            t["dy"] *= -1
            t["y"] = min(max(t["y"], 0.0), 1.0 - t["h"])
        dets.append(
            fo.Detection(
                label=t["label"],
                bounding_box=[t["x"], t["y"], t["w"], t["h"]],
                index=t["index"],
                confidence=random.uniform(0.5, 1.0),
            )
        )
    sample.frames[fn] = fo.Frame(detections=fo.Detections(detections=dets))

dataset.add_sample(sample)
dataset.compute_metadata()

print(f"dataset={args.name} frames={N_FRAMES} dets/frame={args.dets_per_frame}")
print(f"total detections={N_FRAMES * args.dets_per_frame}")
print(f"chunks at chunkSize=60: {N_FRAMES // 60}")
