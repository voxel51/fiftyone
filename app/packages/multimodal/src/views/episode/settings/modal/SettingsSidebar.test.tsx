import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  TilingProvider,
  useTileRegistry,
  useTiling,
  type TilingTile,
} from "@fiftyone/tiling";
import { PlaybackProvider } from "@fiftyone/playback";
import { useAtomValue } from "jotai";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneInventoryProvider } from "../../../../scene-inventory/react";
import type { SceneSource } from "../../../../scene-inventory";
import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  STREAM_METADATA,
  type StreamDescriptor,
} from "../../../../ir";
import type { EpisodeTerminology } from "../../../../ports";
import { rawTileStreamAtom } from "../../tiles/raw-message-binding";
import { TILE_TYPE } from "../../tiles/tile-types";
import { __resetModalSettingsForTests } from "./state";
import {
  TileSettingsProvider,
  useRegisterTileSettings,
} from "../../tiles/tile-settings-context";
import SettingsSidebar from "./SettingsSidebar";

const playbackFrames = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("@fiftyone/playback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/playback")>()),
  useStreamValues: () => playbackFrames.current,
}));

const PANEL_SETTINGS_TEST_ID = "panel-settings";
const CAMERA_TILE_ID = "camera-1";
const LIDAR_TILE_ID = "lidar-1";

const SOURCES: readonly SceneSource[] = [
  {
    id: "/camera/front",
    label: "front",
    sourceName: "/camera/front",
    type: SCENE_SOURCE_TYPE.IMAGE,
  },
  {
    id: "/lidar/top",
    label: "top",
    sourceName: "/lidar/top",
    type: SCENE_SOURCE_TYPE.POINT_CLOUD,
  },
  {
    id: "/camera/front/annotations",
    label: "front labels",
    sourceName: "/camera/front/annotations",
    type: SCENE_SOURCE_TYPE.IMAGE_ANNOTATION,
  },
  {
    id: "/markers",
    label: "markers",
    sourceName: "/markers",
    type: SCENE_SOURCE_TYPE.SCENE_ANNOTATION,
  },
];

const INITIAL_TILES: Record<string, TilingTile> = {
  [CAMERA_TILE_ID]: { title: "Camera", render: () => null },
  [LIDAR_TILE_ID]: { title: "3D", render: () => null },
};

const RegisteredTileBody: React.FC<{
  label: string;
  streamStreams?: readonly string[];
  tileId: string;
}> = ({ label, streamStreams, tileId }) => {
  // Memoized like production registrations: a fresh registration every
  // render would re-register every render.
  const registration = React.useMemo(
    () => ({
      content: (
        <div data-testid={PANEL_SETTINGS_TEST_ID}>{label} registered knobs</div>
      ),
      streamStreams,
    }),
    [label, streamStreams],
  );
  useRegisterTileSettings(tileId, registration);
  return null;
};

const FocusButton: React.FC<{ id: string; testId: string }> = ({
  id,
  testId,
}) => {
  const { setFocusedTileId } = useTiling();
  return (
    <button
      data-testid={testId}
      onClick={() => setFocusedTileId(id)}
      type="button"
    />
  );
};

const TileRegistryFixture: React.FC = () => {
  const { registerTile } = useTileRegistry();

  // This effect registers the tile kinds exercised by the sidebar actions.
  React.useEffect(() => {
    const cleanups = [
      registerTile({
        icon: null,
        Tile: () => null,
        type: TILE_TYPE.IMAGE,
        typeLabel: "Image",
      }),
      registerTile({
        icon: null,
        Tile: () => null,
        type: TILE_TYPE.MAP,
        typeLabel: "Map",
      }),
      registerTile({
        icon: null,
        Tile: () => null,
        type: TILE_TYPE.RAW,
        typeLabel: "Message",
      }),
    ];
    return () => cleanups.forEach((dispose) => dispose());
  }, [registerTile]);

  return null;
};

interface TilingProbeState {
  readonly focusedTileId: string | null;
  readonly titles: Readonly<Record<string, string>>;
  readonly streamsByTile: Readonly<Record<string, string>>;
}

const TilingStateProbe: React.FC<{
  readonly stateRef: { current: TilingProbeState | null };
}> = ({ stateRef }) => {
  const { focusedTileId, tiles } = useTiling();
  const streamsByTile = useAtomValue(rawTileStreamAtom);
  stateRef.current = {
    focusedTileId,
    titles: Object.fromEntries(
      Object.entries(tiles).map(([id, tile]) => [id, tile.title]),
    ),
    streamsByTile,
  };
  return null;
};

