/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { FrameSource, TrackFrames } from "@fiftyone/annotation";
import { createContext, useContext } from "react";
import type { IndexInstance } from "../tracks/frameTracks";
import { FrameCache } from "./frameCache";

/**
 * A video surface's frames beyond what its frame store holds: the
 * {@link FrameCache} both streams keep their frames in, and the server index
 * that says which frames a track occupies without loading them.
 */
export class VideoFrameSource implements FrameSource {
  readonly cache: FrameCache;
  private index: Map<string, Map<string, IndexInstance>> | null = null;

  constructor(cache: FrameCache) {
    this.cache = cache;
  }

  /** Publish the index once it loads; `null` while it is loading or failed. */
  setIndex(indexByPath: Record<string, IndexInstance[]> | null): void {
    if (!indexByPath) {
      this.index = null;
      return;
    }

    this.index = new Map(
      Object.entries(indexByPath).map(([path, instances]) => [
        path,
        new Map(instances.map((instance) => [instance.instanceId, instance])),
      ]),
    );
  }

  indexedTrack(path: string, instanceId: string): TrackFrames | null {
    const byInstance = this.index?.get(path);

    if (!byInstance) {
      return null;
    }

    const instance = byInstance.get(instanceId);
    const frames: number[] = [];

    for (const [start, end] of instance?.segments ?? []) {
      for (let frame = start; frame <= end; frame++) {
        frames.push(frame);
      }
    }

    return { frames, keyframes: [...(instance?.keyframes ?? [])] };
  }

  hold(frames: readonly number[]): Promise<() => void> {
    return this.cache.hold(frames);
  }
}

const VideoFrameSourceContext = createContext<VideoFrameSource | null>(null);

/** Provides the surface's {@link VideoFrameSource} to its streams and store. */
export const VideoFrameSourceProvider = VideoFrameSourceContext.Provider;

/** The surface's frame source; `null` outside an annotation surface. */
export const useVideoFrameSource = (): VideoFrameSource | null =>
  useContext(VideoFrameSourceContext);
