import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import McapLogConsoleTile from "./McapLogConsoleTile";

const mocks = vi.hoisted(() => {
  let releaseRead: () => void = () => undefined;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const nearestTick = vi.fn(() => 1_000_000_000n);
  const readDecodedMessages = vi.fn(() => ({
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      await readGate;
      return { done: true as const, value: undefined };
    },
  }));
  const timelineIndex = {
    nearestTick,
    nsToSec: (timeNs: bigint) => Number(timeNs) / 1_000_000_000,
    startTimeNs: 0n,
  };
  return {
    client: { readDecodedMessages },
    dataStream: {
      getTimelineIndex: () => timelineIndex,
    },
    getPlayhead: vi.fn(() => 0),
    logSources: [{ id: "/rosout", label: "ROS logs" }],
    nearestTick,
    playbackStore: {},
    readDecodedMessages,
    releaseRead,
    seek: vi.fn(),
    setLogSettings: vi.fn(),
    setTileTitle: vi.fn(),
    source: { sourceId: "logs", url: "memory://logs" },
    subscribePlayhead: vi.fn(() => vi.fn()),
  };
});

vi.mock("@fiftyone/playback", () => ({
  getPlayhead: mocks.getPlayhead,
  subscribePlayhead: mocks.subscribePlayhead,
  usePlayback: () => ({ seek: mocks.seek }),
  usePlaybackStore: () => mocks.playbackStore,
}));

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => mocks.setTileTitle,
}));

vi.mock("@voxel51/voodo", () => ({
  Checkbox: ({ label }: { readonly label: string }) => <span>{label}</span>,
}));

vi.mock("../../../scene-inventory/SceneInventoryProvider", () => ({
  useSceneSourcesByType: () => mocks.logSources,
}));

vi.mock("./mcap-data-stream-context", () => ({
  useMcapDataStream: () => mocks.dataStream,
}));

vi.mock("./mcap-log-console-context", () => ({
  useMcapLogConsoleContext: () => ({
    client: mocks.client,
    source: mocks.source,
  }),
}));

vi.mock("./mcap-log-tile-state", () => ({
  useMcapLogTileSettings: () => ({
    followPlayhead: true,
    selectedLevels: ["info"],
  }),
  useSetMcapLogTileSettings: () => mocks.setLogSettings,
}));

afterEach(() => {
  mocks.releaseRead();
  cleanup();
  vi.restoreAllMocks();
});

describe("McapLogConsoleTile", () => {
  it("preserves the follow throttle while a history read is loading", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(<McapLogConsoleTile />);

    await waitFor(() => {
      expect(mocks.readDecodedMessages).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/loading/)).toBeTruthy();
    expect(mocks.nearestTick).toHaveBeenCalledTimes(1);

    act(() => mocks.releaseRead());

    await waitFor(() => {
      expect(screen.queryByText(/loading/)).toBeNull();
    });
    expect(mocks.nearestTick).toHaveBeenCalledTimes(1);
  });
});
