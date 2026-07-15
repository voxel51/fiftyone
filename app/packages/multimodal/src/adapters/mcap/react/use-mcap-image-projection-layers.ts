import { useMemo } from "react";

import {
  buildPointCloudRenderPayload,
  type PointCloudRenderPayload,
  type PointCloudVisualization,
} from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import type { PointCloudColorOptions } from "../../../visualization/panels/point-cloud";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { useMcapFrameTransformsContext } from "./mcap-frame-transforms-context";
import {
  defaultMcapPointCloudColorForSource,
  useMcapPointCloudStyleSettings,
} from "./mcap-modal-settings";
import { useMcapTopicPlaybackFrames } from "./use-mcap-topic-stream";

/** One point-cloud frame prepared for projection into an MCAP image tile. */
export interface McapImageProjectionLayer {
  readonly colorOptions: PointCloudColorOptions;
  readonly contentTimeNs: bigint;
  readonly frame: PointCloudVisualization;
  /** Canonical GPU input; decoder-provided for MCAP, cached once for legacy frames. */
  readonly payload: PointCloudRenderPayload;
  readonly rotation: {
    readonly w: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly topic: string;
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
export function useMcapImageProjectionLayers(
  topics: readonly string[],
  cameraFrameId: string | undefined,
): readonly McapImageProjectionLayer[] {
  const frames = useMcapTopicPlaybackFrames<PointCloudVisualization>(topics);
  const { resolve } = useMcapFrameTransformsContext();
  const pointCloudSources = useSceneSourcesByType(MCAP_SOURCE_TYPE.POINT_CLOUD);
  const { pointCloudColors } = useMcapPointCloudStyleSettings();

  const colorOptionsByTopic = useMemo(() => {
    const sourcesById = new Map(
      pointCloudSources.map((source) => [source.id, source] as const),
    );
    const options = new Map<string, PointCloudColorOptions>();

    for (const topic of topics) {
      const source = sourcesById.get(topic) ?? { id: topic, label: topic };
      const settings = {
        ...defaultMcapPointCloudColorForSource(source, pointCloudSources),
        ...pointCloudColors[topic],
      };
      options.set(topic, {
        colorBy: settings.colorBy,
        colormap: settings.colormap,
        ...(settings.rangeMax !== null ? { rangeMax: settings.rangeMax } : {}),
        ...(settings.rangeMin !== null ? { rangeMin: settings.rangeMin } : {}),
        uniformColor: settings.uniformColor,
      });
    }

    return options;
  }, [pointCloudColors, pointCloudSources, topics]);

  return useMemo(() => {
    if (!cameraFrameId) {
      return [];
    }

    const layers: McapImageProjectionLayer[] = [];
    for (let topicIndex = 0; topicIndex < topics.length; topicIndex++) {
      const topic = topics[topicIndex];
      const playbackFrame = frames[topicIndex];
      const frame = playbackFrame?.frame;
      const sourceFrameId = frame?.coordinateFrameId;
      const colorOptions = colorOptionsByTopic.get(topic);
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
        topic,
        translation: resolution.transform.translation,
      });
    }

    return layers;
  }, [cameraFrameId, colorOptionsByTopic, frames, resolve, topics]);
}

const legacyProjectionPayloads = new WeakMap<
  PointCloudVisualization,
  PointCloudRenderPayload
>();

function pointCloudProjectionPayload(
  frame: PointCloudVisualization,
): PointCloudRenderPayload {
  if (frame.renderPayload) {
    // Built-in MCAP decoders create and transfer this bounded canonical sample
    // in the playback worker, keeping O(N) preparation off the main thread.
    return frame.renderPayload;
  }
  const cached = legacyProjectionPayloads.get(frame);
  if (cached) {
    return cached;
  }
  // Non-MCAP/custom producers may not implement renderPayload yet. Build once
  // per frame object and cache weakly so compatibility does not become
  // per-camera or per-render CPU work.
  const payload = buildPointCloudRenderPayload({
    colors: frame.colors,
    positions: frame.positions,
    scalarFields: frame.scalarFields,
  });
  legacyProjectionPayloads.set(frame, payload);
  return payload;
}
