import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  TileIdScope,
  TileSettingsContent,
  TilingProvider,
  useTiling,
  type TilingTile,
} from "@fiftyone/tiling";
import { PlaybackProvider } from "@fiftyone/playback";
import { useAtomValue } from "jotai";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SceneInventoryProvider,
  type SceneSource,
} from "../../../scene-inventory";
import type { StreamInventory } from "../../../schemas/v1";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { mcapRawTileTopicAtom } from "./mcap-raw-tile-state";
import { __resetMcapModalSettingsForTests } from "./mcap-modal-settings";
import {
  McapTileSettingsProvider,
  useRegisterMcapTileSettings,
} from "./mcap-tile-settings-context";
import McapSettingsSidebar from "./McapSettingsSidebar";

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
    type: MCAP_SOURCE_TYPE.IMAGE,
  },
  {
    id: "/lidar/top",
    label: "top",
    type: MCAP_SOURCE_TYPE.POINT_CLOUD,
  },
  {
    id: "/camera/front/annotations",
    label: "front labels",
    type: MCAP_SOURCE_TYPE.IMAGE_ANNOTATION,
  },
  {
    id: "/markers",
    label: "markers",
    type: MCAP_SOURCE_TYPE.SCENE_ANNOTATION,
  },
];

const INITIAL_TILES: Record<string, TilingTile> = {
  [CAMERA_TILE_ID]: { title: "Camera", render: () => null },
  [LIDAR_TILE_ID]: { title: "3D", render: () => null },
};

const TileBody: React.FC<{ label: string }> = ({ label }) => (
  <TileSettingsContent>
    <div data-testid={PANEL_SETTINGS_TEST_ID}>{label} knobs</div>
  </TileSettingsContent>
);

