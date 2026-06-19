/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useActiveSampleId,
  useAnnotationEngine,
  useEngineSelector,
} from "@fiftyone/annotation";
import {
  overlayFactory,
  TemporalOverlay,
  type TemporalLabel,
  type TemporalOptions,
  useLighterSetupWithPixi,
} from "@fiftyone/lighter";
import { useModalSample } from "@fiftyone/state";
import { isTemporalDetectionsField } from "@fiftyone/utilities";
import { useEffect, useRef } from "react";
import { frameAt, usePlayhead } from "@fiftyone/playback";
import {
  useActiveModalPaths,
  useTemporalDetectionFieldPaths,
} from "../state/accessors";
import { getModalSampleFrameRate } from "../utils/modalSample";

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
   * TD set shaped like a sample dict (`{ [field]: { _cls:
   * "TemporalDetections", detections } }`). The video hook builds this from the
   * engine (the authoritative TD source), so it already carries local creates /
   * edits; the diff adds, refreshes, and evicts overlays to match it.
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
    if (!isTemporalDetectionsField(value)) {
      continue;
    }

    if (!activePaths.has(fieldPath)) {
      continue;
    }

    const detections = value.detections ?? [];
    for (const td of detections) {
      const detId = td._id ?? td.id;
      if (!detId) {
        continue;
      }

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

      // Adopt an existing overlay at the same id so concurrent paths don't
      // double-add.
      const adopted =
        overlays.get(id) ??
        (scene.getOverlay(id) as TemporalOverlay | undefined);

      if (adopted) {
        // The engine is the authoritative TD source, so refresh the overlay's
        // label from it — a support / label edit made through the engine shows
        // on the canvas chip without waiting for an autosave round-trip.
        adopted.label = label;
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

/**
 * Build the engine's sample-level temporal detections, shaped like a sample
 * dict so {@link syncTemporalOverlays} can consume them the same way it used to
 * consume the server sample. Reads the engine — the authoritative TD source —
 * so local creates / edits are reflected immediately.
 */
const buildEngineTemporalSample = (
  engine: { listLabels: (ref: { sample: string; path: string }) => unknown[] },
  sample: string,
  tdPaths: readonly string[]
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  for (const path of tdPaths) {
    // TDs are sample-level; never the per-frame `frames.` fields.
    if (path.startsWith("frames.")) {
      continue;
    }

    const detections = engine.listLabels({ sample, path });
    if (detections.length) {
      out[path] = { _cls: "TemporalDetections", detections };
    }
  }

  return out;
};

const sameTemporalSample = (
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Keep the Lighter scene's `TemporalOverlay` set in sync with the engine's
 * `TemporalDetections`, and push the playhead frame into each overlay so the
 * time gate updates live.
 *
 * The TD set is sourced from the engine (authoritative), so creates / edits /
 * deletes show on the canvas without waiting for an autosave round-trip. Pass
 * `scene` + `canonicalMediaReady` from the host tile; the hook owns the diff
 * lifecycle and cleans up every tracked overlay on scene change / unmount.
 */
export function useTemporalOverlaySync(
  scene: ReturnType<typeof useLighterSetupWithPixi>["scene"],
  canonicalMediaReady: boolean
): void {
  const overlaysRef = useRef<Map<string, TemporalOverlay>>(new Map());

  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const tdPaths = useTemporalDetectionFieldPaths();
  const activePathsList = useActiveModalPaths();
  const modalSample = useModalSample();

  // Engine-authoritative TD set as a sample dict; stable across unrelated engine
  // bumps so the sync effect only re-runs when the TDs actually change.
  const temporalSample = useEngineSelector(
    engine,
    (e) => (sampleId ? buildEngineTemporalSample(e, sampleId, tdPaths) : {}),
    sameTemporalSample
  );

  // Current playhead frame. fps comes from the sample metadata (labels live in
  // the engine now). Held in a ref so the sync effect can seed newly-added
  // overlays without re-running on every playhead tick.
  const playheadSec = usePlayhead();
  const frameRate = getModalSampleFrameRate(modalSample);
  const currentFrame =
    frameRate && Number.isFinite(frameRate) && frameRate > 0
      ? frameAt(playheadSec, frameRate)
      : null;
  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;

  useEffect(() => {
    if (!scene || !canonicalMediaReady) {
      return;
    }

    const activePaths = new Set(activePathsList);
    syncTemporalOverlays({
      scene,
      sample: temporalSample,
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
  }, [scene, temporalSample, canonicalMediaReady, activePathsList]);

  // Push the playhead frame into each tracked overlay on playhead changes.
  useEffect(() => {
    if (currentFrame === null) {
      return;
    }

    for (const overlay of overlaysRef.current.values()) {
      overlay.setCurrentFrame(currentFrame);
    }
  }, [currentFrame]);

  // Cleanup — remove every tracked overlay on scene change / unmount.
  // Owning scene reference, not the overlays, because Lighter's
  // `destroy()` runs through `removeOverlay`.
  useEffect(() => {
    return () => {
      if (!scene) {
        return;
      }

      // Read the live tracked overlays at teardown — we remove whatever is
      // currently tracked, not the set captured when the effect ran.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const id of overlaysRef.current.keys()) {
        scene.removeOverlay(id);
      }

      overlaysRef.current.clear();
    };
  }, [scene]);
}
