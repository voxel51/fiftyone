#!/usr/bin/env python
"""
Set up a dataset for the video-annotation / propagation demo
(branch: feat/va-propagation).

What it does (all idempotent — safe to re-run):

  1. Loads `quickstart-video` (from the zoo if it isn't present) and makes
     it persistent; computes metadata (the surface needs frame_rate /
     total_frame_count / frame_width|height).
  2. Creates a SAMPLE-level Detections field named "detections" and makes it
     the ONLY active annotation schema. This is the field the annotation UI
     drives; with `frames.detections` left out of the active schema, labels
     still forward to the frames under the hood. (Enabling the sample field
     and disabling `frames.detections` is what keeps the annotation logic
     happy.)
  3. Declares the frame fields the propagation pipeline writes
     (`frames.detections.detections.keyframe` / `.propagation`) so saves are
     clean instead of logging "missing field, initializing" each time.
  4. Adds an `events` TemporalDetections field with a few demo events per
     sample (approach / pass / depart) so the timeline shows TD rows to edit.
  5. Backfills a stable cross-frame `Instance._id` on every tracked
     detection (one per (label, index) track, per sample) so existing tracks
     are selectable as instances — propagation works without drawing fresh
     boxes.
  6. Materializes per-frame images via `to_frames(sample_frames=True)` —
     what the ImaVid image stream serves frames from — for both datasets.

It also creates a second copy, `<name>-bare`, with all label data cleared
(boxes, events) but the same schema + annotation config retained — a clean
slate for demoing "draw a box → mark keyframes → propagate" from scratch.

IMPORTANT — database: FiftyOne reads the dataset from whatever
`FIFTYONE_DATABASE_NAME` points at. Run this script AND the app with the
SAME value. The demo uses `fiftyone-ha`, e.g.:

    FIFTYONE_DATABASE_NAME=fiftyone-ha python setup_sam2_demo.py

Usage:
    python setup_sam2_demo.py [DATASET_NAME]   # default: va-demo
"""

import sys

import fiftyone as fo
import fiftyone.zoo as foz

DATASET_NAME = sys.argv[1] if len(sys.argv) > 1 else "va-demo"
BARE_NAME = f"{DATASET_NAME}-bare"
DETECTIONS_FIELD = "detections"
EVENTS_FIELD = "events"
FALLBACK_CLASSES = ["vehicle", "road sign", "person"]


def load_dataset(name):
    if fo.dataset_exists(name):
        print(f"• Loading existing dataset '{name}'")
        ds = fo.load_dataset(name)
    else:
        print(
            f"• Dataset '{name}' not found — loading 'quickstart-video' from the zoo"
        )
        ds = foz.load_zoo_dataset("quickstart-video", dataset_name=name)

    ds.persistent = True

    if ds.media_type != "video":
        raise SystemExit(
            f"'{name}' is {ds.media_type}, expected a video dataset"
        )

    # The surface requires populated VideoMetadata; compute_metadata skips
    # samples that already have it.
    print("• Computing metadata (frame_rate / total_frame_count / dimensions)")
    ds.compute_metadata()
    return ds


def materialize_frames(ds):
    """The ImaVid image stream serves per-frame images materialized by
    `to_frames(sample_frames=True)`; sample them to disk up front so the
    surface has frames to render."""
    print(
        f"• Materializing frame images for '{ds.name}' (to_frames sample_frames=True)"
    )
    ds.to_frames(sample_frames=True)


def ensure_sample_detections_field(ds):
    if DETECTIONS_FIELD in ds.get_field_schema():
        print(f"= sample field '{DETECTIONS_FIELD}' already exists")
        return
    print(f"+ adding sample field '{DETECTIONS_FIELD}' (Detections)")
    ds.add_sample_field(
        DETECTIONS_FIELD,
        fo.EmbeddedDocumentField,
        embedded_doc_type=fo.Detections,
    )


def ensure_frame_fields(ds):
    """Declare keyframe/propagation so propagation saves don't log
    'missing field, initializing'. `instance` is built in — no declaration."""
    frame_schema = ds.get_frame_field_schema(flat=True)
    specs = [
        ("detections.detections.keyframe", fo.BooleanField),
        ("detections.detections.propagation", fo.DictField),
    ]
    for path, ftype in specs:
        if path in frame_schema:
            print(f"= frame field '{path}' already declared")
            continue
        print(f"+ declaring frame field '{path}'")
        ds.add_frame_field(path, ftype)


