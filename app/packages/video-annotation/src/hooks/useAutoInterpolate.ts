import {
  useActiveSampleId,
  useAnnotationEngine,
  useAnnotationEventHandler,
  useSurfaceActions,
} from "@fiftyone/annotation";
import type { LabelData } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { resolveSegmentsToRepropagate } from "../utils/repropagateSegments";
import { useVideoPropagate } from "./useVideoPropagate";

const SURFACE = "video";

/**
 * On `annotation:keyframeChanged`, re-propagate (linear) each bracketing
 * segment against the new keyframe layout, and step-hold an edited last
 * keyframe's geometry over its trailing filler. A no-op until a labels stream
 * is published.
 */
export const useAutoInterpolate = (): void => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const stream = useFrameLabelsStream();
  const propagate = useVideoPropagate();
  const actions = useSurfaceActions(engine, SURFACE, sampleId);

  useAnnotationEventHandler(
    "annotation:keyframeChanged",
    useCallback(
      (payload) => {
        if (!stream) {
          return;
        }

        const { instanceId, frame, kind, undoKey } = payload;

        if (!instanceId) {
          return;
        }

        // re-lerp on the field the change happened on (a non-primary track,
        // e.g. a polyline, re-lerps in place); fall back to the primary field
        const path = payload.path ?? stream.labelsPath;
        const keyframeFrames: number[] = [];
        // Every frame the instance is present on (keyframe or filler). The tail
        // step-hold below walks the trailing filler.
        const presentFrames: number[] = [];

        for (let f = 1; f <= stream.totalFrames; f++) {
          const det = engine.getLabel({
            sample: sampleId,
            path,
            instanceId,
            frame: f,
          });

          if (!det) {
            continue;
          }

          presentFrames.push(f);

          if (det.keyframe) {
            keyframeFrames.push(f);
          }
        }

        const segments = resolveSegmentsToRepropagate(
          keyframeFrames,
          frame,
          kind,
        );

        // Re-lerp under the triggering edit's gesture key (when present) so
        // each segment coalesces into that edit's single undo unit, on the
        // changed label's own field.
        segments.forEach(([fromFrame, toFrame]) => {
          void propagate({
            instanceId,
            fromFrame,
            toFrame,
            mode: "linear",
            undoKey,
            path,
          });
        });

        // Tail step-hold: the last keyframe has nothing to lerp toward, yet a
        // track can carry `keyframe: false` filler past it. Hold the edited
        // geometry over that filler, coalesced into the edit's undo unit.
        if (kind === "set") {
          const anchor = engine.getLabel({
            sample: sampleId,
            path,
            instanceId,
            frame,
          });
          const hasNextKeyframe = keyframeFrames.some((kf) => kf > frame);

          // whichever geometry the track carries; polyline filler is refreshed
          // the same way a box's is
          const held: Partial<LabelData> | null = !anchor
            ? null
            : Array.isArray(anchor.bounding_box)
              ? { bounding_box: anchor.bounding_box }
              : Array.isArray(anchor.points) &&
                  (anchor.points as unknown[]).length > 0
                ? {
                    points: anchor.points,
                    closed: anchor.closed,
                    filled: anchor.filled,
                  }
                : null;

          if (held && !hasNextKeyframe) {
            const tailFrames = presentFrames.filter((f) => f > frame);

            if (tailFrames.length > 0) {
              actions.transaction(
                () => {
                  for (const tailFrame of tailFrames) {
                    const existing = engine.getLabel({
                      sample: sampleId,
                      path,
                      instanceId,
                      frame: tailFrame,
                    });

                    // Only overwrite filler — never a real keyframe in the tail.
                    if (!existing || existing.keyframe === true) {
                      continue;
                    }

                    actions.updateLabel(
                      { path, instanceId, frame: tailFrame },
                      { ...held, keyframe: false },
                    );
                  }
                },
                undoKey ? { undoKey } : undefined,
              );
            }
          }
        }
      },
      [engine, sampleId, stream, propagate, actions],
    ),
  );
};
