import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  TileIdScope,
  TileSettingsContent,
  TilingProvider,
  useTiling,
  type TilingTile,
} from "@fiftyone/tiling";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SceneInventoryProvider,
  type SceneSource,
} from "../../../scene-inventory";
import type { StreamInventory } from "../../../schemas/v1";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
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

function renderSidebar({
  topics = [],
}: {
  readonly topics?: readonly StreamInventory[];
} = {}) {
  return render(
    <SceneInventoryProvider sources={SOURCES}>
      <TilingProvider initialTiles={INITIAL_TILES}>
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

    expect(screen.queryByText("/lidar/top")).toBeNull();
    expect(screen.getByText("/imu")).toBeTruthy();
    expect(screen.getByText("sensor_msgs/Imu · ros1 · 8 msgs")).toBeTruthy();
    expect(screen.getByText("Inspectable in Message")).toBeTruthy();
    expect(screen.getByText("Schema unavailable")).toBeTruthy();
    expect(screen.getByText("Encoding unsupported")).toBeTruthy();
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
