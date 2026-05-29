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
import {
  parseTemporalDetectionEditKey,
  useTemporalDetectionPendingEdits,
} from "./pendingTemporalDetectionEdits";

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
}

export interface SyncTemporalOverlaysInput {
  scene: SceneLike;
  sample: Record<string, unknown> | null | undefined;
  pendingEdits: ReadonlyMap<string, [number, number]>;
  activePaths: ReadonlySet<string>;
  /** Map<overlayId, overlay> — mutated in place to track surviving overlays. */
  overlays: Map<string, TemporalOverlay>;
  /** Factory hook so tests can inject a fake. */
  create?: (opts: TemporalOptions) => TemporalOverlay;
}

/**
 * Diff the modal sample's `TemporalDetections` fields against an
 * existing overlay map. Adds new TDs, updates changed ones in place
 * (preserving Lighter selection state), removes TDs no longer present
 * on the sample.
 *
 * Pending support edits override the sample's value so an in-progress
 * drag shows immediately. Edits whose target field/detection is gone
 * are silently skipped (matches the delta supplier's behavior).
 *
 * Pure-ish: mutates `overlays` and calls `scene.addOverlay` /
 * `removeOverlay`. Returns nothing; the caller reads `overlays` after.
 */
export function syncTemporalOverlays({
  scene,
  sample,
  pendingEdits,
  activePaths,
  overlays,
  create = (opts) =>
    overlayFactory.create<TemporalOptions, TemporalOverlay>("temporal", opts),
}: SyncTemporalOverlaysInput): void {
  if (!sample) {
    // No sample → remove anything we had.
    for (const id of Array.from(overlays.keys())) {
      scene.removeOverlay(id);
      overlays.delete(id);
    }
    return;
  }

  // Index pending edits by `${fieldPath}|${detectionId}` for O(1) lookup
  // during the sample walk. Use the existing decoder so the key format
  // stays canonical.
  const editsByFieldId = new Map<string, [number, number]>();
  for (const [key, support] of pendingEdits) {
    const { fieldPath, detectionId } = parseTemporalDetectionEditKey(key);
    editsByFieldId.set(`${fieldPath}|${detectionId}`, support);
  }

  const next = new Set<string>();

  for (const [fieldPath, value] of Object.entries(sample)) {
    if (!isTemporalDetectionsField(value)) continue;
    if (!activePaths.has(fieldPath)) continue;

    const detections = value.detections ?? [];
    for (const td of detections) {
      const detId = td._id ?? td.id;
      if (!detId) continue;

      const rawSupport = td.support;
      if (
        !Array.isArray(rawSupport) ||
        rawSupport.length !== 2 ||
        !Number.isFinite(rawSupport[0]) ||
        !Number.isFinite(rawSupport[1]) ||
        rawSupport[1] < rawSupport[0]
      ) {
        continue;
      }

      const id = `td-${fieldPath}-${detId}`;
      next.add(id);

      const override = editsByFieldId.get(`${fieldPath}|${detId}`);
      const support: [number, number] = override
        ? [override[0], override[1]]
        : [rawSupport[0], rawSupport[1]];

      const label: TemporalLabel = { ...td, support };

      const existing = overlays.get(id);
      if (existing) {
        // Setter marks dirty + re-gates internally.
        existing.label = label;
      } else {
        const overlay = create({ id, field: fieldPath, label });
        scene.addOverlay(overlay);
        overlays.set(id, overlay);
      }
    }
  }

  // Sweep — remove overlays that no longer correspond to a TD on the
  // active sample. Lighter's `removeOverlay` triggers the overlay's
  // `destroy()`, which clears it from the channel registry.
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
 * unmount. Pending support edits (from a timeline drag) are layered
 * on top of the sample so the bar shows the new range immediately,
 * before persistence catches up.
 */
export function useTemporalOverlaySync(
  scene: ReturnType<typeof useLighterSetupWithPixi>["scene"],
  canonicalMediaReady: boolean
): void {
  const overlaysRef = useRef<Map<string, TemporalOverlay>>(new Map());

  const sample = useModalSample();
  const pendingEdits = useTemporalDetectionPendingEdits();
  const activePathsList = useRecoilValue(
    activeFields({ modal: true, expanded: false })
  );

  // Diff effect — add / update / remove on every sample/edits/active-field change.
  useEffect(() => {
    if (!scene || !canonicalMediaReady) return;

    const activePaths = new Set(activePathsList);
    syncTemporalOverlays({
      scene,
      sample: (sample?.sample as Record<string, unknown>) ?? null,
      pendingEdits,
      activePaths,
      overlays: overlaysRef.current,
    });
  }, [scene, sample, canonicalMediaReady, pendingEdits, activePathsList]);

  // Push the playhead frame into each tracked overlay. fps comes from
  // the sample (same source the TD track build uses).
  const playheadSec = usePlayhead();
  const frameRate = sample?.frameRate;
  useEffect(() => {
    if (!frameRate || !Number.isFinite(frameRate) || frameRate <= 0) return;
    const frame = frameAt(playheadSec, frameRate);
    for (const overlay of overlaysRef.current.values()) {
      overlay.setCurrentFrame(frame);
    }
  }, [playheadSec, frameRate]);

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
