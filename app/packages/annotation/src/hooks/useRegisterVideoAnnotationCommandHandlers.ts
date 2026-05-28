import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import {
  useFrameLabelsStream,
  useStageTemporalDetectionSupport,
  type LocalDetection,
} from "@fiftyone/video-annotation";
import { useCallback } from "react";
import { frameAt } from "../../../playback/src/lib/playback/utils";
import {
  EditTemporalDetectionSupportCommand,
  MarkKeyframeCommand,
} from "../commands";

/**
 * Registers video-specific annotation command handlers. Mount inside
 * the video annotation surface's `<PlaybackProvider>` so dispatchers
 * (keybinding handlers, toolbar buttons, …) can capture the playhead
 * and selection at the moment of user intent.
 */
export const useRegisterVideoAnnotationCommandHandlers = () => {
  const stream = useFrameLabelsStream();
  const stageTemporalDetectionSupport = useStageTemporalDetectionSupport();

  useRegisterCommandHandler(
    EditTemporalDetectionSupportCommand,
    useCallback(
      async (cmd) => {
        stageTemporalDetectionSupport(cmd.fieldPath, cmd.detectionId, [
          cmd.support[0],
          cmd.support[1],
        ]);
        return true;
      },
      [stageTemporalDetectionSupport]
    )
  );

  useRegisterCommandHandler(
    MarkKeyframeCommand,
    useCallback(
      async (cmd) => {
        if (!stream) return false;
        if (cmd.detectionIds.length === 0) return false;

        const snapshot = stream.getValue(cmd.time);
        if (!snapshot) return false;

        const frame = frameAt(cmd.time, stream.fps, stream.totalFrames);

        let updated = false;
        for (const id of cmd.detectionIds) {
          const det = snapshot.detections.find((d) => d.id === id);
          if (!det) continue;

          const willBeKeyframe = !det.keyframe;

          // Minimal update — `bounding_box` is required by LocalDetection
          // but matches the existing cache entry, so the structural diff
          // sees only the fields that actually changed. Avoid setting
          // `instance` / `propagation` / `label` / `index` explicitly:
          // updateLabel's shallow merge preserves them from the cache,
          // and writing them as nulls would emit spurious `add ...
          // value: null` patch ops against baselines that lack the keys.
          const update: LocalDetection = {
            _cls: "Detection",
            _id: det._id ?? id,
            bounding_box: det.bounding_box,
            keyframe: willBeKeyframe,
          };

          // Promotion to keyframe semantically clears propagation. Only
          // write the field when there's something to clear — otherwise
          // we'd emit a no-op `add propagation: null` patch op.
          if (willBeKeyframe && det.propagation) {
            update.propagation = null;
          }

          stream.updateLabel(frame, update);
          updated = true;
        }

        return updated;
      },
      [stream]
    )
  );
};
