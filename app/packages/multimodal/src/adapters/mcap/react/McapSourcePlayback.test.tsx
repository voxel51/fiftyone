import { PlaybackProvider } from "@fiftyone/playback";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import type { McapResourceClient } from "../types";
import { McapSourcePlayback } from "./McapSourcePlayback";

const playbackHarness = vi.hoisted(() => {
  const harness = {
    nextShellId: 0,
    sceneInventory: {
      error: null as string | null,
      sources: [] as Array<{ id: string; label: string; type: string }>,
      status: "ready" as "error" | "idle" | "loading" | "ready",
      topics: [] as never[],
      topicCount: 3,
    },
    shellMounts: 0,
    shellUnmounts: 0,
    useMcapModalLayout: vi.fn(() => ({
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
    useMcapSceneInventory: vi.fn(),
  };
  harness.useMcapSceneInventory.mockImplementation(
    () => harness.sceneInventory,
  );
  return harness;
});

vi.mock("../../../components/MultiModalPlayback/MultiModalPlayback", () => {
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

vi.mock("./McapAddTileMenu", () => ({ default: () => null }));
vi.mock("./McapInspectorSidebar", () => ({ default: () => null }));
vi.mock("./McapNetworkStatus", () => ({
  McapNetworkHealthTracker: () => null,
  McapNetworkStatusPill: () => null,
}));
vi.mock("./McapPausedByteBanking", () => ({
  McapPausedByteBanking: () => null,
}));
vi.mock("./McapSettingsSidebar", () => ({ default: () => null }));
vi.mock("./mcap-selected-object", () => ({ McapSelectionHotkeys: () => null }));
vi.mock("./McapStreams", () => ({
  McapStreams: ({
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
vi.mock("./McapTimestampReadout", () => ({ default: () => null }));
vi.mock("./use-mcap-modal-layout", () => ({
  McapModalLayoutPersistence: () => null,
  useMcapModalLayout: playbackHarness.useMcapModalLayout,
}));
vi.mock("./use-mcap-scene-inventory", () => ({
  useMcapSceneInventory: playbackHarness.useMcapSceneInventory,
}));

describe("McapSourcePlayback", () => {
  beforeEach(() => {
    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "ready",
      topics: [],
      topicCount: 3,
    };
    playbackHarness.nextShellId = 0;
    playbackHarness.shellMounts = 0;
    playbackHarness.shellUnmounts = 0;
    playbackHarness.useMcapModalLayout.mockClear();
    playbackHarness.useMcapSceneInventory.mockClear();
  });

  afterEach(() => cleanup());

  it("treats unsupported recordings as opened files with no previewable streams", () => {
    const client = {
      activateSource: vi.fn(),
    } as unknown as McapResourceClient;
    const source: ByteSourceDescriptor = {
      readProfile: BYTE_SOURCE_READ_PROFILE.LOCAL,
      sizeBytes: "12",
      sourceId: "local-file:unsupported.mcap:12:1",
      url: "local-file:unsupported.mcap:12:1",
    };

    render(
      <McapSourcePlayback
        client={client}
        fileName="unsupported.mcap"
        source={source}
      />,
    );

    expect(client.activateSource).toHaveBeenCalledWith(source);
    expect(
      screen.getByText(
        "No previewable streams in this recording (3 topics found)",
      ),
    ).toBeTruthy();
    expect(playbackHarness.useMcapModalLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: "mcap-source:local-file:unsupported.mcap:12:1",
      }),
    );
    expect(document.querySelector('[data-testid="playback-shell"]')).toBeNull();
  });

  it("preserves the mounted shell and its state across source transitions", () => {
    const client = {
      activateSource: vi.fn(),
    } as unknown as McapResourceClient;
    const firstSource = createSource("sample-a");
    const secondSource = createSource("sample-b");
    playbackHarness.sceneInventory = readyInventory("/camera/a");

    const { rerender } = render(
      <McapSourcePlayback
        client={client}
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
      <McapSourcePlayback
        client={client}
        fileName="sample-a.mcap"
        navigationPending
        source={firstSource}
      />,
    );
    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).toBe(shellInstance);
    expect(screen.getByTestId("stream-source").textContent).toBe("none");
    expect(screen.queryByTestId("mcap-poster-overlay")).toBeNull();
    expect(
      document
        .querySelector("[data-mcap-playback-shell]")
        ?.getAttribute("data-mcap-source-transitioning"),
    ).toBe("true");

    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      topics: [],
      topicCount: 0,
    };
    rerender(
      <McapSourcePlayback
        client={client}
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
    expect(screen.queryByTestId("mcap-preparing-scaffold")).toBeNull();
    expect(screen.queryByTestId("mcap-poster-overlay")).toBeNull();

    playbackHarness.sceneInventory = {
      error: "bad recording",
      sources: [],
      status: "error",
      topics: [],
      topicCount: 0,
    };
    rerender(
      <McapSourcePlayback
        client={client}
        fileName="sample-b.mcap"
        source={secondSource}
      />,
    );

    expect(
      screen.getByTestId("playback-shell").getAttribute("data-instance-id"),
    ).toBe(shellInstance);
    expect(screen.getByTestId("mcap-modal-state").textContent).toBe(
      "Failed to read recording: bad recording",
    );
    expect(screen.queryByTestId("mcap-poster-overlay")).toBeNull();

    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "ready",
      topics: [],
      topicCount: 3,
    };
    rerender(
      <McapSourcePlayback
        client={client}
        fileName="sample-b.mcap"
        source={secondSource}
      />,
    );
    expect(screen.getByTestId("mcap-modal-state").textContent).toBe(
      "No previewable streams in this recording (3 topics found)",
    );

    playbackHarness.sceneInventory = readyInventory("/camera/b");
    rerender(
      <McapSourcePlayback
        client={client}
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
    expect(screen.queryByTestId("mcap-poster-overlay")).toBeNull();
    fireEvent.click(screen.getByTestId("stream-ready"));
    expect(screen.queryByTestId("mcap-poster-overlay")).toBeNull();
    expect(
      document
        .querySelector("[data-mcap-playback-shell]")
        ?.hasAttribute("data-mcap-source-transitioning"),
    ).toBe(false);

    playbackHarness.sceneInventory = {
      error: null,
      sources: [],
      status: "loading",
      topics: [],
      topicCount: 0,
    };
    rerender(
      <McapSourcePlayback
        client={client}
        fileName="sample-a.mcap"
        source={firstSource}
      />,
    );
    expect(screen.queryByTestId("mcap-poster-overlay")).toBeNull();
    expect(screen.getByTestId("stream-source").textContent).toBe("none");
    expect(playbackHarness.shellMounts).toBe(1);
    expect(playbackHarness.shellUnmounts).toBe(0);
  });

  it("treats an etag-only rewrite as a new source transition", () => {
    const client = {
      activateSource: vi.fn(),
    } as unknown as McapResourceClient;
    const initial = createSource("rewritten", "etag-a");
    const replacement = createSource("rewritten", "etag-b");
    playbackHarness.sceneInventory = readyInventory("/camera");

    const view = render(
      <McapSourcePlayback
        client={client}
        fileName="rewritten.mcap"
        source={initial}
      />,
    );
    fireEvent.click(screen.getByTestId("stream-ready"));
    expect(
      document
        .querySelector("[data-mcap-playback-shell]")
        ?.hasAttribute("data-mcap-source-transitioning"),
    ).toBe(false);

    view.rerender(
      <McapSourcePlayback
        client={client}
        fileName="rewritten.mcap"
        source={replacement}
      />,
    );
    expect(
      document
        .querySelector("[data-mcap-playback-shell]")
        ?.getAttribute("data-mcap-source-transitioning"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("stream-ready"));
    expect(
      document
        .querySelector("[data-mcap-playback-shell]")
        ?.hasAttribute("data-mcap-source-transitioning"),
    ).toBe(false);
  });
});

function createSource(sourceId: string, etag?: string): ByteSourceDescriptor {
  return { sourceId, url: `memory://${sourceId}.mcap`, etag };
}

function readyInventory(topic: string) {
  return {
    error: null,
    sources: [{ id: topic, label: topic, type: "image" }],
    status: "ready" as const,
    topics: [],
    topicCount: 1,
  };
}
