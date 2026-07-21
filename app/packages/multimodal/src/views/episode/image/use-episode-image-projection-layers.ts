import { useMemo } from "react";

import {
  buildPointCloudRenderPayload,
  type PointCloudRenderPayload,
  type PointCloudVisualization,
} from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import type { PointCloudColorOptions } from "../../../visualization/scene-3d";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import { useEpisodeFrameTransformsContext } from "../scene/episode-frame-transforms-context";
import {
  defaultEpisodePointCloudColorForSource,
  useEpisodePointCloudStyleSettings,
} from "../settings/episode-modal-settings";
import { useEpisodeStreamPlaybackFrames } from "../playback/use-episode-stream-values";

/** One point-cloud frame prepared for projection into an episode image tile. */
export interface EpisodeImageProjectionLayer {
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
export function useEpisodeImageProjectionLayers(
  streams: readonly string[],
  cameraFrameId: string | undefined,
): readonly EpisodeImageProjectionLayer[] {
  const frames =
    useEpisodeStreamPlaybackFrames<PointCloudVisualization>(streams);
  const { resolve } = useEpisodeFrameTransformsContext();
  const pointCloudSources = useSceneSourcesByType(
    SCENE_SOURCE_TYPE.POINT_CLOUD,
  );
  const { pointCloudColors } = useEpisodePointCloudStyleSettings();

  const colorOptionsByStream = useMemo(() => {
    const sourcesById = new Map(
      pointCloudSources.map((source) => [source.id, source] as const),
    );
    const options = new Map<string, PointCloudColorOptions>();

    for (const stream of streams) {
      const source = sourcesById.get(stream) ?? { id: stream, label: stream };
      const settings = {
        ...defaultEpisodePointCloudColorForSource(source, pointCloudSources),
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
  }, [pointCloudColors, pointCloudSources, streams]);

  return useMemo(() => {
    if (!cameraFrameId) {
      return [];
    }

    const layers: EpisodeImageProjectionLayer[] = [];
    for (let streamIndex = 0; streamIndex < streams.length; streamIndex++) {
      const stream = streams[streamIndex];
      const playbackFrame = frames[streamIndex];
      const frame = playbackFrame?.frame;
      const sourceFrameId = frame?.coordinateFrameId;
      const colorOptions = colorOptionsByStream.get(stream);
      if (!playbackFrame || !frame || !sourceFrameId || !colorOptions) {
        continue;
      }

      // Resolve sensor -> camera at the point frame's content time. The matrix
      // is therefore a snapshot paired with this payload/resource identity;
      // later TF updates produce a new immutable layer model.
      const resolution = resolve(
        sourceFrameId,
        cameraFrameId,
        playbackFrame.contentTimeNs,
      );
      if (resolution.status !== "resolved") {
        continue;
      }

      layers.push({
        colorOptions,
        contentTimeNs: playbackFrame.contentTimeNs,
        frame,
        payload: pointCloudProjectionPayload(frame),
        rotation: resolution.transform.rotation,
        stream,
        translation: resolution.transform.translation,
      });
    }

    return layers;
  }, [cameraFrameId, colorOptionsByStream, frames, resolve, streams]);
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
