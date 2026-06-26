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
import { type MutableRefObject, useEffect, useRef } from "react";
import { frameAt, usePlayhead } from "@fiftyone/playback";
import {
  useTemporalDetectionFieldPaths,
  useVisibleLabelSchemas,
} from "../state/accessors";
import type { FrameLabelReader } from "../tracks/frameTracks";
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
   * "TemporalDetections", detections } }`). Built from the engine (the
   * authoritative TD source) so it carries local creates / edits; the diff
   * adds, refreshes, and evicts overlays to match it.
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

      // The overlay id IS the TD's `_id` (the engine `instanceId`), so the
      // engine Lighter bridge builds the canonical sample-level ref for its
      // select / hover events. (The field is frame-less; frameOf omits it.)
      const id = String(detId);
      next.add(id);
      const label = td as unknown as TemporalLabel;

      // Adopt an existing overlay at the same id so concurrent paths don't
      // double-add.
      const adopted =
        overlays.get(id) ??
        (scene.getOverlay(id) as TemporalOverlay | undefined);

      if (adopted) {
        // Refresh the overlay's label from the engine so an engine-side support
        // / label edit shows on the canvas chip without an autosave round-trip.
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
 * dict so {@link syncTemporalOverlays} can consume them. Reads the engine — the
 * authoritative TD source — so local creates / edits are reflected immediately.
 */
const buildEngineTemporalSample = (
  engine: FrameLabelReader,
  sample: string,
  tdPaths: readonly string[],
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

/** Deep equality so the sync effect only re-runs when the TDs actually change. */
const sameTemporalSample = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean => JSON.stringify(a) === JSON.stringify(b);

type Scene = ReturnType<typeof useLighterSetupWithPixi>["scene"];

/** Engine-authoritative TD set as a sample dict, stable across unrelated bumps. */
const useEngineTemporalSample = (): Record<string, unknown> => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const tdPaths = useTemporalDetectionFieldPaths();

  return useEngineSelector(
    engine,
    (e) => (sampleId ? buildEngineTemporalSample(e, sampleId, tdPaths) : {}),
    sameTemporalSample,
  );
};

/**
 * Current playhead frame, held in a ref. fps comes from the sample metadata;
 * the ref lets the diff effect seed overlays without re-running per tick.
 */
const useCurrentFrameRef = (): MutableRefObject<number | null> => {
  const modalSample = useModalSample();
  const playheadSec = usePlayhead();
  const frameRate = getModalSampleFrameRate(modalSample);

  const currentFrame =
    frameRate && Number.isFinite(frameRate) && frameRate > 0
      ? frameAt(playheadSec, frameRate)
      : null;

  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;

  return currentFrameRef;
};

/**
 * Run the diff whenever the engine's TD set, active paths, or scene readiness
 * changes, then seed the time gate on freshly-added overlays so a TD in range
 * at the initial frame renders on first load (the playhead-push effect only
 * fires on *subsequent* changes).
 */
const useOverlayDiff = (
  scene: Scene,
  canonicalMediaReady: boolean,
  temporalSample: Record<string, unknown>,
  activePaths: ReadonlySet<string>,
  overlaysRef: MutableRefObject<Map<string, TemporalOverlay>>,
  currentFrameRef: MutableRefObject<number | null>,
): void => {
  useEffect(() => {
    if (!scene || !canonicalMediaReady) {
      return;
    }

    syncTemporalOverlays({
      scene,
      sample: temporalSample,
      activePaths,
      overlays: overlaysRef.current,
    });

    if (currentFrameRef.current !== null) {
      for (const overlay of overlaysRef.current.values()) {
        overlay.setCurrentFrame(currentFrameRef.current);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, temporalSample, canonicalMediaReady, activePaths]);
};

/** Push the playhead frame into each tracked overlay on playhead changes. */
const usePlayheadPush = (
  currentFrame: number | null,
  overlaysRef: MutableRefObject<Map<string, TemporalOverlay>>,
): void => {
  useEffect(() => {
    if (currentFrame === null) {
      return;
    }

    for (const overlay of overlaysRef.current.values()) {
      overlay.setCurrentFrame(currentFrame);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrame]);
};

/**
 * Remove every tracked overlay on scene change / unmount. Owns the scene
 * reference, not the overlays, because Lighter's `destroy()` runs through
 * `removeOverlay`. Reads the live tracked set at teardown.
 */
const useOverlayCleanup = (
  scene: Scene,
  overlaysRef: MutableRefObject<Map<string, TemporalOverlay>>,
): void => {
  useEffect(() => {
    return () => {
      if (!scene) {
        return;
      }

      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const id of overlaysRef.current.keys()) {
        scene.removeOverlay(id);
      }

      overlaysRef.current.clear();
    };
  }, [scene]);
};

/**
 * Keep the Lighter scene's `TemporalOverlay` set in sync with the engine's
 * `TemporalDetections`, and push the playhead frame into each overlay so the
 * time gate updates live.
 *
 * The TD set is sourced from the engine (authoritative), so creates / edits /
 * deletes show on the canvas without an autosave round-trip. Pass `scene` +
 * `canonicalMediaReady` from the host tile; the hook owns the diff lifecycle
 * and cleans up every tracked overlay on scene change / unmount.
 */
export function useTemporalOverlaySync(
  scene: Scene,
  canonicalMediaReady: boolean,
): void {
  const overlaysRef = useRef<Map<string, TemporalOverlay>>(new Map());

  const temporalSample = useEngineTemporalSample();
  // Gate on the sidebar's visible set (annotation-active ∩ explore-active) so a
  // schema-manager deactivation evicts the TD overlay from the canvas too —
  // matching the timeline + sidebar. (Was explore-active only, which the schema
  // manager never touches.)
  const activePaths = useVisibleLabelSchemas();
  const currentFrameRef = useCurrentFrameRef();

  useOverlayDiff(
    scene,
    canonicalMediaReady,
    temporalSample,
    activePaths,
    overlaysRef,
    currentFrameRef,
  );

  usePlayheadPush(currentFrameRef.current, overlaysRef);

  useOverlayCleanup(scene, overlaysRef);
}
