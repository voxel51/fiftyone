import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import type { McapResourceClient } from "../types";
import { McapSourcePlayback } from "./McapSourcePlayback";

const playbackHarness = vi.hoisted(() => ({
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
  useMcapSceneInventory: vi.fn(() => ({
    error: null,
    sources: [],
    status: "ready",
    topics: [],
    topicCount: 3,
  })),
}));

vi.mock("../../../components/MultiModalPlayback/MultiModalPlayback", () => ({
  default: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid="playback-shell">{children}</div>
  ),
}));

vi.mock("./McapAddTileMenu", () => ({ default: () => null }));
vi.mock("./McapInspectorSidebar", () => ({ default: () => null }));
vi.mock("./McapSettingsSidebar", () => ({ default: () => null }));
vi.mock("./McapStreams", () => ({ McapStreams: () => null }));
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
});
