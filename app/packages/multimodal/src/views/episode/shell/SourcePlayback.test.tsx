import { PlaybackProvider } from "@fiftyone/playback";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import type { EpisodeSession } from "../../../ports";
import type { StreamDescriptor } from "../../../ir";
import { SourcePlayback } from "./SourcePlayback";

const playbackHarness = vi.hoisted(() => {
  const harness = {
    nextShellId: 0,
    sceneInventory: {
      error: null as string | null,
      sources: [] as Array<{ id: string; label: string; type: string }>,
      status: "ready" as "error" | "idle" | "loading" | "ready",
      streams: [] as StreamDescriptor[],
      streamCount: 3,
    },
    shellMounts: 0,
    shellUnmounts: 0,
    useModalLayout: vi.fn(() => ({
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
    useSceneInventory: vi.fn(),
  };
  harness.useSceneInventory.mockImplementation(() => harness.sceneInventory);
  return harness;
});

vi.mock("./PlaybackShell", () => {
  const MockPlaybackShell = ({
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

    // This effect records shell mount stability across fixture rerenders.
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
  return { default: MockPlaybackShell };
});

vi.mock("./AddTileMenu", () => ({ default: () => null }));
vi.mock("../scene/picking/InspectorSidebar", () => ({
  default: () => null,
}));
vi.mock("./NetworkStatus", () => ({
  NetworkHealthTracker: () => null,
  NetworkStatusPill: () => null,
}));
vi.mock("../playback/PausedByteBanking", () => ({
  PausedByteBanking: () => null,
}));
vi.mock("../settings/modal/SettingsSidebar", () => ({
  default: () => null,
}));
vi.mock("../interaction/selection/selected-object", () => ({
  SelectionHotkeys: () => null,
}));
vi.mock("./Streams", () => ({
  Streams: ({
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
vi.mock("../playback/TimestampReadout", () => ({ default: () => null }));
vi.mock("../layout/use-modal-layout", () => ({
  ModalLayoutPersistence: () => null,
  useModalLayout: playbackHarness.useModalLayout,
}));
vi.mock("../stream-discovery/use-scene-inventory", () => ({
  useSceneInventory: playbackHarness.useSceneInventory,
}));

describe("SourcePlayback", () => {
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
    playbackHarness.useModalLayout.mockClear();
    playbackHarness.useSceneInventory.mockClear();
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
      <SourcePlayback
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
    expect(playbackHarness.useModalLayout).toHaveBeenCalledWith(
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
      <SourcePlayback
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
      <SourcePlayback
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
      <SourcePlayback
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
      <SourcePlayback
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
      <SourcePlayback
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
      <SourcePlayback
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
      <SourcePlayback
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
      <SourcePlayback
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
      <SourcePlayback
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

  it("remounts the shell when the resolved timeline mode changes across a source navigation", () => {
    const session = {
      activate: vi.fn(),
    } as unknown as EpisodeSession;
    const firstSource = createSource("sample-a");
    const secondSource = createSource("sample-b");
    playbackHarness.sceneInventory = readyInventory("/camera/a");

    const { rerender } = render(
      <SourcePlayback
        session={session}
        fileName="sample-a.mcap"
        source={firstSource}
      />,
    );
    const durationInstance = screen
      .getByTestId("playback-shell")
      .getAttribute("data-instance-id");

    playbackHarness.sceneInventory = readyInventory("/camera/b", [
      timelineModeStream("sequence", {
        "mcap.channel_metadata.timeline_fps": "24",
      }),
    ]);
    rerender(
      <SourcePlayback
        session={session}
        fileName="sample-b.mcap"
        source={secondSource}
      />,
    );

    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).not.toBe(durationInstance);
  });
});

function createSource(sourceId: string, etag?: string): ByteSourceDescriptor {
  return { sourceId, url: `memory://${sourceId}.mcap`, etag };
}

function timelineModeStream(
  mode: "sequence" | "absolute",
  extraMetadata: Record<string, string> = {},
): StreamDescriptor {
  return {
    id: "/topic",
    kind: "image",
    metadata: { "mcap.channel_metadata.timeline_mode": mode, ...extraMetadata },
    payload: {
      encoding: "protobuf",
      schema: "foxglove.CompressedImage",
      schemaEncoding: "protobuf",
    },
    sourceName: "/topic",
    timeRange: { endNs: 1n, startNs: 0n },
  };
}

function readyInventory(stream: string, streams: StreamDescriptor[] = []) {
  return {
    error: null,
    sources: [{ id: stream, label: stream, type: "image" }],
    status: "ready" as const,
    streams,
    streamCount: 1,
  };
}
