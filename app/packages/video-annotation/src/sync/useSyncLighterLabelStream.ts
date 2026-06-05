/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  ExtendTrackCommand,
  UpdateTrackAttributesCommand,
  useAnnotationEventBus,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import {
  DetectionOverlay,
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  UpdateLabelCommand,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { type AnnotationLabelData } from "@fiftyone/state";
import { objectId } from "@fiftyone/utilities";
import { type MutableRefObject, useCallback, useRef } from "react";
import { useLabelsContext } from "../../../core/src/components/Modal/Sidebar/Annotate";
import { useCurrentTime } from "../../../playback/src/lib/playback/use-playback-state";
import type { VideoDetectionLabel } from "../overlayAdapters/types";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import type { LocalDetection } from "../streams/VideoFrameLabelsStream";

/**
 * Frames a freshly-drawn box auto-extends forward as non-keyframe filler,
 * so a single drawn box immediately becomes a short track (matching a
 * manual drag-to-extend). Clamped at the clip end.
 */
const AUTO_EXTEND_FRAMES = 30;

/**
 * Detection fields that are per-frame and must NOT propagate across a track
 * when a sidebar edit is applied to the whole object. Everything else on the
 * label (label / confidence / index / tags / custom attributes) describes the
 * object and is shared across its frames.
 */
const PER_FRAME_DETECTION_FIELDS = new Set([
  "_id",
  "_cls",
  "bounding_box",
  "keyframe",
  "propagation",
  "instance",
]);

/** Minimal snapshot shape the removal resolver needs. */
interface RemovalSnapshot {
  detections: ReadonlyArray<{ id: string; _id?: string }>;
}

/**
 * Decide whether a `lighter:overlay-removed` event should delete a detection
 * from the per-frame cache, and if so, which detection `_id`.
 *
 * Returns `null` (no cache delete) when:
 *  - the removal is a `lifecycle` teardown / sync eviction, not a user delete
 *  - the removed overlay id resolves to no detection in the current snapshot
 *    (e.g. a draw-mode overlay evicted after we mint an `Instance`).
 *
 * Otherwise returns the resolved detection `_id` (the cache keys by `_id`, not
 * by the synthetic overlay id we render under).
 *
 * Exported for unit testing — the hook itself needs a live Scene2D.
 */
export function resolveOverlayRemovalTarget(
  payload: { id: string; lifecycle?: boolean },
  snapshot: RemovalSnapshot | null
): string | null {
  if (payload.lifecycle) return null;
  const target = snapshot?.detections.find((d) => d.id === payload.id);
  return target?._id ?? null;
}

/** Lighter event-handler registrar bound to a specific scene channel. */
type LighterEventRegistrar = ReturnType<typeof useLighterEventHandler>;

/** Stream returned by {@link useFrameLabelsStream}, or `null` in synthetic mode. */
type LabelStream = ReturnType<typeof useFrameLabelsStream>;

/**
 * Mirrors user-driven Lighter overlay edits into the label-stream cache
 * so they survive frame scrubs.
 *
 * Persistence to the server is the eventual delta supplier's job; this
 * hook only keeps the local cache aligned with what the user sees on
 * the canvas:
 *   - **Draw**: `lighter:overlay-establish` → `updateLabel`.
 *   - **Drag / resize**: `lighter:overlay-drag-end` /
 *     `overlay-resize-end` → `updateLabel` with the new bounds.
 *   - **Delete**: `lighter:overlay-removed` → `deleteLabel`.
 *   - **Sidebar field edits**: `annotation:sidebarValueUpdated`.
 *
 * Binding agent: it resolves the shared dependencies and the per-frame
 * `upsert` writer, then hands them to one small registrar hook per event.
 *
 * Synthetic-label mode has no stream to write to — the sub-hooks no-op
 * when `useFrameLabelsStream()` returns `null`.
 *
 * @param scene - The scene whose overlay events are mirrored, or `null`
 *   while it's still being set up.
 */
export const useSyncLighterLabelStream = (scene: Scene2D | null): void => {
  const stream = useFrameLabelsStream();
  const currentTime = useCurrentTime();
  const eventBus = useAnnotationEventBus();
  const commandBus = useCommandBus();
  const { updateLabelData } = useLabelsContext();

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  // Synthetic id we want selected once `useFrameOverlaySync` lands the
  // post-mint canonical overlay. Set by `upsert` when it evicts a
  // draw-mode overlay; consumed by `usePendingSelectClaim`.
  const pendingSelectRef = useRef<string | null>(null);

  const upsert = useUpsertFromOverlay({
    scene,
    stream,
    currentTime,
    eventBus,
    commandBus,
    pendingSelectRef,
  });

  useOverlayEstablishSync({ useEventHandler, upsert });
  usePendingSelectClaim({ useEventHandler, scene, pendingSelectRef });
  useOverlayEditEndSync({ useEventHandler, upsert });
  useOverlayRemovedSync({ useEventHandler, stream, currentTime });
  useSidebarValueSync({
    scene,
    stream,
    currentTime,
    eventBus,
    commandBus,
    updateLabelData,
  });
};

/**
 * Build the writer that projects an overlay into the per-frame cache. On a
 * fresh draw it mints an `Instance` (stable cross-frame identity), evicts
 * the draw-mode overlay, registers a pending select for the canonical one,
 * and auto-extends the new box forward as non-keyframe filler.
 */
function useUpsertFromOverlay({
  scene,
  stream,
  currentTime,
  eventBus,
  commandBus,
  pendingSelectRef,
}: {
  scene: Scene2D | null;
  stream: LabelStream;
  currentTime: number;
  eventBus: ReturnType<typeof useAnnotationEventBus>;
  commandBus: ReturnType<typeof useCommandBus>;
  pendingSelectRef: MutableRefObject<string | null>;
}): (overlayId: string, isFreshDraw?: boolean) => void {
  return useCallback(
    (overlayId: string, isFreshDraw = false) => {
      if (!stream || !scene) return;
      const overlay = scene.getOverlay(overlayId);
      if (!(overlay instanceof DetectionOverlay)) return;

      const detection = toLocalDetection(overlay);

      // Create an `Instance` doc on first draw so the cross-frame
      // identity (used as the synthetic overlay id in
      // `extractDetections`) is stable from the box's first frame
      // onward.
      const minted = isFreshDraw && !detection.instance;
      if (minted) {
        detection.instance = { _cls: "Instance", _id: objectId() };
      }

      const frame = stream.timeToFrame(currentTime);
      stream.updateLabel(frame, detection);

      // Edits (drag / resize) and fresh draws both promote the touched
      // frame to a keyframe via `toLocalDetection`. Mirror the same
      // event MarkKeyframeCommand emits so the auto-interpolate hook
      // re-lerps adjacent segments after the user nudges a box.
      const instanceId = detection.instance?._id ?? null;
      if (instanceId) {
        eventBus.dispatch("annotation:keyframeChanged", {
          trackId: `instance-${instanceId}`,
          instanceId,
          frame,
          kind: "set",
        });
      }

      // The synthetic id just changed (`<overlayId>` → `instance-<...>`)
      // because we minted the Instance. Evict Lighter's draw-mode
      // overlay so the next sync pass adds the canonical one without
      // leaving the original drawn copy behind. The `overlay-removed`
      // event this triggers is safe — the removed-handler resolves
      // payload ids against the current snapshot and skips ones that no
      // longer map to a cache entry.
      //
      // Removal also drops selection, so register a pending select
      // against the canonical synthetic id; `usePendingSelectClaim`
      // claims it once the sync places the canonical overlay in scene.
      if (minted) {
        const trackId = `instance-${detection.instance!._id}`;
        pendingSelectRef.current = trackId;
        scene.removeOverlay(overlayId);

        // Auto-extend the fresh track forward as non-keyframe filler
        // (`ExtendTrackCommand` semantics: same `instance`/`index`, fresh
        // `_id` per frame, `keyframe: false`), so one drawn box becomes a
        // short track without a manual drag. The source detection was just
        // written above, so the handler resolves it off the stream snapshot.
        // Leaves a single keyframe, so auto-lerp has no second bracket yet —
        // intended; it lights up once a downstream keyframe is marked/edited.
        const lastFrame = Math.min(
          frame + AUTO_EXTEND_FRAMES,
          stream.totalFrames
        );

        const targetFrames: number[] = [];
        for (let f = frame + 1; f <= lastFrame; f++) {
          targetFrames.push(f);
        }

        if (targetFrames.length > 0) {
          void commandBus.execute(
            new ExtendTrackCommand(trackId, frame, targetFrames)
          );
        }
      }
    },
    [stream, scene, currentTime, commandBus, eventBus, pendingSelectRef]
  );
}

/** Draw finalize → mirror the new box into the cache (mints the Instance). */
function useOverlayEstablishSync({
  useEventHandler,
  upsert,
}: {
  useEventHandler: LighterEventRegistrar;
  upsert: (overlayId: string, isFreshDraw?: boolean) => void;
}): void {
  useEventHandler(
    "lighter:overlay-establish",
    useCallback((payload) => upsert(payload.id, true), [upsert])
  );
}

/** Select the canonical post-mint overlay once the sync lands it in scene. */
function usePendingSelectClaim({
  useEventHandler,
  scene,
  pendingSelectRef,
}: {
  useEventHandler: LighterEventRegistrar;
  scene: Scene2D | null;
  pendingSelectRef: MutableRefObject<string | null>;
}): void {
  useEventHandler(
    "lighter:overlay-added",
    useCallback(
      (payload) => {
        if (!scene || pendingSelectRef.current !== payload.id) return;
        const { id } = payload;
        pendingSelectRef.current = null;

        // Defer to the next tick to let this event chain settle
        queueMicrotask(() => scene.selectOverlay(id));
      },
      [scene, pendingSelectRef]
    )
  );
}

/**
 * Drag / resize finalize → mirror the moved box into the cache.
 *
 * Lighter flips `interactionState` to `"DRAGGING"` on every pointer-down
 * over an overlay, so a click-to-select fires `overlay-drag-end` with
 * `startBounds === bounds`. Filter those out — selection is not an edit and
 * writing the cache would churn the dirty set and auto-promote the label to
 * a keyframe via `toLocalDetection`.
 */
function useOverlayEditEndSync({
  useEventHandler,
  upsert,
}: {
  useEventHandler: LighterEventRegistrar;
  upsert: (overlayId: string, isFreshDraw?: boolean) => void;
}): void {
  useEventHandler(
    "lighter:overlay-drag-end",
    useCallback(
      (payload) => {
        if (rectsEqual(payload.startBounds, payload.bounds)) return;
        upsert(payload.id);
      },
      [upsert]
    )
  );

  useEventHandler(
    "lighter:overlay-resize-end",
    useCallback(
      (payload) => {
        if (rectsEqual(payload.startBounds, payload.bounds)) return;
        upsert(payload.id);
      },
      [upsert]
    )
  );
}

/** Overlay removed → delete from the cache (skips lifecycle removals). */
function useOverlayRemovedSync({
  useEventHandler,
  stream,
  currentTime,
}: {
  useEventHandler: LighterEventRegistrar;
  stream: LabelStream;
  currentTime: number;
}): void {
  useEventHandler(
    "lighter:overlay-removed",
    useCallback(
      (payload) => {
        if (!stream) return;
        // A `lifecycle` removal (scene teardown / scrub-off eviction) is not
        // a user delete; `resolveOverlayRemovalTarget` returns null for it
        const target = resolveOverlayRemovalTarget(
          payload,
          stream.getValue(currentTime)
        );
        if (!target) {
          return;
        }

        const frame = stream.timeToFrame(currentTime);
        stream.deleteLabel(frame, target);
      },
      [stream, currentTime]
    )
  );
}

/**
 * Sidebar field edit → apply to the overlay, refresh the sidebar row, mirror
 * to the per-frame cache, and propagate track-level attributes across frames.
 */
function useSidebarValueSync({
  scene,
  stream,
  currentTime,
  eventBus,
  commandBus,
  updateLabelData,
}: {
  scene: Scene2D | null;
  stream: LabelStream;
  currentTime: number;
  eventBus: ReturnType<typeof useAnnotationEventBus>;
  commandBus: ReturnType<typeof useCommandBus>;
  updateLabelData: ReturnType<typeof useLabelsContext>["updateLabelData"];
}): void {
  useAnnotationEventHandler(
    "annotation:sidebarValueUpdated",
    useCallback(
      (payload) => {
        if (!scene) {
          return;
        }

        const overlay = scene.getOverlay(payload.overlayId);
        if (!overlay) {
          return;
        }

        // Apply to the overlay so the canvas updates immediately — while
        // paused there's no frame tick to re-sync it from the cache. The
        // base `updateLabel` routes through each overlay type's label
        // setter, so this covers both Detection and Temporal overlays.
        scene.executeCommand(
          new UpdateLabelCommand(
            overlay,
            payload.currentLabel,
            payload.value,
            eventBus
          )
        );

        // Refresh the sidebar entry's stored data so the collapsed row shows
        // the new value immediately. The snapshot / TD-membership hooks only
        // do this on a frame tick, so a paused edit would otherwise leave the
        // collapsed entry stale after deselect. `payload.value` is the full
        // post-edit label, and `updateLabelData` keys on the overlay id.
        updateLabelData(
          payload.overlayId,
          payload.value as unknown as AnnotationLabelData
        );

        // DetectionOverlays persist through the per-frame label cache, not
        // the overlay, so mirror the edit there for the video-labels
        // supplier. `updateLabel` merges by `_id`, preserving instance /
        // propagation / keyframe that the edit doesn't carry. Temporal
        // overlays persist straight off `overlay.label` via the TD
        // supplier, so they need no cache write.
        if (overlay instanceof DetectionOverlay && stream) {
          const frame = stream.timeToFrame(currentTime);
          stream.updateLabel(frame, payload.value as unknown as LocalDetection);

          // Track-level attributes (label / confidence / index / tags /
          // custom) describe the object, not one frame, so propagate them
          // across the whole track. Per-frame geometry is excluded so each
          // frame keeps its own box / keyframe / propagation.
          const trackAttributes: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(payload.value)) {
            if (PER_FRAME_DETECTION_FIELDS.has(key)) {
              continue;
            }

            trackAttributes[key] = value;
          }

          if (Object.keys(trackAttributes).length > 0) {
            void commandBus.execute(
              new UpdateTrackAttributesCommand(
                payload.overlayId,
                trackAttributes
              )
            );
          }
        }

        // Notify derived views that a label changed. The TD timeline tracks
        // rebuild off this (their only invalidation signal — a TemporalOverlay
        // label set fires no lighter event). Dispatched after the overlay is
        // updated so consumers reading `overlay.label` see the new value.
        // `UpdateLabelCommand` only emits this on redo, which never re-runs
        // this handler, so there's no double-dispatch.
        eventBus.dispatch("annotation:labelEdit", { label: payload.value });
      },
      [scene, stream, currentTime, eventBus, updateLabelData, commandBus]
    )
  );
}

