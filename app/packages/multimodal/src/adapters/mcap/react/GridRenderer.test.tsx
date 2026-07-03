import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

const bitmapHostHarness = vi.hoisted(() => ({
  lastBitmap: null as ImageBitmap | null,
}));

interface SnapshotRequest {
  readonly job: {
    readonly cameraPose?: unknown;
    readonly height: number;
    readonly layers: ReadonlyArray<{ readonly frame: unknown }>;
    readonly signal?: AbortSignal;
    readonly width: number;
  };
  readonly resolve: (bitmap: ImageBitmap | null) => void;
}

const snapshotHarness = vi.hoisted(() => ({
  requests: [] as SnapshotRequest[],
}));

const cameraPoseHarness = vi.hoisted(() => ({
  pose: null as unknown,
  setPose: vi.fn(),
}));

vi.mock("./use-stable-mcap-source", () => ({
  useStableMcapSource: vi.fn(() => null),
}));

vi.mock("./use-mcap-grid-preview", () => ({
  useMcapGridPreview: vi.fn(() => previewHarness.preview),
}));

vi.mock("./mcap-grid-camera-state", () => ({
  useMcapGridCameraPose: vi.fn(() => [
    cameraPoseHarness.pose,
    cameraPoseHarness.setPose,
  ]),
}));

