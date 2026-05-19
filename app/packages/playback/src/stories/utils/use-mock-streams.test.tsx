import { cleanup, render } from "@testing-library/react";
import { TilingProvider, useRegisteredTiles } from "@fiftyone/tiling";
import { Provider as JotaiProvider, createStore } from "jotai";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// @react-three/fiber pulls in Canvas which jsdom can't render; the
// SceneTile module is reached transitively via mock-scene-stream.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="three-canvas">{children}</div>
  ),
}));
vi.mock("@react-three/drei", () => ({ OrbitControls: () => null }));

import { PlaybackProvider, usePlayback } from "../../lib/playback/PlaybackProvider";
import { useMockStreams, type MockStreamConfig } from "./use-mock-streams";

const Probe: React.FC<{
  configs: MockStreamConfig[];
  onReady: (state: {
    duration: number;
    tileTypes: string[];
    tileStreamIds: string[];
  }) => void;
}> = ({ configs, onReady }) => {
  useMockStreams(configs);
  const { duration } = usePlayback();
  const tiles = useRegisteredTiles();
  React.useEffect(() => {
    onReady({
      duration,
      tileTypes: tiles.map((t) => t.type),
      tileStreamIds: tiles.map((t) => t.streamId),
    });
  }, [duration, tiles, onReady]);
  return null;
};

describe("useMockStreams", () => {
  afterEach(() => cleanup());

  it("registers each stream with the playback engine and each tile with the registry", () => {
    const store = createStore();
    const captured: Array<{
      duration: number;
      tileTypes: string[];
      tileStreamIds: string[];
    }> = [];
    render(
      <JotaiProvider store={store}>
        <PlaybackProvider>
          <TilingProvider>
            <Probe
              configs={[
                { type: "camera", id: "cam_a", title: "Cam A", duration: 8 },
                { type: "lidar", id: "lid_a", title: "Lid A", duration: 12 },
              ]}
              onReady={(s) => captured.push(s)}
            />
          </TilingProvider>
        </PlaybackProvider>
      </JotaiProvider>
    );

    // The last captured snapshot reflects steady state.
    const last = captured[captured.length - 1];
    expect(last.duration).toBe(12); // max of registered streams
    expect(last.tileStreamIds).toEqual(["cam_a", "lid_a"]);
    expect(last.tileTypes).toEqual(["camera", "lidar"]);
  });

  it("unregisters tiles + streams on unmount", () => {
    const store = createStore();
    const snapshots: Array<{ tileStreamIds: string[]; duration: number }> = [];
    const { unmount } = render(
      <JotaiProvider store={store}>
        <PlaybackProvider duration={3}>
          <TilingProvider>
            <Probe
              configs={[
                { type: "camera", id: "cam_a", title: "Cam A", duration: 8 },
              ]}
              onReady={(s) => snapshots.push(s)}
            />
          </TilingProvider>
        </PlaybackProvider>
      </JotaiProvider>
    );
    expect(snapshots[snapshots.length - 1].tileStreamIds).toEqual(["cam_a"]);

    unmount();

    // After unmount the tile registry on this store should be empty.
    let postTiles: string[] = [];
    render(
      <JotaiProvider store={store}>
        <TilingProvider>
          <Reader onReady={(t) => (postTiles = t)} />
        </TilingProvider>
      </JotaiProvider>
    );
    expect(postTiles).toEqual([]);
  });
});

const Reader: React.FC<{ onReady: (ids: string[]) => void }> = ({ onReady }) => {
  const tiles = useRegisteredTiles();
  React.useEffect(() => {
    onReady(tiles.map((t) => t.streamId));
  }, [tiles, onReady]);
  return null;
};