function renderSidebar({
  onTimelineSamplingRateChange = vi.fn(),
  registeredStreamStreams,
  sources = SOURCES,
  streams = [],
  terminology,
  timelineSamplingRateHz = 30,
}: {
  readonly onTimelineSamplingRateChange?: (rateHz: number) => void;
  /** Stream streams declared by the registered tiles' registrations. */
  readonly registeredStreamStreams?: readonly string[];
  readonly sources?: readonly SceneSource[];
  readonly streams?: readonly StreamDescriptor[];
  readonly terminology?: EpisodeTerminology;
  readonly timelineSamplingRateHz?: number;
} = {}) {
  const probeState: { current: TilingProbeState | null } = { current: null };
  const result = render(
    <PlaybackProvider duration={1}>
      <SceneInventoryProvider sources={sources}>
        <TilingProvider initialTiles={INITIAL_TILES}>
          <TileSettingsProvider>
            <TileRegistryFixture />
            <TilingStateProbe stateRef={probeState} />
            <RegisteredTileBody
              label="camera"
              streamStreams={registeredStreamStreams}
              tileId={CAMERA_TILE_ID}
            />
            <RegisteredTileBody
              label="lidar"
              streamStreams={registeredStreamStreams}
              tileId={LIDAR_TILE_ID}
            />
            <FocusButton id={CAMERA_TILE_ID} testId="focus-camera" />
            <FocusButton id={LIDAR_TILE_ID} testId="focus-lidar" />
            <SettingsSidebar
              onTimelineSamplingRateChange={onTimelineSamplingRateChange}
              streams={streams}
              terminology={terminology}
              timelineSamplingRateHz={timelineSamplingRateHz}
            />
          </TileSettingsProvider>
        </TilingProvider>
      </SceneInventoryProvider>
    </PlaybackProvider>,
  );
  return { ...result, probeState };
}

