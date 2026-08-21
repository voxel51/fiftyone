import { PlaybackProvider } from "@fiftyone/playback";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import type { EpisodeSession } from "../../../ports";
import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  type EpisodeManifest,
  type EpisodePosterFrame,
  type EpisodeRecordingFacts,
  type StreamDescriptor,
} from "../../../ir";
import {
  peekSourceBootstrap,
  publishSourceBootstrap,
  resetSourceBootstrapCacheForTests,
} from "../../../runtime";
import { useSourcePoster } from "../image/source-poster-context";
import { TILE_TYPE } from "../tiles/tile-types";
import { SourcePlayback, TRANSITION_STATUS_DELAY_MS } from "./SourcePlayback";

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
    modalLayoutResult: {
      defaultLeftOpen: true,
      defaultLeftSidebarWidth: undefined,
      initialExpandedTileId: null,
      initialLayout: undefined as unknown,
      initialTiles: {} as Record<string, unknown>,
      onLeftOpenChange: vi.fn(),
      onLeftSidebarWidthChange: vi.fn(),
      onSceneUpAxisChange: vi.fn(),
      onTimelineSamplingRateChange: vi.fn(),
      sceneUpAxis: "z",
      timelineSamplingRateHz: 30,
    },
    useModalLayout: vi.fn(),
    useSceneInventoryState: vi.fn(),
  };
  harness.useSceneInventoryState.mockImplementation(
    () => harness.sceneInventory,
  );
  harness.useModalLayout.mockImplementation(() => harness.modalLayoutResult);
  return harness;
});

vi.mock("./PlaybackShell", () => {
  const MockPlaybackShell = ({
    children,
    fileName,
    headerActions,
    leftSidebar,
    mainOverlay,
    sceneSources,
    initialTiles,
  }: {
    readonly children?: ReactNode;
    readonly fileName: string;
    readonly headerActions?: ReactNode;
    readonly leftSidebar?: ReactNode;
    readonly mainOverlay?: ReactNode;
    readonly sceneSources?: readonly { id: string }[];
    readonly initialTiles?: Readonly<Record<string, unknown>>;
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
          <span data-testid="shell-initial-tiles">
            {Object.keys(initialTiles ?? {})
              .sort()
              .join(",")}
          </span>
          <div data-testid="shell-header-actions">{headerActions}</div>
          <button
            data-testid="shell-state"
            onClick={() => setShellState((value) => value + 1)}
          >
            {shellState}
          </button>
          {leftSidebar}
          {children}
          <div data-testid="mock-main-viewport">{mainOverlay}</div>
        </div>
      </PlaybackProvider>
    );
  };
  return { default: MockPlaybackShell };
});

vi.mock("../../../visualization/media-2d/BitmapImageView", () => ({
  BitmapImageFrameView: () => <span data-testid="mock-poster-frame" />,
}));

vi.mock("./AddTileMenu", () => ({ default: () => null }));
vi.mock("./RightSidebar", () => ({
  default: () => null,
}));
vi.mock("./NetworkStatus", () => ({
  NetworkHealthTracker: () => null,
  NetworkStatusPill: () => null,
}));
vi.mock("../settings/modal/SettingsSidebar", () => ({
  default: ({
    recordingFacts,
    terminology,
  }: {
    recordingFacts?: EpisodeRecordingFacts;
    terminology?: { stream?: { plural: string } };
  }) => (
    <>
      <span data-testid="settings-stream-term">
        {terminology?.stream?.plural}
      </span>
      <span data-testid="settings-recording-facts">
        {recordingFacts
          ? `${recordingFacts.topicCount}:${recordingFacts.sizeBytes}`
          : "none"}
      </span>
    </>
  ),
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
  }) => {
    const sourcePoster = useSourcePoster();
    return (
      <>
        <span data-testid="stream-source">{source?.sourceId ?? "none"}</span>
        <span data-testid="stream-source-poster">
          {sourcePoster
            ? `${sourcePoster.streamId}:${sourcePoster.frame.kind}`
            : "none"}
        </span>
        <button data-testid="stream-ready" onClick={onPlayheadDataReady}>
          ready
        </button>
      </>
    );
  },
}));
vi.mock("../playback/TimestampReadout", () => ({ default: () => null }));
vi.mock("../layout/use-modal-layout", () => ({
  ModalLayoutPersistence: () => null,
  useModalLayout: playbackHarness.useModalLayout,
}));
vi.mock("../stream-discovery/use-scene-inventory", () => ({
  useSceneInventoryState: playbackHarness.useSceneInventoryState,
}));

