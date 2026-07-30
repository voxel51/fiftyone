import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";

import { buildPointCloudRenderPayload } from "../../../ir";
import type {
  PointCloudRenderPayload,
  PointCloudVisualization,
} from "../../../ir";
import { useSceneSourcesByType } from "../../../scene-inventory/react";
import type { PointCloudColorOptions } from "../../../visualization/scene-3d";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import { useFrameTransformsContext } from "../spatial/frame-transforms/context";
import type {
  FrameGraphSummarizer,
  FrameTransformResolver,
} from "../spatial/frame-transforms/use-frame-transforms";
import {
  defaultPointCloudColorForSource,
  usePointCloudStyleSettings,
} from "../settings/modal/state";
import { usePointCloudPlaybackFrames } from "../playback/use-stream-values";
import { chooseStableOrGraphRoot } from "../spatial/frame-transforms/reference-selection";

/** One point-cloud frame prepared for projection into an episode image tile. */
export interface ImageProjectionLayer {
  readonly colorOptions: PointCloudColorOptions;
  readonly contentTimeNs: bigint;
  readonly frame: PointCloudVisualization;
  /** Canonical GPU input, decoder-provided when available and otherwise cached. */
  readonly payload: PointCloudRenderPayload;
  readonly rotation: {
    readonly w: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  /** Collision-safe presentation label for the point-cloud source. */
  readonly sourceLabel: string;
  /** Exact format-native name for the point-cloud source. */
  readonly sourceName: string;
  readonly stream: string;
  readonly translation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

/**
 * Resolves the playback frame, TF transform, and 3D colour settings for every
 * cloud selected by one image tile. Keeping this work above the R3F scene and
 * the DOM dwell surface gives both consumers the same immutable frame model.
 * No per-point work happens here.
 */
export function useImageProjectionLayers(
  streams: readonly string[],
  cameraFrameId: string | undefined,
  imageContentTimeNs: bigint | undefined,
): readonly ImageProjectionLayer[] {
  const { resolve, summarizeGraph } = useFrameTransformsContext();
  const pointCloudSources = useSceneSourcesByType(
    SCENE_SOURCE_TYPE.POINT_CLOUD,
  );
  const { pointCloudColors } = usePointCloudStyleSettings();

  const pointCloudSourcesById = useMemo(
    () =>
      new Map(pointCloudSources.map((source) => [source.id, source] as const)),
    [pointCloudSources],
  );
  const colorOptionsByStream = useMemo(() => {
    const options = new Map<string, PointCloudColorOptions>();

    for (const stream of streams) {
      const source = pointCloudSourcesById.get(stream) ?? {
        id: stream,
        label: stream,
        sourceName: "",
      };
      const settings = {
        ...defaultPointCloudColorForSource(source, pointCloudSources),
        ...pointCloudColors[stream],
      };
      options.set(stream, {
        colorBy: settings.colorBy,
        colormap: settings.colormap,
        ...(settings.rangeMax !== null ? { rangeMax: settings.rangeMax } : {}),
        ...(settings.rangeMin !== null ? { rangeMin: settings.rangeMin } : {}),
        uniformColor: settings.uniformColor,
      });
    }

    return options;
  }, [pointCloudColors, pointCloudSources, pointCloudSourcesById, streams]);
  const pointCloudColorBy = useMemo(
    () =>
      streams.map(
        (stream) => colorOptionsByStream.get(stream)?.colorBy ?? "auto",
      ),
    [colorOptionsByStream, streams],
  );
  const frames = usePointCloudPlaybackFrames(
    streams,
    pointCloudColorBy,
    imageContentTimeNs,
  );

  return useMemo(() => {
    if (!cameraFrameId || imageContentTimeNs === undefined) {
      return [];
    }

    const layers: ImageProjectionLayer[] = [];
    for (let streamIndex = 0; streamIndex < streams.length; streamIndex++) {
      const stream = streams[streamIndex];
      const playbackFrame = frames[streamIndex];
      const frame = playbackFrame?.frame;
      const sourceFrameId = frame?.coordinateFrameId;
      const colorOptions = colorOptionsByStream.get(stream);
      const source = pointCloudSourcesById.get(stream);
      if (!playbackFrame || !frame || !sourceFrameId || !colorOptions) {
        continue;
      }

      const transform = resolvePointCloudProjectionTransform({
        cameraFrameId,
        imageContentTimeNs,
        pointContentTimeNs: playbackFrame.contentTimeNs,
        resolve,
        sourceFrameId,
        summarizeGraph,
      });
      if (!transform) {
        continue;
      }
      layers.push({
        colorOptions,
        contentTimeNs: playbackFrame.contentTimeNs,
        frame,
        payload: pointCloudProjectionPayload(frame),
        rotation: transform.rotation,
        sourceLabel: source?.label ?? stream,
        sourceName: source?.sourceName ?? stream,
        stream,
        translation: transform.translation,
      });
    }

    return layers;
  }, [
    cameraFrameId,
    colorOptionsByStream,
    frames,
    imageContentTimeNs,
    pointCloudSourcesById,
    resolve,
    streams,
    summarizeGraph,
  ]);
}

/**
 * Places a point observation captured at one time into a camera captured at
 * another. The stable/root frame separates the two temporal transform queries.
 */
export function resolvePointCloudProjectionTransform({
  cameraFrameId,
  imageContentTimeNs,
  pointContentTimeNs,
  resolve,
  sourceFrameId,
  summarizeGraph,
}: {
  readonly cameraFrameId: string;
  readonly imageContentTimeNs: bigint;
  readonly pointContentTimeNs: bigint;
  readonly resolve: FrameTransformResolver;
  readonly sourceFrameId: string;
  readonly summarizeGraph: FrameGraphSummarizer;
}): { readonly rotation: Quaternion; readonly translation: Vector3 } | null {
  if (
    sourceFrameId === cameraFrameId &&
    pointContentTimeNs === imageContentTimeNs
  ) {
    return {
      rotation: new Quaternion(),
      translation: new Vector3(),
    };
  }
  const referenceFrameId = projectionReferenceFrame(
    sourceFrameId,
    cameraFrameId,
    summarizeGraph,
  );
  if (!referenceFrameId) {
    return null;
  }
  const sourceToReference = resolve(
    sourceFrameId,
    referenceFrameId,
    pointContentTimeNs,
  );
  const referenceToCamera = resolve(
    referenceFrameId,
    cameraFrameId,
    imageContentTimeNs,
  );
  if (
    sourceToReference.status !== "resolved" ||
    referenceToCamera.status !== "resolved"
  ) {
    return null;
  }

  const sourceRotation = sourceToReference.transform.rotation
    .clone()
    .normalize();
  const cameraRotation = referenceToCamera.transform.rotation
    .clone()
    .normalize();
  return {
    rotation: cameraRotation.clone().multiply(sourceRotation).normalize(),
    translation: sourceToReference.transform.translation
      .clone()
      .applyQuaternion(cameraRotation)
      .add(referenceToCamera.transform.translation),
  };
}

function projectionReferenceFrame(
  sourceFrameId: string,
  cameraFrameId: string,
  summarizeGraph: FrameGraphSummarizer,
): string | null {
  const summary = summarizeGraph(new Set([sourceFrameId, cameraFrameId]));
  const component = summary.components.find(
    (candidate) =>
      candidate.includes(sourceFrameId) && candidate.includes(cameraFrameId),
  );
  if (!component) {
    return null;
  }
  return chooseStableOrGraphRoot(component, summary) || null;
}

const derivedProjectionPayloads = new WeakMap<
  PointCloudVisualization,
  PointCloudRenderPayload
>();

function pointCloudProjectionPayload(
  frame: PointCloudVisualization,
): PointCloudRenderPayload {
  if (frame.renderPayload) {
    // Built-in episode decoders create and transfer this bounded canonical sample
    // in the playback worker, keeping O(N) preparation off the main thread.
    return frame.renderPayload;
  }
  const cached = derivedProjectionPayloads.get(frame);
  if (cached) {
    return cached;
  }
  // renderPayload is optional at the decoder boundary. Build it once per frame
  // object and cache weakly so custom producers do not add per-camera or
  // per-render CPU work.
  const payload = buildPointCloudRenderPayload({
    colors: frame.colors,
    positions: frame.positions,
    scalarFields: frame.scalarFields,
  });
  derivedProjectionPayloads.set(frame, payload);
  return payload;
}
