import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WEBGPU_DEVICE_BUDGET,
  registerWebGpuRenderer,
  resetWebGpuDeviceRegistryForTests,
} from "../../../visualization/panels/gpu/webgpu-device-registry";
import {
  acquireGridLiveLease,
  gridLiveLeaseStats,
  resetGridLiveLeasesForTests,
} from "../../../visualization/panels/gpu/webgpu-live-lease";
import type { McapGridPreviewFrame } from "../grid-preview";
import {
  GridRenderer,
  HOVER_INTENT_DELAY_MS,
  PLAYBACK_HOVER_INTENT_DELAY_MS,
} from "./GridRenderer";
import classes from "./GridRenderer.module.css";
import { useMcapGridPreview } from "./use-mcap-grid-preview";

const previewHarness = vi.hoisted(() => ({
  preview: {
    error: null as string | null,
    frame: null as McapGridPreviewFrame | null,
    hasPreviewTopics: false,
    isBuffering: false,
    pause: vi.fn(),
    play: vi.fn(),
    streamTopic: null as string | null,
    streamTopics: [] as readonly string[],
    status: "idle",
  },
}));

const bitmapViewHarness = vi.hoisted(() => ({
  lastProps: null as {
    fit?: string;
    frame: Extract<McapGridPreviewFrame, { kind: "image" }>["image"];
    onBitmapRetainedBytesChange?: (retainedBytes: number) => void;
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

function getGridRendererRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>(`.${classes.root}`);
  if (!root) {
    throw new Error("Expected an MCAP grid renderer root");
  }

  return root;
}

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

vi.mock("../../../visualization/panels/gpu/webgpu-snapshot-renderer", () => ({
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
    BitmapImageFrameView: (props: {
      readonly fit?: string;
      readonly frame: Extract<McapGridPreviewFrame, { kind: "image" }>["image"];
      readonly onBitmapRetainedBytesChange?: (retainedBytes: number) => void;
    }) => {
      bitmapViewHarness.lastProps = props;
      const { onBitmapRetainedBytesChange } = props;
      // This effect reports decoded bitmap retention like the real view does.
      useEffect(() => {
        onBitmapRetainedBytesChange?.(640 * 480 * 4);
      }, [onBitmapRetainedBytesChange]);
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
  vi.useRealTimers();
  resetGridLiveLeasesForTests();
  resetWebGpuDeviceRegistryForTests();
  bitmapHostHarness.lastBitmap = null;
  bitmapViewHarness.lastProps = null;
  cameraPoseHarness.pose = null;
  previewHarness.preview.error = null;
  previewHarness.preview.frame = null;
  previewHarness.preview.hasPreviewTopics = false;
  previewHarness.preview.isBuffering = false;
  previewHarness.preview.status = "idle";
  previewHarness.preview.streamTopic = null;
  previewHarness.preview.pause.mockClear();
  previewHarness.preview.play.mockClear();
  snapshotHarness.requests.length = 0;
});

describe("GridRenderer", () => {
  it("explains when the recording cannot be found", () => {
    previewHarness.preview.error =
      "Recording not found (HTTP 404). Check that the file still exists at its configured path and is accessible to FiftyOne.";
    previewHarness.preview.status = "error";

    render(<GridRenderer ctx={rendererCtx()} />);

    expect(screen.getByText("Preview unavailable")).toBeTruthy();
    expect(screen.getByText(previewHarness.preview.error)).toBeTruthy();
  });

  it("shows idle as an empty no-source state without loading animation", () => {
    previewHarness.preview.status = "idle";
    previewHarness.preview.hasPreviewTopics = false;

    render(<GridRenderer ctx={rendererCtx()} />);

    expect(screen.getByText("No preview streams")).toBeTruthy();
    expect(screen.queryByTestId("mcap-loading-ascii")).toBeNull();
  });

  it("renders image frames through the GPU-free bitmap view", () => {
    const bytes = new Uint8Array([9, 9, 9]);
    previewHarness.preview.frame = imageFrame(bytes);
    previewHarness.preview.status = "ready";
    previewHarness.preview.streamTopic = "/cam/image";

    render(<GridRenderer ctx={rendererCtx()} />);

    expect(screen.getByTestId("bitmap-image-view")).toBeTruthy();
    // Image cells must mount ZERO WebGpuCanvas — the WebGPU ImagePanel
    // stays modal-only.
    expect(screen.queryByTestId("image-panel")).toBeNull();

    expect(bitmapViewHarness.lastProps?.frame.kind).toBe("encoded-image");
    if (bitmapViewHarness.lastProps?.frame.kind !== "encoded-image") {
      throw new Error("Expected encoded image preview");
    }
    expect(bitmapViewHarness.lastProps.frame.bytes).toBe(bytes);
    expect(bitmapViewHarness.lastProps?.fit).toBe("cover");
    expect(bitmapViewHarness.lastProps.frame.mimeType).toBe("image/jpeg");
  });

  it("shows a tiny buffering indicator over the last rendered frame", () => {
    previewHarness.preview.frame = imageFrame(new Uint8Array([1]));
    previewHarness.preview.isBuffering = true;
    previewHarness.preview.status = "ready";

    render(<GridRenderer ctx={rendererCtx()} />);

    expect(screen.getByTestId("bitmap-image-view")).toBeTruthy();
    expect(screen.getByTestId("mcap-grid-buffering-indicator")).toBeTruthy();
  });

  it("reports retained frame and decoded bitmap bytes to the grid LRU", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const onRetainedBytesChange = vi.fn();
    previewHarness.preview.frame = imageFrame(bytes);
    previewHarness.preview.status = "ready";

    render(
      <GridRenderer
        ctx={rendererCtx()}
        onRetainedBytesChange={onRetainedBytesChange}
      />,
    );

    await waitFor(() => {
      expect(onRetainedBytesChange).toHaveBeenLastCalledWith(
        bytes.byteLength + 640 * 480 * 4,
      );
    });
  });

  it("allows ready image tile activation to pass through", () => {
    previewHarness.preview.frame = imageFrame(new Uint8Array([1]));
    previewHarness.preview.status = "ready";
    const onClick = vi.fn();
    const onContextMenu = vi.fn();

    const { container } = render(
      <div onClick={onClick} onContextMenu={onContextMenu}>
        <GridRenderer ctx={rendererCtx()} />
      </div>,
    );

    const image = screen.getByTestId("bitmap-image-view");
    const root = getGridRendererRoot(container);
    expect(root.classList.contains(classes.modalActivationSurface)).toBe(true);
    fireEvent.click(image);
    fireEvent.contextMenu(image);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("keeps point-cloud tile activation inside the renderer", () => {
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";
    const onClick = vi.fn();
    const onContextMenu = vi.fn();
    const { container } = render(
      <div onClick={onClick} onContextMenu={onContextMenu}>
        <GridRenderer ctx={rendererCtx()} />
      </div>,
    );

    const pointCloud = screen.getByTestId("bitmap-canvas-host");
    fireEvent.click(pointCloud);
    fireEvent.contextMenu(pointCloud);

    expect(onClick).not.toHaveBeenCalled();
    expect(onContextMenu).not.toHaveBeenCalled();
    const root = getGridRendererRoot(container);
    expect(root.classList.contains(classes.modalActivationSurface)).toBe(false);
  });

  it.each(["idle", "loading", "ready", "unavailable", "error"] as const)(
    "allows frame-less %s tile activation to pass through",
    (status) => {
      previewHarness.preview.frame = null;
      previewHarness.preview.status = status;
      const onClick = vi.fn();
      const onContextMenu = vi.fn();
      const { container } = render(
        <div onClick={onClick} onContextMenu={onContextMenu}>
          <GridRenderer ctx={rendererCtx()} />
        </div>,
      );

      const root = getGridRendererRoot(container);
      expect(root.classList.contains(classes.modalActivationSurface)).toBe(
        true,
      );
      fireEvent.click(root);
      fireEvent.contextMenu(root);

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onContextMenu).toHaveBeenCalledTimes(1);
    },
  );

  it("requires hover intent before starting playback", () => {
    vi.useFakeTimers();
    previewHarness.preview.frame = imageFrame(new Uint8Array([1]));
    previewHarness.preview.status = "ready";

    render(<GridRenderer ctx={rendererCtx()} />);
    const root = screen.getByTestId("bitmap-image-view").parentElement;
    if (!root) {
      throw new Error("Expected bitmap view to have a grid root");
    }

    fireEvent.pointerOver(root);
    expect(vi.mocked(useMcapGridPreview)).toHaveBeenLastCalledWith(
      expect.objectContaining({ hovered: true }),
    );
    act(() => {
      vi.advanceTimersByTime(PLAYBACK_HOVER_INTENT_DELAY_MS - 1);
    });
    expect(previewHarness.preview.play).not.toHaveBeenCalled();

    fireEvent.pointerOut(root);
    expect(vi.mocked(useMcapGridPreview)).toHaveBeenLastCalledWith(
      expect.objectContaining({ hovered: false }),
    );
    act(() => {
      vi.advanceTimersByTime(PLAYBACK_HOVER_INTENT_DELAY_MS);
    });
    expect(previewHarness.preview.play).not.toHaveBeenCalled();

    fireEvent.pointerOver(root);
    act(() => {
      vi.advanceTimersByTime(PLAYBACK_HOVER_INTENT_DELAY_MS);
    });
    expect(previewHarness.preview.play).toHaveBeenCalledTimes(1);
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

  it("never goes live when the hover ends before the intent delay", () => {
    vi.useFakeTimers();
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    render(<GridRenderer ctx={rendererCtx()} />);
    const cell = pointCloudCells()[0];

    // A scroll-past: enter, dwell for less than the intent delay, leave.
    fireEvent.pointerOver(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_DELAY_MS - 1);
    });
    expect(screen.queryByTestId("point-cloud-panel")).toBeNull();
    fireEvent.pointerOut(cell);

    // Even long after, the cancelled intent never fires: no live panel,
    // no lease traffic, and no extra snapshot request (the snapshot was
    // never invalidated).
    act(() => {
      vi.advanceTimersByTime(10 * HOVER_INTENT_DELAY_MS);
    });
    expect(screen.queryByTestId("point-cloud-panel")).toBeNull();
    expect(gridLiveLeaseStats()).toMatchObject({ active: 0, granted: 0 });
    expect(snapshotHarness.requests.length).toBe(1);
  });

  it("mounts the live panel after the intent delay and releases on unhover", async () => {
    vi.useFakeTimers();
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    render(<GridRenderer ctx={rendererCtx()} />);
    const bitmap = fakeSnapshotBitmap();
    await act(async () => {
      snapshotHarness.requests[0].resolve(bitmap);
    });
    expect(bitmapHostHarness.lastBitmap).toBe(bitmap);

    const cell = pointCloudCells()[0];
    expect(cell.classList.contains(classes.pointCloud)).toBe(true);
    expect(cell.classList.contains(classes.livePointCloud)).toBe(false);
    // React synthesizes onPointerEnter/Leave from pointerover/pointerout.
    fireEvent.pointerOver(cell);
    // Before the intent delay fires the cell stays snapshot-only.
    expect(screen.queryByTestId("point-cloud-panel")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_DELAY_MS);
    });

    // Intent held: lease granted, live panel mounted OVER the
    // still-mounted snapshot host.
    expect(screen.getByTestId("point-cloud-panel")).toBeTruthy();
    expect(screen.getByTestId("bitmap-canvas-host")).toBeTruthy();
    expect(cell.classList.contains(classes.livePointCloud)).toBe(true);
    expect(gridLiveLeaseStats()).toMatchObject({ active: 1, granted: 1 });
    // Going live does not request a snapshot.
    expect(snapshotHarness.requests.length).toBe(1);

    fireEvent.pointerOut(cell);

    // Back at rest: live panel gone, lease released, and a fresh snapshot
    // was requested at the current shared pose.
    expect(screen.queryByTestId("point-cloud-panel")).toBeNull();
    expect(cell.classList.contains(classes.livePointCloud)).toBe(false);
    expect(gridLiveLeaseStats().active).toBe(0);
    expect(snapshotHarness.requests.length).toBe(2);

    const fresh = fakeSnapshotBitmap();
    await act(async () => {
      snapshotHarness.requests[1].resolve(fresh);
    });
    expect(bitmapHostHarness.lastBitmap).toBe(fresh);
  });

  it("falls back to the snapshot when its lease is stolen", () => {
    vi.useFakeTimers();
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    render(<GridRenderer ctx={rendererCtx()} />);
    const cell = pointCloudCells()[0];
    fireEvent.pointerOver(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_DELAY_MS);
    });
    expect(screen.getByTestId("point-cloud-panel")).toBeTruthy();
    expect(snapshotHarness.requests.length).toBe(1);

    // Drive the pool directly: two more holders fill the cap and then
    // steal the cell's lease (it is the oldest holder).
    act(() => {
      acquireGridLiveLease("test-holder-1", vi.fn());
    });
    expect(screen.getByTestId("point-cloud-panel")).toBeTruthy();
    act(() => {
      acquireGridLiveLease("test-holder-2", vi.fn());
    });

    // Revoked: live panel unmounted immediately, snapshot host still
    // there, and a fresh snapshot requested at the current shared pose.
    expect(screen.queryByTestId("point-cloud-panel")).toBeNull();
    expect(screen.getByTestId("bitmap-canvas-host")).toBeTruthy();
    expect(snapshotHarness.requests.length).toBe(2);
    expect(gridLiveLeaseStats()).toMatchObject({ active: 2, revoked: 1 });
  });

  it("does not snapshot changing frames underneath the live panel", () => {
    vi.useFakeTimers();
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    const { rerender } = render(<GridRenderer ctx={rendererCtx()} />);
    fireEvent.pointerOver(pointCloudCells()[0]);
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_DELAY_MS);
    });
    expect(screen.getByTestId("point-cloud-panel")).toBeTruthy();
    expect(snapshotHarness.requests.length).toBe(1);

    previewHarness.preview.frame = pointCloudFrame();
    rerender(<GridRenderer ctx={rendererCtx()} />);
    expect(snapshotHarness.requests.length).toBe(1);

    fireEvent.pointerOut(pointCloudCells()[0]);
    expect(snapshotHarness.requests.length).toBe(2);
    expect(snapshotHarness.requests[1].job.layers[0].frame).toBe(
      (previewHarness.preview.frame as { pointCloud: unknown }).pointCloud,
    );
  });

  it("does no snapshot work while the grid is inactive", () => {
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    const { rerender } = render(
      <GridRenderer ctx={rendererCtx()} isGridActive={false} />,
    );
    expect(snapshotHarness.requests).toHaveLength(0);

    rerender(<GridRenderer ctx={rendererCtx()} isGridActive />);
    expect(snapshotHarness.requests).toHaveLength(1);
  });

  it("stays on the snapshot when the device budget denies going live", () => {
    vi.useFakeTimers();
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    // The page is already at the device budget before the hover (say, a
    // heavy modal layout owns every slot).
    for (let i = 0; i < WEBGPU_DEVICE_BUDGET; i += 1) {
      registerWebGpuRenderer("modal-3d");
    }

    render(<GridRenderer ctx={rendererCtx()} />);
    const cell = pointCloudCells()[0];
    fireEvent.pointerOver(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_DELAY_MS);
    });

    // Intent fired but the lease was denied: no live panel, the snapshot
    // host stays up, and nothing was granted or stolen.
    expect(screen.queryByTestId("point-cloud-panel")).toBeNull();
    expect(screen.getByTestId("bitmap-canvas-host")).toBeTruthy();
    expect(gridLiveLeaseStats()).toMatchObject({
      active: 0,
      denied: 1,
      granted: 0,
      revoked: 0,
    });
    // Denial does not re-request the snapshot — the existing one stands.
    expect(snapshotHarness.requests.length).toBe(1);
  });

  it("releases its lease when the cell unmounts", () => {
    vi.useFakeTimers();
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    const { unmount } = render(<GridRenderer ctx={rendererCtx()} />);
    fireEvent.pointerOver(pointCloudCells()[0]);
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_DELAY_MS);
    });
    expect(gridLiveLeaseStats().active).toBe(1);

    // Cell scrolled away: the lease effect's cleanup releases the slot.
    unmount();
    expect(gridLiveLeaseStats().active).toBe(0);
  });

  it("holds exactly one lease per cell under StrictMode", async () => {
    const { StrictMode } = await import("react");
    vi.useFakeTimers();
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    // StrictMode double-mounts the cell and double-invokes its effects;
    // the per-mount holderId plus cleanup-release keeps the pool at one
    // slot and one live panel.
    render(
      <StrictMode>
        <GridRenderer ctx={rendererCtx()} />
      </StrictMode>,
    );
    fireEvent.pointerOver(pointCloudCells()[0]);
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_DELAY_MS);
    });

    expect(screen.getAllByTestId("point-cloud-panel")).toHaveLength(1);
    expect(gridLiveLeaseStats().active).toBe(1);
  });

  it("keeps at most two cells live across a three-cell hover sweep", () => {
    vi.useFakeTimers();
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    render(
      <>
        <GridRenderer ctx={rendererCtx()} />
        <GridRenderer ctx={rendererCtx()} />
        <GridRenderer ctx={rendererCtx()} />
      </>,
    );
    const cells = pointCloudCells();
    expect(cells).toHaveLength(3);
    expect(snapshotHarness.requests.length).toBe(3);

    // Hover each cell past the intent delay WITHOUT unhovering the
    // previous ones — the worst case the cap exists for.
    for (const cell of cells) {
      fireEvent.pointerOver(cell);
      act(() => {
        vi.advanceTimersByTime(HOVER_INTENT_DELAY_MS);
      });
      expect(
        screen.getAllByTestId("point-cloud-panel").length,
      ).toBeLessThanOrEqual(2);
    }

    // The invariant this phase exists for: cap-2 live panels, the oldest
    // cell stolen back to a (freshly re-requested) snapshot.
    expect(screen.getAllByTestId("point-cloud-panel")).toHaveLength(2);
    expect(gridLiveLeaseStats()).toMatchObject({
      active: 2,
      granted: 3,
      revoked: 1,
    });
    expect(snapshotHarness.requests.length).toBe(4);
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

  it("snapshots once on reactivation after the shared pose drifted", () => {
    vi.useFakeTimers();
    previewHarness.preview.frame = pointCloudFrame();
    previewHarness.preview.status = "ready";

    const { rerender } = render(<GridRenderer ctx={rendererCtx()} />);
    expect(snapshotHarness.requests.length).toBe(1);

    // The cell deactivates, then another cell orbits the shared pose
    // while this one is dormant.
    rerender(<GridRenderer ctx={rendererCtx()} isGridActive={false} />);
    const pose = { position: [1, 2, 3], target: [0, 0, 0] };
    cameraPoseHarness.pose = pose;

    // Reactivation snapshots immediately at the freshly-read pose...
    rerender(<GridRenderer ctx={rendererCtx()} isGridActive />);
    expect(snapshotHarness.requests.length).toBe(2);
    expect(snapshotHarness.requests[1].job.cameraPose).toBe(pose);

    // ...and the pose-diff debounce adds no duplicate at the same pose.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(snapshotHarness.requests.length).toBe(2);
  });
});

function rendererCtx() {
  return {
    dataset: { name: "dataset" },
    sample: { sample: { id: "1" } },
  } as never;
}

/**
 * The point-cloud cell roots (the elements carrying the hover-intent
 * pointer handlers): each one is the parent of its snapshot bitmap host.
 */
function pointCloudCells(): HTMLElement[] {
  return screen
    .getAllByTestId("bitmap-canvas-host")
    .map((host) => host.parentElement as HTMLElement);
}

function imageFrame(bytes: Uint8Array): McapGridPreviewFrame {
  return {
    image: { bytes, kind: "encoded-image", mimeType: "image/jpeg" },
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