def add_demo_events(ds):
    """Give each sample a few `TemporalDetections` so the timeline shows TD
    rows to drag/edit. Splits the clip into approach/pass/depart thirds."""
    if EVENTS_FIELD not in ds.get_field_schema():
        print(f"+ adding sample field '{EVENTS_FIELD}' (TemporalDetections)")
        ds.add_sample_field(
            EVENTS_FIELD,
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.TemporalDetections,
        )

    print("• Populating demo temporal events on each sample")
    for sample in ds.iter_samples(progress=True, autosave=True):
        n = (
            getattr(sample.metadata, "total_frame_count", None)
            if sample.metadata
            else None
        )
        if not n:
            n = max(sample.frames.keys()) if sample.frames else 120
        a = max(1, n // 3)
        b = max(a + 1, (2 * n) // 3)
        sample[EVENTS_FIELD] = fo.TemporalDetections(
            detections=[
                fo.TemporalDetection(label="approach", support=[1, a]),
                fo.TemporalDetection(label="pass", support=[a + 1, b]),
                fo.TemporalDetection(label="depart", support=[b + 1, n]),
            ]
        )


def make_bare_copy(ds, bare_name):
    """Clone the configured dataset and clear all label DATA (boxes + events),
    keeping the field schema + annotation config so the PM can draw boxes and
    propagate on a clean slate."""
    if fo.dataset_exists(bare_name):
        print(f"• Replacing existing '{bare_name}'")
        fo.delete_dataset(bare_name)

    print(f"• Cloning '{ds.name}' → '{bare_name}' and clearing labels")
    bare = ds.clone(bare_name, persistent=True)

    # Sample-level fields can be cleared outright — they're schema anchors;
    # drawn boxes forward to the frames.
    bare.clear_sample_field(DETECTIONS_FIELD)
    bare.clear_sample_field(EVENTS_FIELD)
    bare.save()
    print(f"  '{bare_name}': sample-level labels cleared")
    return bare


def normalize_empty_frame_detections(ds):
    """Ensure EVERY frame (1..total_frame_count) has `detections` set to an
    empty `Detections` (empty list) — not None and not missing.

    The first draw on a frame emits a JSON Patch that adds into
    `/frames/N/detections/detections`, which requires that parent list to
    already exist; a null/absent `frames.N.detections` makes the draw fail
    with "Unable to add value with path". Iterate by frame NUMBER (not
    `frames.values()`, which skips frames with no document) so frames that
    `to_frames` materialized with null detections are covered too. Run this
    AFTER to_frames so those frame documents exist."""
    print(f"• Normalizing empty frame detections on '{ds.name}' (all frames)")
    for sample in ds.iter_samples(progress=True, autosave=True):
        n = (
            getattr(sample.metadata, "total_frame_count", None)
            if sample.metadata
            else None
        )
        if not n:
            n = max(sample.frames.keys()) if sample.frames else 0
        for fn in range(1, int(n) + 1):
            sample.frames[fn]["detections"] = fo.Detections(detections=[])


def configure_label_schema(ds):
    """Make `detections` and `events` the active annotation schemas with the
    dataset's classes; leave everything else (incl. frames.detections)
    inactive."""
    det_classes = (
        ds.distinct("frames.detections.detections.label") or FALLBACK_CLASSES
    )
    det_schema = {
        "type": "detections",
        "component": "dropdown",
        "attributes": [
            {
                "name": "id",
                "type": "id",
                "component": "text",
                "read_only": True,
            },
            {"name": "tags", "type": "list<str>", "component": "text"},
            {"name": "confidence", "type": "float", "component": "text"},
            {"name": "index", "type": "int", "component": "text"},
            {"name": "mask_path", "type": "str", "component": "text"},
        ],
        "classes": det_classes,
    }
    print(f"• Setting '{DETECTIONS_FIELD}' label schema (classes: {det_classes})")
    ds.update_label_schema(DETECTIONS_FIELD, det_schema, allow_new_attrs=True)

    evt_classes = ds.distinct(f"{EVENTS_FIELD}.detections.label") or [
        "approach",
        "pass",
        "depart",
    ]
    evt_schema = {
        "type": "temporaldetections",
        "component": "dropdown",
        "attributes": [
            {
                "name": "id",
                "type": "id",
                "component": "text",
                "read_only": True,
            },
            {"name": "tags", "type": "list<str>", "component": "text"},
            {"name": "confidence", "type": "float", "component": "text"},
        ],
        "classes": evt_classes,
    }
    print(f"• Setting '{EVENTS_FIELD}' label schema (classes: {evt_classes})")
    ds.update_label_schema(EVENTS_FIELD, evt_schema, allow_new_attrs=True)

    # `detections` + `events` are active in the sidebar; `frames.detections`
    # (and anything else) stays disabled but still receives forwarded labels.
    ds.active_label_schemas = [DETECTIONS_FIELD, EVENTS_FIELD]
    print(f"• active_label_schemas = {ds.active_label_schemas}")


def backfill_instances(ds):
    """One stable Instance._id per (label, index) track, per sample, on the
    frame-level detections. Idempotent: reuses any instance already present
    on a track before minting a new one."""
    tracks_done = 0
    samples_touched = 0
    for sample in ds.iter_samples(progress=True, autosave=True):
        by_track = {}  # (label, index) -> fo.Instance
        # Pass 1: adopt any instance a track already carries. `instance` is a
        # dynamic field — reading it when unset raises, so go through getattr.
        for frame in sample.frames.values():
            dets = frame.detections
            if dets is None:
                continue
            for det in dets.detections:
                if det.index is None:
                    continue
                existing = getattr(det, "instance", None)
                if existing is not None and existing.id:
                    by_track.setdefault((det.label, det.index), existing)

        # Pass 2: stamp every tracked detection with its track's instance,
        # minting one where the track had none.
        changed = False
        for frame in sample.frames.values():
            dets = frame.detections
            if dets is None:
                continue
            for det in dets.detections:
                if det.index is None:
                    continue
                key = (det.label, det.index)
                inst = by_track.get(key)
                if inst is None:
                    inst = fo.Instance()
                    by_track[key] = inst
                    tracks_done += 1
                current = getattr(det, "instance", None)
                if current is None or current.id != inst.id:
                    det.instance = inst
                    changed = True
        if changed:
            samples_touched += 1

    print(
        f"• Instance backfill: {tracks_done} new track instances across "
        f"{samples_touched} sample(s)"
    )


def main():
    print(f"Database: {fo.config.database_name}\n")
    ds = load_dataset(DATASET_NAME)
    ensure_sample_detections_field(ds)
    ensure_frame_fields(ds)
    add_demo_events(ds)
    backfill_instances(ds)
    configure_label_schema(ds)
    ds.save()
    materialize_frames(ds)

    bare = make_bare_copy(ds, BARE_NAME)
    materialize_frames(bare)
    normalize_empty_frame_detections(bare)

    print(
        f"\n✓ Done. Two datasets ready: '{ds.name}' (labeled) and "
        f"'{bare.name}' (clean slate)."
    )
    print("\nNext steps for testing SAM2 tracking:")
    print("  1. Start the app from this branch with the SAME database name:")
    print(
        f"       FIFTYONE_DATABASE_NAME={fo.config.database_name} <launch the app>"
    )
    print(f"  2. On '{ds.name}': open a video sample, switch to the Annotate")
    print(
        "     (video annotation) surface, select a tracked object (a 'person'"
    )
    print("     or 'vehicle' box), press K on two different frames to mark")
    print("     keyframes (detections have no keyframe attribute at rest, so")
    print("     Propagate/Track stays disabled until two exist), then click")
    print(
        "     'Track (SAM2)'. First run downloads the model ('Loading SAM2…');"
    )
    print("     then frames fill in. Use Stop in the status slot to cancel.")
    print(f"  3. On '{bare.name}': draw a fresh box, mark two keyframes, and")
    print("     Track (SAM2) to demo propagation from scratch.")


if __name__ == "__main__":
    main()
