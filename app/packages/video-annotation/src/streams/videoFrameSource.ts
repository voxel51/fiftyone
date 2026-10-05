/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { FrameSource, TrackFrames } from "@fiftyone/annotation";
import { createContext, useContext } from "react";
import type { IndexInstance } from "../tracks/frameTracks";
import { FrameCache } from "./frameCache";

/** The server index's status, with the index once it has loaded. */
export type TrackIndexState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; indexByPath: Record<string, IndexInstance[]> };

interface ReadyWait {
  promise: Promise<boolean>;
  resolve: (ready: boolean) => void;
}

const readyWait = (): ReadyWait => {
  let resolve: (ready: boolean) => void = () => undefined;
  const promise = new Promise<boolean>((r) => (resolve = r));
  return { promise, resolve };
};

/**
 * A video surface's frames beyond what its frame store holds: the
 * {@link FrameCache} both streams keep their frames in, and the server index
 * that says which frames a track occupies without loading them.
 */
export class VideoFrameSource implements FrameSource {
  readonly cache: FrameCache;
  private index: Map<string, Map<string, IndexInstance>> | null = null;
  private status: TrackIndexState["status"] = "loading";
  private ready = readyWait();

  constructor(cache: FrameCache) {
    this.cache = cache;
  }

  /**
   * Publish the index's status. Entering `loading` from a settled status (a
   * stream swap or a new field set) starts a fresh {@link trackIndexReady}
   * wait; waiters already pending keep waiting for the load in progress.
   */
  setIndex(state: TrackIndexState): void {
    this.index =
      state.status === "loaded"
        ? new Map(
            Object.entries(state.indexByPath).map(([path, instances]) => [
              path,
              new Map(
                instances.map((instance) => [instance.instanceId, instance]),
              ),
            ]),
          )
        : null;

    if (state.status === this.status) {
      return;
    }

    if (this.status !== "loading") {
      this.ready = readyWait();
    }

    this.status = state.status;

    if (state.status !== "loading") {
      this.ready.resolve(state.status === "loaded");
    }
  }

  trackIndexReady(): Promise<boolean> {
    return this.ready.promise;
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
