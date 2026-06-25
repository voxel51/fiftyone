import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridRenderer } from "./GridRenderer";

const previewHarness = vi.hoisted(() => ({
  preview: {
    error: null,
    frame: null,
    hasPreviewTopics: false,
    pause: vi.fn(),
    play: vi.fn(),
    streamTopic: null,
    streamTopics: [],
    status: "idle",
  },
}));

vi.mock("./use-stable-mcap-source", () => ({
  useStableMcapSource: vi.fn(() => null),
}));

vi.mock("./use-mcap-grid-preview", () => ({
  useMcapGridPreview: vi.fn(() => previewHarness.preview),
}));

vi.mock("./mcap-grid-camera-state", () => ({
  useMcapGridCameraPose: vi.fn(() => [null, vi.fn()]),
}));

vi.mock("./mcap-grid-stream-state", () => ({
  MCAP_GRID_STREAM_AUTO: "__auto__",
  useMcapGridSelectedStreamTopic: vi.fn(() => ["__auto__", vi.fn()]),
  useRegisterMcapGridStreamTopics: vi.fn(() => vi.fn()),
}));

vi.mock("../../../visualization/panels/ImageAnnotationsOverlay", () => ({
  ImageAnnotationsOverlay: () => <div data-testid="annotations-overlay" />,
}));

vi.mock("../../../visualization/panels/image", () => ({
  ImagePanel: () => <div data-testid="image-panel" />,
}));

vi.mock("../../../visualization/panels/point-cloud", () => ({
  PointCloudPanel: () => <div data-testid="point-cloud-panel" />,
}));

afterEach(() => {
  cleanup();
});

describe("GridRenderer", () => {
  it("shows idle as an empty no-source state without loading animation", () => {
    previewHarness.preview.status = "idle";
    previewHarness.preview.hasPreviewTopics = false;

    render(
      <GridRenderer
        ctx={
          {
            dataset: { name: "dataset" },
            sample: { sample: { id: "1" } },
          } as never
        }
      />,
    );

    expect(screen.getByText("No preview streams")).toBeTruthy();
    expect(screen.queryByTestId("mcap-loading-ascii")).toBeNull();
  });
});
