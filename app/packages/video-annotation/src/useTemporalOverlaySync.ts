/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  overlayFactory,
  TemporalOverlay,
  type TemporalLabel,
  type TemporalOptions,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import { activeFields, useModalSample } from "@fiftyone/state";
import { useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import { frameAt } from "../../playback/src/lib/playback/utils";
import { usePlayhead } from "../../playback/src/lib/playback/use-playback-state";

interface RawTemporalDetection {
  _id?: string;
  id?: string;
  label?: string;
  support?: [number, number];
  confidence?: number;
  [key: string]: unknown;
}

interface RawTemporalDetectionsField {
  _cls: "TemporalDetections";
  detections?: RawTemporalDetection[];
}

/**
 * Minimal scene surface the diff needs — typed against the lighter
 * scene's actual signatures but kept narrow so tests can mock with a
 * plain object.
 */
interface SceneLike {
  addOverlay(overlay: TemporalOverlay): void;
  removeOverlay(id: string): void;
  /** Used to adopt an overlay another code path created at the same id. */
  getOverlay(id: string): unknown;
}

export interface SyncTemporalOverlaysInput {
  scene: SceneLike;
  /**
   * Sample from the server-side store. Scene-side overlay edits are
   * not reflected here — overlays own their state until autosave
   * round-trips. Overlays added directly to the scene by other code
   * (e.g. `CreateTemporalDetectionCommand`) aren't in `overlays`, so
   * the eviction pass leaves them alone; they're adopted on the next
   * sync once the refetched sample carries their `_id`.
   */
  sample: Record<string, unknown> | null | undefined;
  activePaths: ReadonlySet<string>;
  /** Map<overlayId, overlay> — mutated in place to track surviving overlays. */
  overlays: Map<string, TemporalOverlay>;
  /** Factory hook so tests can inject a fake. */
  create?: (opts: TemporalOptions) => TemporalOverlay;
}

/**
 * Diff the sample's `TemporalDetections` fields against an existing
 * overlay map. Adds new TDs, updates changed ones in place (preserving
 * Lighter selection state), removes TDs no longer present.
 *
 * Pure-ish: mutates `overlays` and calls `scene.addOverlay` /
 * `removeOverlay`. Returns nothing.
 */
export function syncTemporalOverlays({
  scene,
  sample,
  activePaths,
  overlays,
  create = (opts) =>
    overlayFactory.create<TemporalOptions, TemporalOverlay>("temporal", opts),
}: SyncTemporalOverlaysInput): void {
  if (!sample) {
    for (const id of Array.from(overlays.keys())) {
      scene.removeOverlay(id);
      overlays.delete(id);
    }
    return;
  }

  const next = new Set<string>();

  for (const [fieldPath, value] of Object.entries(sample)) {
    if (!isTemporalDetectionsField(value)) continue;
    if (!activePaths.has(fieldPath)) continue;

    const detections = value.detections ?? [];
    for (const td of detections) {
      const detId = td._id ?? td.id;
      if (!detId) continue;

      const support = td.support;
      if (
        !Array.isArray(support) ||
        support.length !== 2 ||
        !Number.isFinite(support[0]) ||
        !Number.isFinite(support[1]) ||
        support[1] < support[0]
      ) {
        continue;
      }

      const id = `td-${fieldPath}-${detId}`;
      next.add(id);
      const label = td as unknown as TemporalLabel;

      // Adopt an existing overlay (ours or one `useCreateAnnotationLabel`
      // added) so concurrent paths don't double-add at the same id.
      const adopted =
        overlays.get(id) ??
        (scene.getOverlay(id) as TemporalOverlay | undefined);

      if (adopted) {
        // Overlay owns its label state post-creation — don't clobber
        // local edits with re-rendered sample data. The persistence
        // layer flushes the overlay's state at autosave; sample data
        // here is only used to determine which TDs exist.
        overlays.set(id, adopted);
      } else {
        const created = create({ id, field: fieldPath, label });
        scene.addOverlay(created);
        overlays.set(id, created);
      }
    }
  }

  for (const id of Array.from(overlays.keys())) {
    if (!next.has(id)) {
      scene.removeOverlay(id);
      overlays.delete(id);
    }
  }
}

function isTemporalDetectionsField(
  value: unknown
): value is RawTemporalDetectionsField {
  if (!value || typeof value !== "object") return false;
  const v = value as { _cls?: unknown; detections?: unknown };
  return v._cls === "TemporalDetections" && Array.isArray(v.detections);
}

/**
 * Keep the Lighter scene's `TemporalOverlay` set in sync with the
 * modal sample's `TemporalDetections` fields, and push the playhead
 * frame into each overlay so the time gate updates live.
 *
 * Mirrors {@link useFrameOverlaySync}'s shape: pass `scene` +
 * `canonicalMediaReady` from the host tile; the hook owns the diff
 * lifecycle. Cleans up every tracked overlay on scene change /
 * unmount. Locally-edited overlays are the source of truth — the
 * persistence layer ({@link useTemporalDetectionDeltaSupplier}) walks
 * scene overlays at autosave time, so unsynced edits stay in place
 * until the sample re-fetch lands.
 */
export function useTemporalOverlaySync(
  scene: ReturnType<typeof useLighterSetupWithPixi>["scene"],
  canonicalMediaReady: boolean
): void {
  const overlaysRef = useRef<Map<string, TemporalOverlay>>(new Map());

  const sample = useModalSample();
  const activePathsList = useRecoilValue(
    activeFields({ modal: true, expanded: false })
  );

  // Current playhead frame. fps comes from the sample (same source the TD
  // track build uses). Held in a ref so the sync effect can seed newly-added
  // overlays without re-running on every playhead tick.
  const playheadSec = usePlayhead();
  const frameRate = sample?.frameRate;
  const currentFrame =
    frameRate && Number.isFinite(frameRate) && frameRate > 0
      ? frameAt(playheadSec, frameRate)
      : null;
  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;

  useEffect(() => {
    if (!scene || !canonicalMediaReady) return;

    const activePaths = new Set(activePathsList);
    const baseSample = (sample?.sample as Record<string, unknown>) ?? null;
    syncTemporalOverlays({
      scene,
      sample: baseSample,
      activePaths,
      overlays: overlaysRef.current,
    });

    // Seed the time gate on freshly-added overlays so a TD in range at the
    // initial frame renders on first load. The playhead-push effect below
    // only fires on *subsequent* playhead changes, so without this a TD in
    // range stays hidden until the first scrub.
    if (currentFrameRef.current !== null) {
      for (const overlay of overlaysRef.current.values()) {
        overlay.setCurrentFrame(currentFrameRef.current);
      }
    }
  }, [scene, sample, canonicalMediaReady, activePathsList]);

  // Push the playhead frame into each tracked overlay on playhead changes.
  useEffect(() => {
    if (currentFrame === null) return;
    for (const overlay of overlaysRef.current.values()) {
      overlay.setCurrentFrame(currentFrame);
    }
  }, [currentFrame]);

  // Cleanup — remove every tracked overlay on scene change / unmount.
  // Owning scene reference, not the overlays, because Lighter's
  // `destroy()` runs through `removeOverlay`.
  useEffect(() => {
    return () => {
      if (!scene) return;
      for (const id of overlaysRef.current.keys()) {
        scene.removeOverlay(id);
      }
      overlaysRef.current.clear();
    };
  }, [scene]);
}
