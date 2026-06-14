/**
 * Video propagation via the FiftyOne server's SAM2 PyTorch video predictor
 * (``propagate_in_video``). Requires ``sam2`` on the server and a video zoo
 * model such as ``segment-anything-2-hiera-tiny-video-torch``.
 */

import { getFetchFunction } from "@fiftyone/utilities";
import type { InferenceResult, PromptPoint } from "./types";

interface ServerMaskPayload {
  mask_b64: string;
  maskWidth: number;
  maskHeight: number;
  bbox: InferenceResult["bbox"];
}

function decodeMask(payload: ServerMaskPayload): InferenceResult {
  const raw = atob(payload.mask_b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return {
    mask: new Float32Array(bytes.buffer),
    maskWidth: payload.maskWidth,
    maskHeight: payload.maskHeight,
    bbox: payload.bbox,
  };
}

export interface PropagateSam2VideoOptions {
  datasetName: string;
  sampleId: string;
  /** Cross-frame instance id (used as the server object key). */
  instanceId: string;
  /** Inclusive bracket frames, 1-based (labels / mongo frame numbers). */
  fromFrame: number;
  toFrame: number;
  /** Prompt points on ``fromFrame`` (normalised [0, 1]). */
  seedPoints: PromptPoint[];
  /** Prompt points on ``toFrame`` (normalised [0, 1]). */
  endPoints: PromptPoint[];
  modelName?: string;
  onFrame?: (frameNumber: number, result: InferenceResult) => void;
  onProgress?: (done: number, total: number) => void;
  shouldAbort?: () => boolean;
}

/**
 * Run SAM2's native ``propagate_in_video`` on the server for one tracked
 * object between two bracket keyframes.
 */
export async function propagateSam2Video(
  options: PropagateSam2VideoOptions
): Promise<void> {
  const {
    datasetName,
    sampleId,
    instanceId,
    fromFrame,
    toFrame,
    seedPoints,
    endPoints,
    modelName,
    onFrame,
    onProgress,
    shouldAbort,
  } = options;

  if (fromFrame >= toFrame) {
    throw new Error("fromFrame must be less than toFrame");
  }

  const response = await getFetchFunction()<
    {
      datasetName: string;
      sampleId: string;
      objects: {
        objectId: string;
        keyframes: { frameIdx: number; points: PromptPoint[] }[];
        direction: "forward";
        startFrame: number;
        endFrame: number;
        frameIndexBase: number;
      }[];
      modelName?: string;
    },
    {
      frames?: Record<string, Record<string, ServerMaskPayload>>;
      error?: string;
      details?: string;
    }
  >("POST", "/sam2-video/propagate", {
    datasetName,
    sampleId,
    objects: [
      {
        objectId: instanceId,
        keyframes: [
          { frameIdx: fromFrame, points: seedPoints },
          { frameIdx: toFrame, points: endPoints },
        ],
        direction: "forward",
        startFrame: fromFrame,
        endFrame: toFrame,
        frameIndexBase: 1,
      },
    ],
    modelName,
  });

  if (response.error) {
    throw new Error(response.details ?? response.error);
  }

  const perFrame = response.frames?.[instanceId] ?? {};
  const indices = Object.keys(perFrame)
    .map(Number)
    .sort((a, b) => a - b);
  const total = toFrame - fromFrame + 1;
  let done = 0;

  for (const frameNumber of indices) {
    if (shouldAbort?.()) break;
    if (frameNumber <= fromFrame || frameNumber >= toFrame) continue;

    const payload = perFrame[String(frameNumber)];
    if (!payload) continue;

    onFrame?.(frameNumber, decodeMask(payload));
    done++;
    onProgress?.(done, total - 2);
  }
}
