import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import EpisodeLogConsoleTile from "./EpisodeLogConsoleTile";

const mocks = vi.hoisted(() => {
  let releaseRead: () => void = () => undefined;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const nearestTick = vi.fn(() => 1_000_000_000n);
  const read = vi.fn(async function* () {
    await readGate;
    yield* [];
  });
  const timelineIndex = {
    nearestTick,
    nsToSec: (timeNs: bigint) => Number(timeNs) / 1_000_000_000,
    startTimeNs: 0n,
  };
  return {
    dataStream: {
      getTimelineIndex: () => timelineIndex,
    },
    getPlayhead: vi.fn(() => 0),
    logSources: [{ id: "/rosout", label: "ROS logs" }],
    nearestTick,
    playbackStore: {},
    read,
    releaseRead,
    session: { read },
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

vi.mock("../../../scene-inventory/react", () => ({
  useSceneSourcesByType: () => mocks.logSources,
}));

vi.mock("../playback/episode-data-stream-context", () => ({
  useEpisodeDataStream: () => mocks.dataStream,
}));

vi.mock("./episode-log-console-context", () => ({
  useEpisodeLogConsoleContext: () => ({
    session: mocks.session,
    sourceKey: mocks.source.sourceId,
  }),
}));

vi.mock("./episode-log-tile-state", () => ({
  useEpisodeLogTileSettings: () => ({
    followPlayhead: true,
    selectedLevels: ["info"],
  }),
  useSetEpisodeLogTileSettings: () => mocks.setLogSettings,
}));

afterEach(() => {
  mocks.releaseRead();
  cleanup();
  vi.restoreAllMocks();
});

describe("EpisodeLogConsoleTile", () => {
  it("preserves the follow throttle while a history read is loading", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(<EpisodeLogConsoleTile />);

    await waitFor(() => {
      expect(mocks.read).toHaveBeenCalledTimes(1);
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
