import { PlaybackProvider } from "@fiftyone/playback";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../query/bytes";
import type { EpisodeSession } from "../../ports";
import { EpisodeSourcePlayback } from "./EpisodeSourcePlayback";

const playbackHarness = vi.hoisted(() => {
  const harness = {
    nextShellId: 0,
    sceneInventory: {
      error: null as string | null,
      sources: [] as Array<{ id: string; label: string; type: string }>,
      status: "ready" as "error" | "idle" | "loading" | "ready",
      streams: [] as never[],
      streamCount: 3,
    },
    shellMounts: 0,
    shellUnmounts: 0,
    useEpisodeModalLayout: vi.fn(() => ({
      defaultLeftOpen: true,
      defaultLeftSidebarWidth: undefined,
      initialExpandedTileId: null,
      initialLayout: undefined,
      initialTiles: {},
      onLeftOpenChange: vi.fn(),
      onLeftSidebarWidthChange: vi.fn(),
      onSceneUpAxisChange: vi.fn(),
      sceneUpAxis: "z",
    })),
    useEpisodeSceneInventory: vi.fn(),
  };
  harness.useEpisodeSceneInventory.mockImplementation(
    () => harness.sceneInventory,
  );
  return harness;
});

vi.mock("../../components/MultiModalPlayback/MultiModalPlayback", () => {
  const MockMultiModalPlayback = ({
    children,
    fileName,
    mainOverlay,
    sceneSources,
  }: {
    readonly children?: ReactNode;
    readonly fileName: string;
    readonly mainOverlay?: ReactNode;
    readonly sceneSources?: readonly { id: string }[];
  }) => {
    const instanceIdRef = useRef<number | null>(null);
    if (instanceIdRef.current === null) {
      instanceIdRef.current = ++playbackHarness.nextShellId;
    }
    const instanceId = instanceIdRef.current;
    const [shellState, setShellState] = useState(0);
    useEffect(() => {
      playbackHarness.shellMounts += 1;
      return () => {
        playbackHarness.shellUnmounts += 1;
      };
    }, []);
    return (
      <PlaybackProvider>
        <div data-instance-id={instanceId} data-testid="playback-shell">
          <span data-testid="shell-file-name">{fileName}</span>
          <span data-testid="shell-sources">
            {sceneSources?.map((source) => source.id).join(",") ?? ""}
          </span>
          <button
            data-testid="shell-state"
            onClick={() => setShellState((value) => value + 1)}
          >
            {shellState}
          </button>
          {children}
          <div data-testid="mock-main-viewport">{mainOverlay}</div>
        </div>
      </PlaybackProvider>
    );
  };
  return { default: MockMultiModalPlayback };
});

vi.mock("./EpisodeAddTileMenu", () => ({ default: () => null }));
vi.mock("./EpisodeInspectorSidebar", () => ({ default: () => null }));
vi.mock("./EpisodeNetworkStatus", () => ({
  EpisodeNetworkHealthTracker: () => null,
  EpisodeNetworkStatusPill: () => null,
}));
vi.mock("./EpisodePausedByteBanking", () => ({
  EpisodePausedByteBanking: () => null,
}));
vi.mock("./EpisodeSettingsSidebar", () => ({ default: () => null }));
vi.mock("./episode-selected-object", () => ({
  EpisodeSelectionHotkeys: () => null,
}));
vi.mock("./EpisodeStreams", () => ({
  EpisodeStreams: ({
    onPlayheadDataReady,
    source,
  }: {
    onPlayheadDataReady?: () => void;
    source: ByteSourceDescriptor | null;
  }) => (
    <>
      <span data-testid="stream-source">{source?.sourceId ?? "none"}</span>
      <button data-testid="stream-ready" onClick={onPlayheadDataReady}>
        ready
      </button>
    </>
  ),
}));
vi.mock("./EpisodeTimestampReadout", () => ({ default: () => null }));
vi.mock("./use-episode-modal-layout", () => ({
  EpisodeModalLayoutPersistence: () => null,
  useEpisodeModalLayout: playbackHarness.useEpisodeModalLayout,
}));
vi.mock("./use-episode-scene-inventory", () => ({
  useEpisodeSceneInventory: playbackHarness.useEpisodeSceneInventory,
}));

