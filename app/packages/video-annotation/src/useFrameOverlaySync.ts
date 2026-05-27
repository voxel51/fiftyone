import {
  type DetectionLabel,
  type DetectionOverlayOptions,
  DetectionOverlay,
  overlayFactory,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import { useIsPlaying } from "../../playback/src/lib/playback/use-playback-state";
import { useEffect, useRef } from "react";
import type { FrameLabelSnapshot, SyntheticBox } from "./SyntheticLabelStream";

/**
 * Diff the latest snapshot into Lighter overlays. Add unseen
 * ids, update moved ones in place, remove ids that fell out. Overlay
 * identity is preserved across commits — important during playback,
 * otherwise the remove-then-add churn races the Pixi render loop and
 * the overlays disappear between frames.
 *
 * Shared by both the native-video tile and the ImaVid tile — the diff
 * model is the same in both cases (overlay state is per current frame,
 * driven by `LABELS_STREAM_ID`).
 */
export function useFrameOverlaySync(
  scene: ReturnType<typeof useLighterSetupWithPixi>["scene"],
  snapshot: FrameLabelSnapshot | null,
  field: string,
  canonicalMediaReady: boolean
) {
  const trackedRef = useRef<Set<string>>(new Set());

  // Disable drag/resize while the stream is playing
  const isPlaying = useIsPlaying();
  const editable = !isPlaying;

  useEffect(() => {
    // Skip the diff until the current scene has its canonical media —
    // overlays added before then get burned in with a bad coordinate
    // context, and a later in-place `relativeBounds` mutation doesn't
    // fix them. The effect re-runs once `canonicalMediaReady` flips.
    if (!scene || !snapshot || !canonicalMediaReady) return;

    const next = new Set<string>();
    // todo - adapter pattern for other label types
    for (const det of snapshot.detections) {
      next.add(det.id);
      const existing = scene.getOverlay(det.id) as DetectionOverlay | undefined;
      const bounds = {
        x: det.bounding_box[0],
        y: det.bounding_box[1],
        width: det.bounding_box[2],
        height: det.bounding_box[3],
      };
      if (existing) {
        existing.relativeBounds = bounds;
      } else {
        const overlay = overlayFactory.create<
          DetectionOverlayOptions,
          DetectionOverlay
        >("detection", {
          id: det.id,
          label: toDetectionLabel(det),
          relativeBounds: bounds,
          field,
          draggable: editable,
          resizeable: editable,
        });
        scene.addOverlay(overlay);
        trackedRef.current.add(det.id);
      }
    }

    for (const id of Array.from(trackedRef.current)) {
      if (!next.has(id)) {
        scene.removeOverlay(id);
        trackedRef.current.delete(id);
      }
    }
  }, [scene, snapshot, field, canonicalMediaReady, editable]);

  useEffect(() => {
    if (!scene) return;

    for (const id of trackedRef.current) {
      const overlay = scene.getOverlay(id);
      if (overlay instanceof DetectionOverlay) {
        overlay.setDraggable(editable);
        overlay.setResizeable(editable);
      }
    }
  }, [scene, editable]);

  useEffect(() => {
    return () => {
      if (!scene) {
        return;
      }

      for (const id of trackedRef.current) {
        scene.removeOverlay(id);
      }

      trackedRef.current.clear();
    };
  }, [scene]);
}

function toDetectionLabel(box: SyntheticBox): DetectionLabel {
  return {
    label: box.label,
    bounding_box: box.bounding_box,
    // `index` and `instance` are what `COLOR_BY.INSTANCE` hashes on —
    // without them every detection of the same class would collapse to
    // a single color in instance mode.
    index: box.index,
    instance: box.instance,
  } as DetectionLabel;
}
