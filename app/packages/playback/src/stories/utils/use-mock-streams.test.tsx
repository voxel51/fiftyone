import { cleanup, render } from "@testing-library/react";
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
  onReady: (state: { duration: number; bundleIds: string[] }) => void;
}> = ({ configs, onReady }) => {
  const bundles = useMockStreams(configs);
  const { duration } = usePlayback();
  React.useEffect(() => {
    onReady({
      duration,
      bundleIds: bundles.map((b) => b.id),
    });
  }, [duration, bundles, onReady]);
  return null;
};

describe("useMockStreams", () => {
  afterEach(() => cleanup());

  it("registers each stream with the playback engine and returns the bundles", () => {
    const store = createStore();
    const captured: Array<{ duration: number; bundleIds: string[] }> = [];
    render(
      <JotaiProvider store={store}>
        <PlaybackProvider>
          <Probe
            configs={[
              { type: "camera", id: "cam_a", title: "Cam A", duration: 8 },
              { type: "lidar", id: "lid_a", title: "Lid A", duration: 12 },
            ]}
            onReady={(s) => captured.push(s)}
          />
        </PlaybackProvider>
      </JotaiProvider>
    );

    const last = captured[captured.length - 1];
    expect(last.duration).toBe(12); // max of registered streams
    expect(last.bundleIds).toEqual(["cam_a", "lid_a"]);
  });

  it("unregisters streams on unmount", () => {
    const store = createStore();
    const snapshots: Array<{ bundleIds: string[]; duration: number }> = [];
    const { unmount } = render(
      <JotaiProvider store={store}>
        <PlaybackProvider duration={3}>
          <Probe
            configs={[
              { type: "camera", id: "cam_a", title: "Cam A", duration: 8 },
            ]}
            onReady={(s) => snapshots.push(s)}
          />
        </PlaybackProvider>
      </JotaiProvider>
    );
    expect(snapshots[snapshots.length - 1].bundleIds).toEqual(["cam_a"]);

    unmount();

    // Re-mount a probe with no streams to confirm the engine duration
    // collapses back to its fallback (no streams registered).
    let postDuration = -1;
    render(
      <JotaiProvider store={store}>
        <PlaybackProvider duration={3}>
          <DurationReader onReady={(d) => (postDuration = d)} />
        </PlaybackProvider>
      </JotaiProvider>
    );
    expect(postDuration).toBe(3);
  });
});

const DurationReader: React.FC<{ onReady: (d: number) => void }> = ({
  onReady,
}) => {
  const { duration } = usePlayback();
  React.useEffect(() => {
    onReady(duration);
  }, [duration, onReady]);
  return null;
};
