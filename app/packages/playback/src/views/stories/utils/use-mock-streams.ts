import { useEffect, useMemo } from "react";
import { usePlayback } from "../../../lib/playback/PlaybackProvider";
import {
  createMockCameraStream,
  type MockCameraOptions,
} from "./mock-camera-stream";
import {
  createMockGraphStream,
  type MockGraphOptions,
} from "./mock-graph-stream";
import {
  createMockJsonStream,
  type MockJsonOptions,
} from "./mock-json-stream";
import {
  createMockLidarStream,
  type MockLidarOptions,
} from "./mock-lidar-stream";
import {
  createMockSceneStream,
  type MockSceneOptions,
} from "./mock-scene-stream";
import type { MockStreamBundle } from "./types";

/**
 * One entry per mock stream the demo wants. The `kind` discriminant
 * selects the factory; the remaining fields are that factory's options.
 */
export type MockStreamConfig =
  | ({ kind: "camera" } & MockCameraOptions)
  | ({ kind: "lidar" } & MockLidarOptions)
  | ({ kind: "scene" } & MockSceneOptions)
  | ({ kind: "graph" } & MockGraphOptions)
  | ({ kind: "json" } & MockJsonOptions);

/**
 * Pure conversion: `MockStreamConfig` → `MockStreamBundle`. No hooks,
 * no provider context — safe to call at module level when a story
 * needs to derive things from the bundles (e.g. initial tile entries)
 * before mounting the providers.
 */
export function buildBundle(config: MockStreamConfig): MockStreamBundle {
  switch (config.kind) {
    case "camera":
      return createMockCameraStream(config);
    case "lidar":
      return createMockLidarStream(config);
    case "scene":
      return createMockSceneStream(config);
    case "graph":
      return createMockGraphStream(config);
    case "json":
      return createMockJsonStream(config);
  }
}

/**
 * Build mock-stream bundles from `configs` and register each one with
 * the surrounding `PlaybackProvider`. Returns the bundles so the caller
 * can:
 *
 * - seed `TilingProvider`'s `initialTiles` from them,
 * - drive the add-tile menu from them,
 * - or otherwise enumerate "what data exists right now".
 *
 * The bundles are built **once on mount** — changing `configs` on
 * subsequent renders does NOT rebuild the streams. This mirrors how
 * `PlaybackProvider` treats its config: provider config is mount-time,
 * so the stream set should be too. Pass a stable configs array, or
 * remount the provider tree to swap streams.
 */
export function useMockStreams(
  configs: MockStreamConfig[]
): MockStreamBundle[] {
  const { registerStream } = usePlayback();

  // Built once at mount. The lint suppression is intentional — see the
  // doc comment above for the mount-time-only contract.
  const bundles = useMemo(
    () => configs.map(buildBundle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    const cleanups = bundles.map((b) => registerStream(b.stream));
    return () => {
      for (const c of cleanups) c();
    };
  }, [bundles, registerStream]);

  return bundles;
}