describe("SettingsSidebar", () => {
  beforeEach(() => {
    playbackFrames.current = [];
    localStorage.clear();
    __resetModalSettingsForTests();
  });

  afterEach(() => cleanup());

  it("starts on scene settings without a panel tab", () => {
    renderSidebar();

    expect(screen.getByRole("tab", { name: "Scene" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Streams" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Camera" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Stats" })).toBeTruthy();
  });

  it("uses format-selected terminology for the stream catalog", () => {
    renderSidebar({
      streams: ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"].map(
        (name) =>
          stream(`/${name}`, {
            count: "1",
            decodeStatus: "decodable",
            encoding: "ros1",
            schema: `example_msgs/${name}`,
          }),
      ),
      terminology: {
        stream: {
          plural: "topics",
          singular: "topic",
        },
      },
    });

    expect(screen.queryByRole("tab", { name: "Streams" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Topics" }));

    expect(screen.getByLabelText("Search topics")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Custom / Unknown" }));
    expect(screen.getByText("6 topics")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search topics"), {
      target: { value: "nothing" },
    });
    expect(screen.getByText('No topics match "nothing"')).toBeTruthy();
  });

  it("shows episode-wide playback sampling without tile timing policy", () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /Playback/ }));
    expect(screen.getByLabelText("Data sampling preset")).toBeTruthy();
    expect(screen.queryByText("Images")).toBeNull();
    expect(screen.queryByText("3D")).toBeNull();
    expect(screen.queryByLabelText("Between messages")).toBeNull();
    expect(screen.queryByText("Advanced timing")).toBeNull();
  });

  it("hides scene world controls without a playback host", () => {
    renderSidebar();

    expect(screen.queryByText("World")).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: "Reference Frame" }),
    ).toBeNull();
  });

  it("keeps warning diagnostics out of the scene settings sidebar", () => {
    vi.useFakeTimers();
    try {
      playbackFrames.current = [
        {
          frame: {
            renderPayload: {
              finitePointCount: 275_000,
              sampledPointCount: 150_000,
            },
          },
        },
      ];

      renderSidebar();

      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(screen.queryByText("Point cloud sampled for display")).toBeNull();
      expect(
        screen.queryByText("Showing 150,000 of 275,000 points."),
      ).toBeNull();
      expect(screen.getByRole("button", { name: "Stats" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens live performance diagnostics from the scene tab", () => {
    renderSidebar();

    expect(screen.queryByText("Performance diagnostics")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Stats" })
        .getAttribute("aria-expanded"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));

    expect(
      screen
        .getByRole("button", { name: "Hide stats" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByText("Performance diagnostics")).toBeTruthy();
    expect(screen.getAllByText("Playback").length).toBeGreaterThan(0);
    expect(screen.getByText("Rendering")).toBeTruthy();
    expect(screen.getByText("WebGPU")).toBeTruthy();
    expect(screen.getByText("Grid & snapshots")).toBeTruthy();
    expect(screen.getByText("GPU resources")).toBeTruthy();
    expect(screen.getByText("Browser")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide stats" }));
    expect(screen.queryByText("Performance diagnostics")).toBeNull();
  });

  it("lists all streams by category in the streams tab", () => {
    renderSidebar({
      streams: [
        stream("/lidar/top", {
          count: "12",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/PointCloud2",
        }),
        stream("/imu", {
          count: "8",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/Imu",
        }),
        stream("/tf_static", {
          count: "2",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "tf2_msgs/TFMessage",
        }),
        stream("/broken", {
          count: "3",
          decodeStatus: "schema-unavailable",
          encoding: "cdr",
          schema: "vendor_msgs/msg/Broken",
        }),
        stream("/binary", {
          count: "1",
          decodeStatus: "unsupported-encoding",
          encoding: "cbor",
          schema: "vendor.Binary",
        }),
      ],
    });

    expect(screen.queryByRole("button", { name: /Other streams/ })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Streams" }));

    expect(screen.queryByLabelText("Search streams")).toBeNull();
    expect(screen.getByRole("button", { name: /Sensors/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Transforms & Poses/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Custom \/ Unknown/ }),
    ).toBeTruthy();
    expect(screen.getByText("/lidar/top")).toBeTruthy();
    expect(screen.getByText("/imu")).toBeTruthy();
    expect(screen.getByText("8 msgs · Plot · Raw")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Inspect /imu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "3D /lidar/top" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Inspect /tf_static" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open 3D/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Open / })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Inspect /broken" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Inspect /binary" }),
    ).toBeTruthy();
    expect(screen.queryByText("Inspectable")).toBeNull();
    expect(screen.getByText("Schema unavailable")).toBeTruthy();
    expect(screen.getByText("Encoding unsupported")).toBeTruthy();
  });

  it("opens decodable streams in a Message panel without leaving Streams", () => {
    const { probeState } = renderSidebar({
      streams: [
        stream("/imu", {
          count: "8",
          decodeStatus: "decodable",
          encoding: "ros1",
          id: "7",
          schema: "sensor_msgs/Imu",
        }),
      ],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Streams" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect /imu" }));

    const focusedTileId = probeState.current?.focusedTileId;
    expect(focusedTileId?.startsWith("raw-")).toBe(true);
    expect(probeState.current?.titles[focusedTileId ?? ""]).toBe("/imu");
    expect(probeState.current?.streamsByTile[focusedTileId ?? ""]).toBe("7");
    expect(
      screen
        .getByRole("tab", { name: "Streams" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("opens image streams by canonical id while displaying the source name", () => {
    const { probeState } = renderSidebar({
      sources: [
        {
          id: "7",
          label: "camera/front",
          sourceName: "/camera/front",
          type: SCENE_SOURCE_TYPE.IMAGE,
        },
      ],
      streams: [
        stream("/camera/front", {
          count: "3",
          decodeStatus: "decodable",
          encoding: "ros1",
          id: "7",
          schema: "sensor_msgs/Image",
        }),
      ],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Streams" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Image /camera/front" }),
    );

    const focusedTileId = probeState.current?.focusedTileId;
    expect(focusedTileId?.startsWith("image-")).toBe(true);
    expect(probeState.current?.titles[focusedTileId ?? ""]).toBe(
      "camera/front",
    );
  });

  it("opens GPS streams in a Map panel without leaving Streams", () => {
    const { probeState } = renderSidebar({
      streams: [
        stream("/gps", {
          count: "5",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/NavSatFix",
        }),
      ],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Streams" }));

    expect(screen.getByText("5 msgs · Map · Raw")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "3D /gps" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Map /gps" }));

    const focusedTileId = probeState.current?.focusedTileId;
    expect(focusedTileId?.startsWith("map-")).toBe(true);
    expect(probeState.current?.titles[focusedTileId ?? ""]).toBe("Map");
    expect(
      screen
        .getByRole("tab", { name: "Streams" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("searches long stream lists", () => {
    renderSidebar({
      streams: [
        stream("/alpha", {
          count: "1",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "example_msgs/Alpha",
        }),
        stream("/beta", {
          count: "2",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "example_msgs/Beta",
        }),
        stream("/camera/front", {
          count: "3",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/Image",
        }),
        stream("/diagnostics", {
          count: "4",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "diagnostic_msgs/DiagnosticArray",
        }),
        stream("/gps", {
          count: "5",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/NavSatFix",
        }),
        stream("/imu", {
          count: "6",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/Imu",
        }),
        stream("/tf_static", {
          count: "7",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "tf2_msgs/TFMessage",
        }),
      ],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Streams" }));

    const search = screen.getByLabelText("Search streams") as HTMLInputElement;
    expect(search).toBeTruthy();
    expect(screen.getByText("/camera/front")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Image /camera/front" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Inspect /camera/front" }),
    ).toBeTruthy();

    fireEvent.change(search, { target: { value: "navsat" } });

    expect(screen.getByText("/gps")).toBeTruthy();
    expect(screen.queryByText("/alpha")).toBeNull();
    expect(screen.queryByText("/imu")).toBeNull();

    fireEvent.change(search, { target: { value: "nothing" } });

    expect(screen.getByText('No streams match "nothing"')).toBeTruthy();
  });

  it("switches to the panel tab when a panel tab first appears", () => {
    renderSidebar();

    fireEvent.click(screen.getByTestId("focus-camera"));

    expect(screen.getByRole("tab", { name: "Camera" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Camera" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByTestId(PANEL_SETTINGS_TEST_ID).textContent).toBe(
      "camera registered knobs",
    );
  });

  it("keeps the scene tab active when switching between focused panels", () => {
    renderSidebar();

    fireEvent.click(screen.getByTestId("focus-camera"));
    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
    fireEvent.click(screen.getByTestId("focus-lidar"));

    expect(screen.getByRole("tab", { name: "3D" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Scene" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "Stats" })).toBeTruthy();
    expect(screen.queryByTestId(PANEL_SETTINGS_TEST_ID)).toBeNull();
  });

  it("shows the latest focused panel settings when returning to panel tab", () => {
    renderSidebar();

    fireEvent.click(screen.getByTestId("focus-camera"));
    fireEvent.click(screen.getByTestId("focus-lidar"));
    fireEvent.click(screen.getByRole("tab", { name: "3D" }));

    expect(screen.getByTestId(PANEL_SETTINGS_TEST_ID).textContent).toBe(
      "lidar registered knobs",
    );
  });

  it("renders registry-backed tile settings", () => {
    renderSidebar();

    fireEvent.click(screen.getByTestId("focus-lidar"));

    expect(screen.getByTestId(PANEL_SETTINGS_TEST_ID).textContent).toBe(
      "lidar registered knobs",
    );
  });

  it("frames registered stream tiles with their status strip", () => {
    vi.useFakeTimers();
    try {
      renderSidebar({
        registeredStreamStreams: ["/lidar/top"],
      });

      fireEvent.click(screen.getByTestId("focus-lidar"));

      // The strip waits out brief loading transitions so enabling a source
      // cannot shift the controls down and immediately back up.
      expect(screen.queryByText(/Buffering/)).toBeNull();
      expect(screen.getByTestId(PANEL_SETTINGS_TEST_ID).textContent).toBe(
        "lidar registered knobs",
      );

      act(() => {
        vi.advanceTimersByTime(600);
      });

      // A sustained loading condition remains visible and actionable.
      expect(screen.getByText(/Buffering/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

function stream(
  name: string,
  {
    count,
    decodeStatus,
    encoding,
    id = name,
    schema,
  }: {
    readonly count: string;
    readonly decodeStatus: string;
    readonly encoding: string;
    readonly id?: string;
    readonly schema: string;
  },
): StreamDescriptor {
  const sceneType = testSceneType(schema);
  return {
    count: Number(count),
    id,
    kind: "unknown",
    metadata: {
      [SCENE_SOURCE_METADATA.SOURCE_NAME]: name,
      ...(sceneType ? { [SCENE_SOURCE_METADATA.TYPE]: sceneType } : {}),
      [STREAM_METADATA.DECODE_STATUS]: decodeStatus,
      [STREAM_METADATA.ENCODING]: encoding,
      [STREAM_METADATA.SCHEMA_NAME]: schema,
    },
    payload: {
      encoding,
      schema,
      schemaEncoding: encoding === "ros1" ? "ros1msg" : "protobuf",
    },
    sourceName: name,
    timeRange: { endNs: 1n, startNs: 0n },
  };
}

function testSceneType(schema: string): string | null {
  if (/Image$/.test(schema)) return SCENE_SOURCE_TYPE.IMAGE;
  if (/NavSatFix/.test(schema)) return SCENE_SOURCE_TYPE.LOCATION;
  if (/PointCloud/.test(schema)) return SCENE_SOURCE_TYPE.POINT_CLOUD;
  if (/Marker|Path/.test(schema)) return SCENE_SOURCE_TYPE.SCENE_ANNOTATION;
  if (/Odometry/.test(schema)) return SCENE_SOURCE_TYPE.POSE;
  if (/Diagnostic/.test(schema)) return SCENE_SOURCE_TYPE.LOG;
  return null;
}
