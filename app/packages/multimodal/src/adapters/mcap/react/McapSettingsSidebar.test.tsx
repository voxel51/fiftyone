import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  TileIdScope,
  TileSettingsContent,
  TilingProvider,
  useTiling,
  type TilingTile,
} from "@fiftyone/tiling";
import { useAtomValue } from "jotai";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SceneInventoryProvider,
  type SceneSource,
} from "../../../scene-inventory";
import type { StreamInventory } from "../../../schemas/v1";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { mcapRawTileTopicAtom } from "./mcap-raw-tile-state";
import { __resetMcapModalSettingsForTests } from "./mcap-modal-settings";
import McapSettingsSidebar from "./McapSettingsSidebar";

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
  topics = [],
}: {
  readonly topics?: readonly StreamInventory[];
} = {}) {
  const probeState: { current: TilingProbeState | null } = { current: null };
  const result = render(
    <SceneInventoryProvider sources={SOURCES}>
      <TilingProvider initialTiles={INITIAL_TILES}>
        <TilingStateProbe stateRef={probeState} />
        <TileIdScope tileId={CAMERA_TILE_ID}>
          <TileBody label="camera" />
        </TileIdScope>
        <TileIdScope tileId={LIDAR_TILE_ID}>
          <TileBody label="lidar" />
        </TileIdScope>
        <FocusButton id={CAMERA_TILE_ID} testId="focus-camera" />
        <FocusButton id={LIDAR_TILE_ID} testId="focus-lidar" />
        <McapSettingsSidebar topics={topics} />
      </TilingProvider>
    </SceneInventoryProvider>,
  );
  return { ...result, probeState };
}

describe("McapSettingsSidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetMcapModalSettingsForTests();
  });

  afterEach(() => cleanup());

  it("starts on scene settings without a panel tab", () => {
    renderSidebar();

    expect(screen.getByRole("tab", { name: "Scene" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Camera" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
    expect(screen.getByText("Advanced timing")).toBeTruthy();
  });

  it("shows the playback fidelity control without the count summary", () => {
    renderSidebar();

    expect(screen.queryByText("Images")).toBeNull();
    expect(screen.queryByText("3D")).toBeNull();
    expect(screen.getByLabelText("Between samples")).toBeTruthy();
    expect(screen.getByText("Advanced timing")).toBeTruthy();
  });

  it("persists fidelity mode changes through the select", () => {
    renderSidebar();

    const select = screen.getByLabelText(
      "Between samples",
    ) as HTMLSelectElement;
    expect(select.value).toBe("smooth");

    fireEvent.change(select, { target: { value: "as-recorded" } });

    expect(
      (screen.getByLabelText("Between samples") as HTMLSelectElement).value,
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

  it("lists non-renderable topics in scene settings", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /Other topics/ }));

    expect(screen.queryByLabelText("Search other topics")).toBeNull();
    expect(screen.queryByText("/lidar/top")).toBeNull();
    expect(screen.getByText("/imu")).toBeTruthy();
    expect(screen.getByText("sensor_msgs/Imu · ros1 · 8 msgs")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Inspect" })).toBeTruthy();
    expect(screen.getByText("Schema unavailable")).toBeTruthy();
    expect(screen.getByText("Encoding unsupported")).toBeTruthy();
  });

  it("opens decodable other topics in a Message panel", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /Other topics/ }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));

    const focusedTileId = probeState.current?.focusedTileId;
    expect(focusedTileId?.startsWith("raw-")).toBe(true);
    expect(probeState.current?.titles[focusedTileId ?? ""]).toBe("/imu");
    expect(probeState.current?.topicsByTile[focusedTileId ?? ""]).toBe("/imu");
  });

  it("searches long other topic lists", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /Other topics/ }));

    const search = screen.getByLabelText(
      "Search other topics",
    ) as HTMLInputElement;
    expect(search).toBeTruthy();
    expect(screen.queryByText("/camera/front")).toBeNull();

    fireEvent.change(search, { target: { value: "navsat" } });

    expect(screen.getByText("/gps")).toBeTruthy();
    expect(screen.queryByText("/alpha")).toBeNull();
    expect(screen.queryByText("/imu")).toBeNull();

    fireEvent.change(search, { target: { value: "nothing" } });

    expect(screen.getByText('No other topics match "nothing"')).toBeTruthy();
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
