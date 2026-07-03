import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McapGridPreviewFrame } from "../grid-preview";
import { GridRenderer } from "./GridRenderer";

const previewHarness = vi.hoisted(() => ({
  preview: {
    error: null as string | null,
    frame: null as McapGridPreviewFrame | null,
    hasPreviewTopics: false,
    pause: vi.fn(),
    play: vi.fn(),
    streamTopic: null as string | null,
    streamTopics: [] as readonly string[],
    status: "idle",
  },
}));

const bitmapViewHarness = vi.hoisted(() => ({
  lastProps: null as {
    bytes: Uint8Array;
    fit?: string;
    mimeType?: string;
    onImageLoaded?: (width: number, height: number) => void;
  } | null,
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
  ImageAnnotationsOverlay: ({
    imageHeight,
    imageWidth,
  }: {
    readonly imageHeight: number;
    readonly imageWidth: number;
  }) => (
    <div
      data-image-height={imageHeight}
      data-image-width={imageWidth}
      data-testid="annotations-overlay"
    />
  ),
}));

vi.mock("../../../visualization/panels/bitmap-image-view", async () => {
  const { useEffect } = await import("react");
  return {
    BitmapImageView: (props: {
      readonly bytes: Uint8Array;
      readonly fit?: string;
      readonly mimeType?: string;
      readonly onImageLoaded?: (width: number, height: number) => void;
    }) => {
      bitmapViewHarness.lastProps = props;
      const { onImageLoaded } = props;
      // This effect reports decoded natural dims like the real view does.
      useEffect(() => {
        onImageLoaded?.(640, 480);
      }, [onImageLoaded]);
      return <div data-testid="bitmap-image-view" />;
    },
  };
});

// Regression tripwire: GridRenderer no longer imports the WebGPU-backed
// ImagePanel for image cells; if it ever comes back, the testid reappears
// and the image-frame test below fails.
vi.mock("../../../visualization/panels/image", () => ({
  ImagePanel: () => <div data-testid="image-panel" />,
}));

vi.mock("../../../visualization/panels/point-cloud", () => ({
  PointCloudPanel: () => <div data-testid="point-cloud-panel" />,
}));

afterEach(() => {
  cleanup();
  bitmapViewHarness.lastProps = null;
  previewHarness.preview.frame = null;
  previewHarness.preview.hasPreviewTopics = false;
  previewHarness.preview.status = "idle";
  previewHarness.preview.streamTopic = null;
});

describe("GridRenderer", () => {
  it("shows idle as an empty no-source state without loading animation", () => {
    previewHarness.preview.status = "idle";
    previewHarness.preview.hasPreviewTopics = false;

    render(<GridRenderer ctx={rendererCtx()} />);

    expect(screen.getByText("No preview streams")).toBeTruthy();
    expect(screen.queryByTestId("mcap-loading-ascii")).toBeNull();
  });

  it("renders image frames through the GPU-free bitmap view", async () => {
    const bytes = new Uint8Array([9, 9, 9]);
    previewHarness.preview.frame = imageFrame(bytes);
    previewHarness.preview.status = "ready";
    previewHarness.preview.streamTopic = "/cam/image";

    render(<GridRenderer ctx={rendererCtx()} />);

    expect(screen.getByTestId("bitmap-image-view")).toBeTruthy();
    // Image cells must mount ZERO WebGpuCanvas — the WebGPU ImagePanel
    // stays modal-only.
    expect(screen.queryByTestId("image-panel")).toBeNull();

    expect(bitmapViewHarness.lastProps?.bytes).toBe(bytes);
    expect(bitmapViewHarness.lastProps?.fit).toBe("cover");
    expect(bitmapViewHarness.lastProps?.mimeType).toBe("image/jpeg");

    // The DOM annotations overlay still receives the decoded dims the
    // bitmap view reports via onImageLoaded.
    const overlay = await screen.findByTestId("annotations-overlay");
    expect(overlay.getAttribute("data-image-width")).toBe("640");
    expect(overlay.getAttribute("data-image-height")).toBe("480");
  });
});

function rendererCtx() {
  return {
    dataset: { name: "dataset" },
    sample: { sample: { id: "1" } },
  } as never;
}

function imageFrame(bytes: Uint8Array): McapGridPreviewFrame {
  return {
    annotations: {},
    image: { bytes, mimeType: "image/jpeg" },
    kind: "image",
  } as unknown as McapGridPreviewFrame;
}