/**
 * Project a Lighter `DetectionOverlay` onto the
 * {@link LocalDetection} shape the stream's cache stores.
 *
 * Reads bounds from the overlay directly (not from event payloads) so
 * the cache always sees the post-edit state regardless of which event
 * triggered the write.
 */
function toLocalDetection(overlay: DetectionOverlay): LocalDetection {
  const bounds = overlay.relativeBounds;
  // The overlay was built from a raw `/frames` detection doc, so its label
  // carries the persisted `_id` lighter's `DetectionLabel` type omits — read
  // it as the {@link VideoDetectionLabel} the adapter actually produces. A
  // freshly-drawn overlay has no `_id` yet (hence the `?? overlay.id` below).
  const label = overlay.label as VideoDetectionLabel;
  // Prefer the real MongoDB `_id` from the underlying label so cache
  // upserts match the existing baseline entry. `overlay.id` is the
  // synthetic `track-<n>` id used for cross-frame identity and won't
  // match anything in the baseline detections array.
  // Any overlay event reaching this helper came from a user action
  // (draw / drag-end / resize-end with real movement). Promote to a
  // keyframe — the label is now user-authoritative for this frame.
  // Propagation is intentionally not cleared here: the cache's shallow
  // merge preserves it from the existing entry, and unconditionally
  // writing `propagation: null` produces noisy `add value: null` patch
  // ops against baselines that have no propagation field at all.
  // Clearing-on-edit becomes a separate concern once we have a way to
  // condition on the cache state without a layering violation.
  const det: LocalDetection = {
    _cls: "Detection",
    _id: label._id ?? overlay.id,
    label: label.label,
    bounding_box: [bounds.x, bounds.y, bounds.width, bounds.height],
    keyframe: true,
  };

  if (label.index !== undefined) {
    det.index = label.index;
  }

  if (label.instance) {
    det.instance = label.instance;
  }

  return det;
}

/** Strict equality on the four bbox dimensions. */
function rectsEqual(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}