vi.mock("../../../visualization/panels/webgpu-snapshot-renderer", () => ({
  renderPointCloudSnapshot: vi.fn(
    (job: SnapshotRequest["job"]) =>
      new Promise<ImageBitmap | null>((resolve) => {
        snapshotHarness.requests.push({ job, resolve });
      }),
  ),
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
    BitmapCanvasHost: ({ bitmap }: { readonly bitmap: ImageBitmap | null }) => {
      bitmapHostHarness.lastBitmap = bitmap;
      return (
        <div
          data-committed={bitmap ? "true" : "false"}
          data-testid="bitmap-canvas-host"
        />
      );
    },
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
  bitmapHostHarness.lastBitmap = null;
  bitmapViewHarness.lastProps = null;
  cameraPoseHarness.pose = null;
  previewHarness.preview.frame = null;
  previewHarness.preview.hasPreviewTopics = false;
  previewHarness.preview.status = "idle";
  previewHarness.preview.streamTopic = null;
  snapshotHarness.requests.length = 0;
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

  it("renders point-cloud cells as a snapshot bitmap at rest with NO live panel", async () => {
    const frame = pointCloudFrame();
    previewHarness.preview.frame = frame;
    previewHarness.preview.status = "ready";
    previewHarness.preview.streamTopic = "/lidar/points";

    render(<GridRenderer ctx={rendererCtx()} />);

    // At rest: bitmap host mounted, zero WebGpuCanvas (the live panel —
    // and with it surface "grid-preview" — must not exist at rest).
    expect(screen.getByTestId("bitmap-canvas-host")).toBeTruthy();
    expect(screen.queryByTestId("point-cloud-panel")).toBeNull();

    // Exactly one snapshot request: auto-fit pose (shared pose unset) and
    // the cell's preview cloud.
    expect(snapshotHarness.requests.length).toBe(1);
    const request = snapshotHarness.requests[0];
    expect(request.job.cameraPose).toBeNull();
    expect(request.job.layers).toHaveLength(1);
    expect(request.job.layers[0].frame).toBe(
      (frame as { pointCloud: unknown }).pointCloud,
    );

    const bitmap = fakeSnapshotBitmap();
    request.resolve(bitmap);
    await waitFor(() => expect(bitmapHostHarness.lastBitmap).toBe(bitmap));
    expect(
      screen.getByTestId("bitmap-canvas-host").getAttribute("data-committed"),
    ).toBe("true");
  });

  it("mounts the live panel on hover and refreshes the snapshot on unhover", async () => {
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    render(<GridRenderer ctx={rendererCtx()} />);
    snapshotHarness.requests[0].resolve(fakeSnapshotBitmap());
    await waitFor(() => expect(bitmapHostHarness.lastBitmap).not.toBeNull());

    const cell = screen.getByTestId("bitmap-canvas-host")
      .parentElement as HTMLElement;
    // React synthesizes onPointerEnter/Leave from pointerover/pointerout.
    fireEvent.pointerOver(cell);

    // Hovered: live panel mounts unconditionally (no intent delay in this
    // phase) OVER the still-mounted snapshot host.
    expect(screen.getByTestId("point-cloud-panel")).toBeTruthy();
    expect(screen.getByTestId("bitmap-canvas-host")).toBeTruthy();
    // Hover itself does not request a snapshot.
    expect(snapshotHarness.requests.length).toBe(1);

    fireEvent.pointerOut(cell);

    // Back at rest: live panel gone, and a fresh snapshot was requested
    // at the current shared pose.
    expect(screen.queryByTestId("point-cloud-panel")).toBeNull();
    expect(snapshotHarness.requests.length).toBe(2);

    const fresh = fakeSnapshotBitmap();
    snapshotHarness.requests[1].resolve(fresh);
    await waitFor(() => expect(bitmapHostHarness.lastBitmap).toBe(fresh));
  });

  it("aborts a superseded snapshot request and never commits its bitmap", async () => {
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    const { rerender } = render(<GridRenderer ctx={rendererCtx()} />);
    expect(snapshotHarness.requests.length).toBe(1);
    const stale = snapshotHarness.requests[0];

    // A new preview frame arrives before the first snapshot settles.
    previewHarness.preview.frame = pointCloudFrame();
    rerender(<GridRenderer ctx={rendererCtx()} />);
    expect(snapshotHarness.requests.length).toBe(2);
    expect(stale.job.signal?.aborted).toBe(true);

    // If the superseded job still resolves a bitmap (abort raced the
    // render), the cell closes it instead of committing it.
    const staleBitmap = fakeSnapshotBitmap();
    stale.resolve(staleBitmap);
    await waitFor(() =>
      expect(
        (staleBitmap as unknown as { close: ReturnType<typeof vi.fn> }).close,
      ).toHaveBeenCalledTimes(1),
    );
    expect(bitmapHostHarness.lastBitmap).toBeNull();

    const current = fakeSnapshotBitmap();
    snapshotHarness.requests[1].resolve(current);
    await waitFor(() => expect(bitmapHostHarness.lastBitmap).toBe(current));
  });

  it("re-snapshots after the shared camera pose settles (debounced)", async () => {
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    const { rerender } = render(<GridRenderer ctx={rendererCtx()} />);
    snapshotHarness.requests[0].resolve(fakeSnapshotBitmap());
    await waitFor(() => expect(bitmapHostHarness.lastBitmap).not.toBeNull());

    // Another cell orbits: the shared pose atom updates.
    const pose = { position: [1, 2, 3], target: [0, 0, 0] };
    cameraPoseHarness.pose = pose;
    rerender(<GridRenderer ctx={rendererCtx()} />);

    // Debounced: no immediate request.
    expect(snapshotHarness.requests.length).toBe(1);
    await waitFor(() => expect(snapshotHarness.requests.length).toBe(2), {
      timeout: 2_000,
    });
    expect(snapshotHarness.requests[1].job.cameraPose).toBe(pose);

    snapshotHarness.requests[1].resolve(fakeSnapshotBitmap());
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

function pointCloudFrame(): McapGridPreviewFrame {
  return {
    kind: "point-cloud",
    pointCloud: {
      fields: [],
      kind: "point-cloud",
      pointCount: 1,
      positions: new Float32Array([0, 0, 0]),
    },
  } as unknown as McapGridPreviewFrame;
}

function fakeSnapshotBitmap(): ImageBitmap {
  return { close: vi.fn(), height: 4, width: 4 } as unknown as ImageBitmap;
}