const RegisteredTileBody: React.FC<{
  label: string;
  streamTopics?: readonly string[];
  tileId: string;
}> = ({ label, streamTopics, tileId }) => {
  // Memoized like production registrations: a fresh registration every
  // render would re-register every render.
  const registration = React.useMemo(
    () => ({
      content: (
        <div data-testid={PANEL_SETTINGS_TEST_ID}>{label} registered knobs</div>
      ),
      streamTopics,
    }),
    [label, streamTopics],
  );
  useRegisterMcapTileSettings(tileId, registration);
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

interface TilingProbeState {
  readonly focusedTileId: string | null;
  readonly titles: Readonly<Record<string, string>>;
  readonly topicsByTile: Readonly<Record<string, string>>;
}

const TilingStateProbe: React.FC<{
  readonly stateRef: { current: TilingProbeState | null };
}> = ({ stateRef }) => {
  const { focusedTileId, tiles } = useTiling();
  const topicsByTile = useAtomValue(mcapRawTileTopicAtom);
  stateRef.current = {
    focusedTileId,
    titles: Object.fromEntries(
      Object.entries(tiles).map(([id, tile]) => [id, tile.title]),
    ),
    topicsByTile,
  };
  return null;
};

function renderSidebar({
  registeredStreamTopics,
  registeredTileSettings,
  topics = [],
}: {
  /** Stream topics declared by the registered tiles' registrations. */
  readonly registeredStreamTopics?: readonly string[];
  /** Tile ids whose settings register through the tile-settings registry. */
  readonly registeredTileSettings?: readonly string[];
  readonly topics?: readonly StreamInventory[];
} = {}) {
  const probeState: { current: TilingProbeState | null } = { current: null };
  const result = render(
    <PlaybackProvider duration={1}>
      <SceneInventoryProvider sources={SOURCES}>
        <TilingProvider initialTiles={INITIAL_TILES}>
          <McapTileSettingsProvider>
            <TilingStateProbe stateRef={probeState} />
            <TileIdScope tileId={CAMERA_TILE_ID}>
              {registeredTileSettings?.includes(CAMERA_TILE_ID) ? (
                <RegisteredTileBody
                  label="camera"
                  streamTopics={registeredStreamTopics}
                  tileId={CAMERA_TILE_ID}
                />
              ) : (
                <TileBody label="camera" />
              )}
            </TileIdScope>
            <TileIdScope tileId={LIDAR_TILE_ID}>
              {registeredTileSettings?.includes(LIDAR_TILE_ID) ? (
                <RegisteredTileBody
                  label="lidar"
                  streamTopics={registeredStreamTopics}
                  tileId={LIDAR_TILE_ID}
                />
              ) : (
                <TileBody label="lidar" />
              )}
            </TileIdScope>
            <FocusButton id={CAMERA_TILE_ID} testId="focus-camera" />
            <FocusButton id={LIDAR_TILE_ID} testId="focus-lidar" />
            <McapSettingsSidebar topics={topics} />
          </McapTileSettingsProvider>
        </TilingProvider>
      </SceneInventoryProvider>
    </PlaybackProvider>,
  );
  return { ...result, probeState };
}

describe("McapSettingsSidebar", () => {
  beforeEach(() => {
    playbackFrames.current = [];
    localStorage.clear();
    __resetMcapModalSettingsForTests();
  });

  afterEach(() => cleanup());

  it("starts on scene settings without a panel tab", () => {
    renderSidebar();

    expect(screen.getByRole("tab", { name: "Scene" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Topics" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Camera" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
    expect(screen.getByText("Advanced timing")).toBeTruthy();
  });

  it("shows the playback fidelity control without the count summary", () => {
    renderSidebar();

    expect(screen.queryByText("Images")).toBeNull();
    expect(screen.queryByText("3D")).toBeNull();
    expect(screen.getByLabelText("Between messages")).toBeTruthy();
    expect(screen.getByText("Advanced timing")).toBeTruthy();
  });

  it("hides scene world controls without a playback host", () => {
    renderSidebar();

    expect(screen.queryByText("World")).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: "Reference Frame" }),
    ).toBeNull();
  });

  it("surfaces a stabilized sampling notice in the scene status strip", () => {
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

      // The notice pipeline's appearance floor holds new conditions back so
      // boundary flips never blink the strip.
      expect(screen.queryByText("Point cloud sampled for display")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(screen.getByText("Point cloud sampled for display")).toBeTruthy();
      expect(
        screen.getByText("Showing 150,000 of 275,000 points."),
      ).toBeTruthy();
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
    expect(screen.getAllByText("Playback")).toHaveLength(2);
    expect(screen.getByText("Rendering")).toBeTruthy();
    expect(screen.getByText("WebGPU")).toBeTruthy();
    expect(screen.getByText("Grid & snapshots")).toBeTruthy();
    expect(screen.getByText("GPU resources")).toBeTruthy();
    expect(screen.getByText("Browser")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide stats" }));
    expect(screen.queryByText("Performance diagnostics")).toBeNull();
  });

  it("persists fidelity mode changes through the select", () => {
    renderSidebar();

    const select = screen.getByLabelText(
      "Between messages",
    ) as HTMLSelectElement;
    expect(select.value).toBe("smooth");

    fireEvent.change(select, { target: { value: "as-recorded" } });

    expect(
      (screen.getByLabelText("Between messages") as HTMLSelectElement).value,
    ).toBe("as-recorded");
    expect(
      JSON.parse(localStorage.getItem("fiftyone.mcap.modal-settings") ?? "{}")
        .fidelityMode,
    ).toBe("as-recorded");
  });

  it("collapses the advanced timing tuning by default", () => {
    renderSidebar();

    expect(screen.queryByLabelText("Stale frame warning")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Advanced timing/ }));

    expect(screen.getByLabelText("Stale frame warning")).toBeTruthy();
    expect(screen.getByText("Reset to defaults")).toBeTruthy();
  });

  it("lists all topics by category in the topics tab", () => {
    renderSidebar({
      topics: [
        topic("/lidar/top", {
          count: "12",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/PointCloud2",
        }),
        topic("/imu", {
          count: "8",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/Imu",
        }),
        topic("/tf_static", {
          count: "2",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "tf2_msgs/TFMessage",
        }),
        topic("/broken", {
          count: "3",
          decodeStatus: "schema-unavailable",
          encoding: "cdr",
          schema: "vendor_msgs/msg/Broken",
        }),
        topic("/binary", {
          count: "1",
          decodeStatus: "unsupported-encoding",
          encoding: "cbor",
          schema: "vendor.Binary",
        }),
      ],
    });

    expect(screen.queryByRole("button", { name: /Other topics/ })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Topics" }));

    expect(screen.queryByLabelText("Search topics")).toBeNull();
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

  it("opens decodable topics in a Message panel without leaving Topics", () => {
    const { probeState } = renderSidebar({
      topics: [
        topic("/imu", {
          count: "8",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/Imu",
        }),
      ],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Topics" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect /imu" }));

    const focusedTileId = probeState.current?.focusedTileId;
    expect(focusedTileId?.startsWith("raw-")).toBe(true);
    expect(probeState.current?.titles[focusedTileId ?? ""]).toBe("/imu");
    expect(probeState.current?.topicsByTile[focusedTileId ?? ""]).toBe("/imu");
    expect(
      screen.getByRole("tab", { name: "Topics" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("opens GPS topics in a Map panel without leaving Topics", () => {
    const { probeState } = renderSidebar({
      topics: [
        topic("/gps", {
          count: "5",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/NavSatFix",
        }),
      ],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Topics" }));

    expect(screen.getByText("5 msgs · Map · Raw")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "3D /gps" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Map /gps" }));

    const focusedTileId = probeState.current?.focusedTileId;
    expect(focusedTileId?.startsWith("map-")).toBe(true);
    expect(probeState.current?.titles[focusedTileId ?? ""]).toBe("Map");
    expect(
      screen.getByRole("tab", { name: "Topics" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("searches long topic lists", () => {
    renderSidebar({
      topics: [
        topic("/alpha", {
          count: "1",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "example_msgs/Alpha",
        }),
        topic("/beta", {
          count: "2",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "example_msgs/Beta",
        }),
        topic("/camera/front", {
          count: "3",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/Image",
        }),
        topic("/diagnostics", {
          count: "4",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "diagnostic_msgs/DiagnosticArray",
        }),
        topic("/gps", {
          count: "5",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/NavSatFix",
        }),
        topic("/imu", {
          count: "6",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "sensor_msgs/Imu",
        }),
        topic("/tf_static", {
          count: "7",
          decodeStatus: "decodable",
          encoding: "ros1",
          schema: "tf2_msgs/TFMessage",
        }),
      ],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Topics" }));

    const search = screen.getByLabelText("Search topics") as HTMLInputElement;
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

    expect(screen.getByText('No topics match "nothing"')).toBeTruthy();
  });

  it("switches to the panel tab when a panel tab first appears", () => {
    renderSidebar();

    fireEvent.click(screen.getByTestId("focus-camera"));

    expect(screen.getByRole("tab", { name: "Camera" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Camera" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByTestId(PANEL_SETTINGS_TEST_ID).textContent).toBe(
      "camera knobs",
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
    expect(screen.getByText("Advanced timing")).toBeTruthy();
    expect(screen.queryByTestId(PANEL_SETTINGS_TEST_ID)).toBeNull();
  });

  it("shows the latest focused panel settings when returning to panel tab", () => {
    renderSidebar();

    fireEvent.click(screen.getByTestId("focus-camera"));
    fireEvent.click(screen.getByTestId("focus-lidar"));
    fireEvent.click(screen.getByRole("tab", { name: "3D" }));

    expect(screen.getByTestId(PANEL_SETTINGS_TEST_ID).textContent).toBe(
      "lidar knobs",
    );
  });

  it("renders registry-backed tile settings without the DOM slot", () => {
    renderSidebar({ registeredTileSettings: [LIDAR_TILE_ID] });

    fireEvent.click(screen.getByTestId("focus-lidar"));

    expect(screen.getByTestId(PANEL_SETTINGS_TEST_ID).textContent).toBe(
      "lidar registered knobs",
    );
  });

  it("frames registered stream tiles with their status strip", () => {
    vi.useFakeTimers();
    try {
      renderSidebar({
        registeredTileSettings: [LIDAR_TILE_ID],
        registeredStreamTopics: ["/lidar/top"],
      });

      fireEvent.click(screen.getByTestId("focus-lidar"));

      // No stream state has been written for the topic, but the strip waits
      // out brief loading transitions so enabling a source cannot shift the
      // controls down and immediately back up.
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

  it("falls back to the DOM slot when switching to a portal tile", () => {
    renderSidebar({ registeredTileSettings: [LIDAR_TILE_ID] });

    fireEvent.click(screen.getByTestId("focus-lidar"));
    fireEvent.click(screen.getByTestId("focus-camera"));

    expect(screen.getByTestId(PANEL_SETTINGS_TEST_ID).textContent).toBe(
      "camera knobs",
    );
  });
});

function topic(
  name: string,
  {
    count,
    decodeStatus,
    encoding,
    schema,
  }: {
    readonly count: string;
    readonly decodeStatus: string;
    readonly encoding: string;
    readonly schema: string;
  },
): StreamInventory {
  return {
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory",
    displayName: name,
    metadata: {
      "mcap.generic_decode_status": decodeStatus,
      "mcap.message_encoding": encoding,
      "mcap.schema_name": schema,
      "mcap.topic": name,
    },
    payload: {
      $typeName: "fiftyone.multimodal.schemas.v1.PayloadDescriptor",
      encoding,
      schema,
      schemaEncoding: encoding === "ros1" ? "ros1msg" : "protobuf",
    },
    recordCount: count,
    streamId: name,
  };
}
