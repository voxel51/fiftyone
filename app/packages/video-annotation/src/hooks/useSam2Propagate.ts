import {
  useAnnotationEngine,
  useModalStatusBar,
  useSampleDescriptor,
} from "@fiftyone/annotation";
import { createElement, useCallback } from "react";
import { PropagationStatusItem } from "../components/PropagationStatusItem";
import type { PropagateArgs } from "../propagation/propagateArgs";
import { isSam2Agent, toSyntheticBox } from "../propagation/propagationShapes";
import { useApplyPropagatedDetection } from "../propagation/useApplyPropagationResult";
import { useImaVidImageStream } from "../streams/imaVidImageStreamHandle";
import { useResolvePropagationAgent } from "./useResolvePropagationAgent";

/**
 * SAM2 tracking streams a detection per frame as inference lands, so the
 * per-frame writes coalesce under one minted gesture id. No-ops without an
 * image stream.
 */
export const useSam2Propagate = () => {
  const engine = useAnnotationEngine();
  const imageStream = useImaVidImageStream();
  const resolveAgent = useResolvePropagationAgent();
  const sampleDescriptor = useSampleDescriptor();
  const applyPropagatedDetection = useApplyPropagatedDetection();
  const { setContent: setStatusContent } = useModalStatusBar();

  return useCallback(
    async (args: PropagateArgs): Promise<boolean> => {
      const { instanceId, fromFrame, toFrame, leftKeyframe, rightKeyframe } =
        args;

      if (!imageStream) {
        return false;
      }

      const agent = await resolveAgent("propagate-sam2");

      if (!agent || !isSam2Agent(agent)) {
        return false;
      }

      const undoKey = engine.mintGestureId();

      let aborted = false;
      const onStop = () => {
        aborted = true;
      };

      // the phase follows `onProgress`, not the per-frame agent lifecycle;
      // before the first tick the model is downloading or encoding
      let tracking = false;
      const render = (done?: number, runTotal?: number) =>
        setStatusContent(
          createElement(PropagationStatusItem, {
            label: tracking ? "SAM2 tracking" : "Loading SAM2…",
            done,
            total: runTotal,
            onStop,
          }),
        );
      render();

      const getFrameBitmap = async (
        frameNumber: number,
      ): Promise<ImageBitmap> => {
        const time = (frameNumber - 1) / imageStream.fps;
        await imageStream.warmup(time);
        const frame = imageStream.getValue(time);

        if (!frame) {
          throw new Error(`ImaVid frame ${frameNumber} unavailable`);
        }

        return frame.bitmap;
      };

      try {
        await agent.propagate({
          instanceId,
          seedKeyframe: toSyntheticBox(leftKeyframe),
          endKeyframe: rightKeyframe
            ? toSyntheticBox(rightKeyframe)
            : undefined,
          fromFrame,
          toFrame,
          videoKey: sampleDescriptor.sampleId,
          getFrameBitmap,
          onDetection: (frameNumber, detection) =>
            applyPropagatedDetection(frameNumber, detection, {
              undoKey,
              path: args.path,
            }),
          onProgress: (done, runTotal) => {
            tracking = true;
            render(done, runTotal);
          },
          shouldAbort: () => aborted,
        });
        return true;
      } catch (err) {
        console.error("[va] SAM2 propagation failed", err);
        return false;
      } finally {
        setStatusContent(null);
      }
    },
    [
      engine,
      imageStream,
      resolveAgent,
      sampleDescriptor,
      applyPropagatedDetection,
      setStatusContent,
    ],
  );
};