describe("EpisodeSourcePlayback", () => {
  beforeEach(() => {
    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "ready",
      streams: [],
      streamCount: 3,
    };
    playbackHarness.nextShellId = 0;
    playbackHarness.shellMounts = 0;
    playbackHarness.shellUnmounts = 0;
    playbackHarness.useEpisodeModalLayout.mockClear();
    playbackHarness.useEpisodeSceneInventory.mockClear();
  });

  afterEach(() => cleanup());

  it("treats unsupported recordings as opened files with no previewable streams", () => {
    const session = {
      activate: vi.fn(),
    } as unknown as EpisodeSession;
    const source: ByteSourceDescriptor = {
      readProfile: BYTE_SOURCE_READ_PROFILE.LOCAL,
      sizeBytes: "12",
      sourceId: "local-file:unsupported.mcap:12:1",
      url: "local-file:unsupported.mcap:12:1",
    };

    render(
      <EpisodeSourcePlayback
        session={session}
        fileName="unsupported.mcap"
        source={source}
      />,
    );

    expect(session.activate).toHaveBeenCalledWith();
    expect(
      screen.getByText(
        "No previewable streams in this recording (3 streams found)",
      ),
    ).toBeTruthy();
    expect(playbackHarness.useEpisodeModalLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: "episode-source:local-file:unsupported.mcap:12:1",
      }),
    );
    expect(document.querySelector('[data-testid="playback-shell"]')).toBeNull();
  });

  it("preserves the mounted shell and its state across source transitions", () => {
    const session = {
      activate: vi.fn(),
    } as unknown as EpisodeSession;
    const firstSource = createSource("sample-a");
    const secondSource = createSource("sample-b");
    playbackHarness.sceneInventory = readyInventory("/camera/a");

    const { rerender } = render(
      <EpisodeSourcePlayback
        session={session}
        fileName="sample-a.mcap"
        source={firstSource}
      />,
    );
    const shellInstance = screen
      .getByTestId("playback-shell")
      .getAttribute("data-instance-id");
    fireEvent.click(screen.getByTestId("shell-state"));
    fireEvent.click(screen.getByTestId("stream-ready"));

    rerender(
      <EpisodeSourcePlayback
        session={session}
        fileName="sample-a.mcap"
        navigationPending
        source={firstSource}
      />,
    );
    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).toBe(shellInstance);
    expect(screen.getByTestId("stream-source").textContent).toBe("none");
    expect(screen.queryByTestId("episode-poster-overlay")).toBeNull();
    expect(
      document
        .querySelector("[data-episode-playback-shell]")
        ?.getAttribute("data-episode-source-transitioning"),
    ).toBe("true");

    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      streams: [],
      streamCount: 0,
    };
    rerender(
      <EpisodeSourcePlayback
        session={session}
        fileName="sample-b.mcap"
        source={secondSource}
      />,
    );

    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).toBe(shellInstance);
    expect(screen.getByTestId("shell-state").textContent).toBe("1");
    expect(screen.getByTestId("shell-file-name").textContent).toBe(
      "sample-b.mcap",
    );
    expect(screen.getByTestId("shell-sources").textContent).toBe("/camera/a");
    expect(screen.getByTestId("stream-source").textContent).toBe("none");
    expect(screen.queryByTestId("episode-preparing-scaffold")).toBeNull();
    expect(screen.queryByTestId("episode-poster-overlay")).toBeNull();

    playbackHarness.sceneInventory = {
      error: "bad recording",
      sources: [],
      status: "error",
      streams: [],
      streamCount: 0,
    };
    rerender(
      <EpisodeSourcePlayback
        session={session}
        fileName="sample-b.mcap"
        source={secondSource}
      />,
    );

    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).toBe(shellInstance);
    expect(screen.getByTestId("episode-modal-state").textContent).toBe(
      "Failed to read recording: bad recording",
    );
    expect(screen.queryByTestId("episode-poster-overlay")).toBeNull();

    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "ready",
      streams: [],
      streamCount: 3,
    };
    rerender(
      <EpisodeSourcePlayback
        session={session}
        fileName="sample-b.mcap"
        source={secondSource}
      />,
    );
    expect(screen.getByTestId("episode-modal-state").textContent).toBe(
      "No previewable streams in this recording (3 streams found)",
    );

    playbackHarness.sceneInventory = readyInventory("/camera/b");
    rerender(
      <EpisodeSourcePlayback
        session={session}
        fileName="sample-b.mcap"
        source={secondSource}
      />,
    );

    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).toBe(shellInstance);
    expect(screen.getByTestId("shell-state").textContent).toBe("1");
    expect(screen.getByTestId("shell-sources").textContent).toBe("/camera/b");
    expect(screen.getByTestId("stream-source").textContent).toBe("sample-b");
    expect(screen.queryByTestId("episode-poster-overlay")).toBeNull();
    fireEvent.click(screen.getByTestId("stream-ready"));
    expect(screen.queryByTestId("episode-poster-overlay")).toBeNull();
    expect(
      document
        .querySelector("[data-episode-playback-shell]")
        ?.hasAttribute("data-episode-source-transitioning"),
    ).toBe(false);

    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      streams: [],
      streamCount: 0,
    };
    rerender(
      <EpisodeSourcePlayback
        session={session}
        fileName="sample-a.mcap"
        source={firstSource}
      />,
    );
    expect(screen.queryByTestId("episode-poster-overlay")).toBeNull();
    expect(screen.getByTestId("stream-source").textContent).toBe("none");
    expect(playbackHarness.shellMounts).toBe(1);
    expect(playbackHarness.shellUnmounts).toBe(0);
  });

  it("treats an etag-only rewrite as a new source transition", () => {
    const session = {
      activate: vi.fn(),
    } as unknown as EpisodeSession;
    const initial = createSource("rewritten", "etag-a");
    const replacement = createSource("rewritten", "etag-b");
    playbackHarness.sceneInventory = readyInventory("/camera");

    const view = render(
      <EpisodeSourcePlayback
        session={session}
        fileName="rewritten.mcap"
        source={initial}
      />,
    );
    fireEvent.click(screen.getByTestId("stream-ready"));
    expect(
      document
        .querySelector("[data-episode-playback-shell]")
        ?.hasAttribute("data-episode-source-transitioning"),
    ).toBe(false);

    view.rerender(
      <EpisodeSourcePlayback
        session={session}
        fileName="rewritten.mcap"
        source={replacement}
      />,
    );
    expect(
      document
        .querySelector("[data-episode-playback-shell]")
        ?.getAttribute("data-episode-source-transitioning"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("stream-ready"));
    expect(
      document
        .querySelector("[data-episode-playback-shell]")
        ?.hasAttribute("data-episode-source-transitioning"),
    ).toBe(false);
  });
});

function createSource(sourceId: string, etag?: string): ByteSourceDescriptor {
  return { sourceId, url: `memory://${sourceId}.mcap`, etag };
}

function readyInventory(stream: string) {
  return {
    error: null,
    sources: [{ id: stream, label: stream, type: "image" }],
    status: "ready" as const,
    streams: [],
    streamCount: 1,
  };
}