describe("SourcePlayback", () => {
  beforeEach(() => {
    resetSourceBootstrapCacheForTests();
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
    playbackHarness.modalLayoutResult = {
      defaultLeftOpen: true,
      defaultLeftSidebarWidth: undefined,
      initialExpandedTileId: null,
      initialLayout: undefined,
      initialTiles: {},
      onLeftOpenChange: vi.fn(),
      onLeftSidebarWidthChange: vi.fn(),
      onSceneUpAxisChange: vi.fn(),
      onTimelineSamplingRateChange: vi.fn(),
      sceneUpAxis: "z",
      timelineSamplingRateHz: 30,
    };
    playbackHarness.useModalLayout.mockReset();
    playbackHarness.useModalLayout.mockImplementation(
      () => playbackHarness.modalLayoutResult,
    );
    playbackHarness.useSceneInventoryState.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

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

    expect(session.activate).not.toHaveBeenCalled();
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

  it("passes the format terminology into the shared settings sidebar", () => {
    const terminology = {
      stream: {
        plural: "topics",
        singular: "topic",
      },
    } as const;
    const session = {
      activate: vi.fn(),
      terminology,
    } as unknown as EpisodeSession;
    playbackHarness.sceneInventory = readyInventory("/camera");

    render(
      <SourcePlayback
        session={session}
        fileName="sample.mcap"
        source={createSource("sample")}
      />,
    );

    expect(screen.getByTestId("settings-stream-term").textContent).toBe(
      "topics",
    );
  });

  it("builds the destination shell and poster from a buffered grid bootstrap", () => {
    const source = createSource("grid-buffered");
    const manifest = bootstrapManifest("/camera/front");
    const poster = bootstrapPoster();
    publishSourceBootstrap(source, {
      manifest,
      poster,
      posterStreamId: "/camera/front",
    });
    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      streams: [],
      streamCount: 0,
    };

    render(
      <SourcePlayback
        session={null}
        fileName="grid-buffered.mcap"
        source={source}
      />,
    );

    expect(screen.queryByTestId("episode-preparing-scaffold")).toBeNull();
    expect(screen.getByTestId("playback-shell")).toBeTruthy();
    expect(screen.getByTestId("shell-sources").textContent).toBe(
      "/camera/front",
    );
    expect(screen.getByTestId("stream-source").textContent).toBe("none");
    expect(screen.getByTestId("stream-source-poster").textContent).toBe(
      "/camera/front:encoded-image",
    );
    expect(screen.queryByTestId("episode-poster-overlay")).toBeNull();

    act(() => {
      // The cache retains 64 sources; these 65 publishes evict the destination.
      for (let index = 0; index <= 64; index++) {
        publishSourceBootstrap(createSource(`grid-overscan-${index}`), {
          manifest: bootstrapManifest(`/camera/${index}`),
        });
      }
    });
    expect(peekSourceBootstrap(source)).toBeNull();
    expect(screen.getByTestId("shell-sources").textContent).toBe(
      "/camera/front",
    );
    expect(screen.getByTestId("stream-source-poster").textContent).toBe("none");
  });

  it("keeps a bootstrap-only shell mounted while an unwarmed destination opens", () => {
    const firstSource = createSource("bootstrap-a");
    const secondSource = createSource("bootstrap-b");
    publishSourceBootstrap(firstSource, {
      manifest: bootstrapManifest("/camera/a"),
      poster: bootstrapPoster(),
      posterStreamId: "/camera/a",
    });
    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      streams: [],
      streamCount: 0,
    };

    const view = render(
      <SourcePlayback
        session={null}
        fileName="bootstrap-a.mcap"
        source={firstSource}
      />,
    );
    const shellInstance = screen
      .getByTestId("playback-shell")
      .getAttribute("data-instance-id");
    fireEvent.click(screen.getByTestId("shell-state"));

    view.rerender(
      <SourcePlayback
        session={null}
        fileName="bootstrap-b.mcap"
        source={secondSource}
      />,
    );

    expect(screen.queryByTestId("episode-preparing-scaffold")).toBeNull();
    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).toBe(shellInstance);
    expect(screen.getByTestId("shell-state").textContent).toBe("1");
    expect(screen.getByTestId("shell-file-name").textContent).toBe(
      "bootstrap-b.mcap",
    );
    expect(screen.getByTestId("shell-sources").textContent).toBe("/camera/a");
    expect(screen.getByTestId("stream-source").textContent).toBe("none");
    expect(screen.getByTestId("stream-source-poster").textContent).toBe("none");

    act(() => {
      publishSourceBootstrap(secondSource, {
        manifest: bootstrapManifest("/camera/b"),
      });
    });
    expect(screen.getByTestId("shell-sources").textContent).toBe("/camera/b");
    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).toBe(shellInstance);
  });

  it("shows compact transition feedback only after the loading delay", () => {
    vi.useFakeTimers();
    playbackHarness.sceneInventory = readyInventory("/camera");

    render(
      <SourcePlayback
        session={{ activate: vi.fn() } as unknown as EpisodeSession}
        fileName="sample.mcap"
        source={createSource("sample")}
      />,
    );

    expect(screen.queryByTestId("episode-transition-status")).toBeNull();
    act(() => vi.advanceTimersByTime(TRANSITION_STATUS_DELAY_MS - 1));
    expect(screen.queryByTestId("episode-transition-status")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("episode-transition-status").textContent).toBe(
      "Loading sample…",
    );

    fireEvent.click(screen.getByTestId("stream-ready"));
    expect(screen.queryByTestId("episode-transition-status")).toBeNull();
  });

  it("does not build an empty shell from unclassified bootstrap streams", () => {
    const source = createSource("unclassified-bootstrap");
    const manifest = bootstrapManifest("/unknown");
    publishSourceBootstrap(source, {
      manifest: {
        ...manifest,
        streams: manifest.streams.map((stream) => ({
          ...stream,
          metadata: {},
        })),
      },
    });
    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      streams: [],
      streamCount: 0,
    };

    render(
      <SourcePlayback
        session={null}
        fileName="unclassified-bootstrap.mcap"
        source={source}
      />,
    );

    expect(screen.getByTestId("episode-preparing-scaffold")).toBeTruthy();
    expect(screen.queryByTestId("playback-shell")).toBeNull();
  });

  it("never promotes an unconsumed poster into a global overlay", () => {
    const source = createSource("poster-without-image-tile");
    publishSourceBootstrap(source, {
      manifest: bootstrapManifest("/camera/front"),
      poster: bootstrapPoster(),
      posterStreamId: "/camera/front",
    });
    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      streams: [],
      streamCount: 0,
    };

    render(
      <SourcePlayback
        session={null}
        fileName="poster-without-image-tile.mcap"
        source={source}
      />,
    );

    expect(screen.queryByTestId("episode-poster-overlay")).toBeNull();
    expect(screen.getByTestId("stream-source-poster").textContent).toBe(
      "/camera/front:encoded-image",
    );
  });

  it("reseeds only with authoritative capabilities and timeline mode", () => {
    const source = createSource("capability-bootstrap");
    const nextSource = createSource("capability-next");
    const session = {
      activate: vi.fn(),
      numericSeries: {},
    } as unknown as EpisodeSession;
    publishSourceBootstrap(source, {
      manifest: bootstrapManifest("/camera/front"),
      poster: bootstrapPoster(),
      posterStreamId: "/camera/front",
    });
    playbackHarness.modalLayoutResult = {
      ...playbackHarness.modalLayoutResult,
      initialLayout: "image-1",
      initialTiles: {
        "image-1": { render: () => null, title: "Image" },
      },
    };
    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      streams: [],
      streamCount: 0,
    };

    const view = render(
      <SourcePlayback
        session={session}
        fileName="capability-bootstrap.mcap"
        source={source}
      />,
    );
    const bootstrapShellId = screen
      .getByTestId("playback-shell")
      .getAttribute("data-instance-id");
    expect(screen.getByTestId("shell-initial-tiles").textContent).toBe(
      "image-1",
    );

    playbackHarness.modalLayoutResult = {
      ...playbackHarness.modalLayoutResult,
      initialLayout: {
        direction: "row",
        first: "image-1",
        second: "plot-1",
      },
      initialTiles: {
        "image-1": { render: () => null, title: "Image" },
        "plot-1": { render: () => null, title: "Plot" },
      },
    };
    playbackHarness.sceneInventory = readyInventory("/camera/front");
    view.rerender(
      <SourcePlayback
        session={session}
        fileName="capability-bootstrap.mcap"
        source={source}
      />,
    );

    const authoritativeShellId = screen
      .getByTestId("playback-shell")
      .getAttribute("data-instance-id");
    expect(authoritativeShellId).not.toBe(bootstrapShellId);
    expect(screen.getByTestId("shell-initial-tiles").textContent).toBe(
      "image-1,plot-1",
    );
    expect(playbackHarness.useModalLayout).toHaveBeenLastCalledWith(
      expect.objectContaining({
        availableTileTypes: expect.arrayContaining([TILE_TYPE.PLOT]),
      }),
    );

    const nextManifest = bootstrapManifest("/camera/front");
    const nextSequenceManifest = {
      ...nextManifest,
      streams: nextManifest.streams.map((stream) => ({
        ...stream,
        metadata: {
          ...stream.metadata,
          "mcap.channel_metadata.timeline_fps": "10",
          "mcap.channel_metadata.timeline_mode": "sequence",
        },
      })),
    };
    publishSourceBootstrap(nextSource, {
      manifest: nextSequenceManifest,
      poster: bootstrapPoster(),
      posterStreamId: "/camera/front",
    });
    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      streams: [],
      streamCount: 0,
    };
    view.rerender(
      <SourcePlayback
        session={session}
        fileName="capability-next.mcap"
        source={nextSource}
      />,
    );
    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).toBe(authoritativeShellId);
    expect(screen.getByTestId("shell-initial-tiles").textContent).toBe(
      "image-1,plot-1",
    );

    playbackHarness.sceneInventory = readyInventory(
      "/camera/front",
      nextSequenceManifest.streams,
    );
    view.rerender(
      <SourcePlayback
        session={session}
        fileName="capability-next.mcap"
        source={nextSource}
      />,
    );
    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).not.toBe(authoritativeShellId);
    expect(screen.getByTestId("shell-initial-tiles").textContent).toBe(
      "image-1,plot-1",
    );
    expect(playbackHarness.useModalLayout).toHaveBeenLastCalledWith(
      expect.objectContaining({
        availableTileTypes: expect.arrayContaining([TILE_TYPE.PLOT]),
      }),
    );
  });

  it("keeps an unidentified poster out of the global viewport", () => {
    const source = createSource("grid-poster-without-stream");
    publishSourceBootstrap(source, {
      manifest: bootstrapManifest("/camera/front"),
      poster: bootstrapPoster(),
    });
    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      streams: [],
      streamCount: 0,
    };

    render(
      <SourcePlayback
        session={null}
        fileName="grid-poster-without-stream.mcap"
        source={source}
      />,
    );

    expect(screen.queryByTestId("episode-preparing-scaffold")).toBeNull();
    expect(screen.getByTestId("playback-shell")).toBeTruthy();
    expect(screen.queryByTestId("episode-poster-overlay")).toBeNull();
    expect(screen.getByTestId("stream-source-poster").textContent).toBe(
      "null:encoded-image",
    );
  });

  it("never applies retained recording facts to a different source", () => {
    const firstSource = createSource("sample-a");
    const secondSource = createSource("sample-b");
    const firstRecordingFacts = {
      format: "mcap",
      sizeBytes: "100",
      topicCount: 1,
    } as const;
    const secondRecordingFacts = {
      format: "mcap",
      sizeBytes: "200",
      topicCount: 2,
    } as const;
    const firstSession = sessionWithRecordingFacts(firstRecordingFacts);
    const secondSession = sessionWithRecordingFacts(secondRecordingFacts);
    playbackHarness.sceneInventory = readyInventory("/camera/a");

    const view = render(
      <SourcePlayback
        session={firstSession}
        fileName="sample-a.mcap"
        source={firstSource}
      />,
    );
    expect(screen.getByTestId("settings-recording-facts").textContent).toBe(
      "1:100",
    );
    const shellInstance = screen
      .getByTestId("playback-shell")
      .getAttribute("data-instance-id");

    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      streams: [],
      streamCount: 0,
    };
    view.rerender(
      <SourcePlayback
        session={secondSession}
        fileName="sample-b.mcap"
        source={secondSource}
      />,
    );
    expect(screen.getByTestId("settings-recording-facts").textContent).toBe(
      "none",
    );
    expect(screen.queryByTestId("episode-preparing-scaffold")).toBeNull();
    expect(screen.getByTestId("shell-sources").textContent).toBe("/camera/a");
    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).toBe(shellInstance);

    act(() => {
      publishSourceBootstrap(secondSource, {
        manifest: {
          ...bootstrapManifest("/camera/b"),
          recordingFacts: secondRecordingFacts,
        },
      });
    });
    expect(screen.getByTestId("settings-recording-facts").textContent).toBe(
      "2:200",
    );
    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).toBe(shellInstance);

    playbackHarness.sceneInventory = readyInventory("/camera/b");
    view.rerender(
      <SourcePlayback
        session={secondSession}
        fileName="sample-b.mcap"
        source={secondSource}
      />,
    );
    expect(screen.getByTestId("settings-recording-facts").textContent).toBe(
      "2:200",
    );
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
    publishSourceBootstrap(secondSource, {
      manifest: bootstrapManifest("/camera/b"),
      poster: bootstrapPoster(),
      posterStreamId: "/camera/b",
    });
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
    expect(screen.getByTestId("shell-sources").textContent).toBe("/camera/b");
    expect(screen.getByTestId("stream-source").textContent).toBe("none");
    expect(screen.getByTestId("stream-source-poster").textContent).toBe(
      "/camera/b:encoded-image",
    );
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
    publishSourceBootstrap(firstSource, {
      manifest: bootstrapManifest("/camera/a"),
      poster: bootstrapPoster(),
      posterStreamId: "/camera/a",
    });
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

function sessionWithRecordingFacts(
  recordingFacts: EpisodeRecordingFacts,
): EpisodeSession {
  return {
    activate: vi.fn(),
    manifest: { recordingFacts },
  } as unknown as EpisodeSession;
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

function bootstrapManifest(streamId: string): EpisodeManifest {
  const timeRange = { endNs: 20n, startNs: 10n };
  return {
    episodeId: "grid-buffered",
    streams: [
      {
        id: streamId,
        kind: "image",
        metadata: {
          [SCENE_SOURCE_METADATA.SOURCE_NAME]: streamId,
          [SCENE_SOURCE_METADATA.TYPE]: SCENE_SOURCE_TYPE.IMAGE,
        },
        payload: { encoding: "jpeg" },
        sourceName: streamId,
        timeRange,
      },
    ],
    timeDomain: { id: "recording", kind: "timestamp" },
    timeRange,
  };
}

function bootstrapPoster(): EpisodePosterFrame {
  return {
    image: {
      bytes: new Uint8Array([1, 2, 3]),
      kind: "encoded-image",
      mimeType: "image/jpeg",
    },
    kind: "image",
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
