import {
  DetectionOverlay,
  overlayFactory,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import { useIsPlaying } from "../../playback/src/lib/playback/use-playback-state";
import { useEffect, useRef } from "react";
import { overlayAdapters } from "./overlayAdapters";
import type { FrameLabelSnapshot } from "./SyntheticLabelStream";

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

    const ctx = { field, editable };
    const next = new Set<string>();

    for (const adapter of Object.values(overlayAdapters)) {
      const labels = snapshot[adapter.snapshotKey] as unknown[] | undefined;
      if (!labels) continue;

      for (const data of labels) {
        const result = adapter.extract(data as never, ctx);
        if (!result) continue;
        next.add(result.id);

        const existing = scene.getOverlay(result.id);
        if (existing) {
          adapter.update(existing, data as never);
        } else {
          const overlay = overlayFactory.create(adapter.factoryKey, result.props);
          scene.addOverlay(overlay);
        }
        // Track every snapshot-backed overlay, not just ones we created.
        // External adds (e.g. detectionMode.create) must enter the
        // cleanup set too — otherwise the diff loop never removes them
        // when the user scrubs off their frame.
        trackedRef.current.add(result.id);
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
