import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  EncodedImageVisualization,
  EncodedVideoVisualization,
  RawImageVisualization,
} from "../../ir";
import { VISUALIZATION_KIND } from "../visualization-registry";
import { ImagePanel } from "./ImagePanel";
import {
  imageTextureCacheStats,
  resetImageTextureCacheForTests,
} from "./image-texture-cache";
import { resetVideoTextureDecodersForTests } from "./video-texture";

const sharedStageMock = vi.hoisted(() => ({
  current: null as null | {
    error: string | null;
    invalidate: () => void;
    ready: boolean;
  },
}));

vi.mock("@react-three/drei", () => ({
  OrthographicCamera: () => <div data-testid="orthographic-camera" />,
}));

vi.mock("./base-2d-scene", () => ({
  Base2DScene: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid="base-2d-scene">{children}</div>
  ),
  ImageTexturePlane: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid="image-texture-plane">{children}</div>
  ),
}));

vi.mock("../webgpu/webgpu-canvas", () => ({
  WebGpuCanvas: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid="webgpu-canvas">{children}</div>
  ),
}));

vi.mock("../webgpu/webgpu-view-stage", () => ({
  useWebGpuViewStage: () => sharedStageMock.current,
  WebGpuView: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid="webgpu-view">{children}</div>
  ),
}));

beforeEach(() => {
  sharedStageMock.current = null;
  resetImageTextureCacheForTests();
  resetVideoTextureDecodersForTests();
});

afterEach(() => {
  cleanup();
  resetVideoTextureDecodersForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ImagePanel", () => {
  it("uses the shared WebGPU view when a healthy stage is available", () => {
    sharedStageMock.current = {
      error: null,
      invalidate: vi.fn(),
      ready: true,
    };

    render(<ImagePanel frame={loadedFrame()} />);

    expect(screen.getByTestId("webgpu-view")).toBeTruthy();
    expect(screen.queryByTestId("webgpu-canvas")).toBeNull();
  });

  it("falls back to a local WebGPU canvas after a shared-stage error", () => {
    sharedStageMock.current = {
      error: "shared device failed",
      invalidate: vi.fn(),
      ready: false,
    };

    render(<ImagePanel frame={loadedFrame()} />);

    expect(screen.getByTestId("webgpu-canvas")).toBeTruthy();
    expect(screen.queryByTestId("webgpu-view")).toBeNull();
  });

  it("renders image-aligned scene content inside the texture transform", async () => {
    mockImageBitmap();

    render(
      <ImagePanel
        frame={loadedFrame()}
        sceneChildren={<div data-testid="image-scene-layer" />}
      />,
    );

    expect(await screen.findByTestId("image-scene-layer")).toBeTruthy();
    expect(
      screen
        .getByTestId("image-texture-plane")
        .contains(screen.getByTestId("image-scene-layer")),
    ).toBe(true);
  });

  it("renders a recenter control when a reset handler is provided", async () => {
    const onResetView = vi.fn();
    mockImageBitmap();

    render(<ImagePanel frame={loadedFrame()} onResetView={onResetView} />);

    fireEvent.click(await screen.findByLabelText("Recenter view"));

    expect(onResetView).toHaveBeenCalledTimes(1);
  });

  it("does not start parent panning from the recenter control", async () => {
    const onPointerDown = vi.fn();
    mockImageBitmap();

    render(
      <div onPointerDown={onPointerDown}>
        <ImagePanel frame={loadedFrame()} onResetView={vi.fn()} />
      </div>,
    );

    fireEvent.pointerDown(await screen.findByLabelText("Recenter view"));

    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it("shares one decode between panels rendering the same texture key", async () => {
    const createBitmap = mockImageBitmap();

    // Distinct frame objects (fresh bytes identities) but the same message
    // key — the batch re-delivery shape the shared cache collapses.
    render(
      <>
        <ImagePanel frame={loadedFrame()} textureKey="rec|/cam/image|100" />
        <ImagePanel frame={loadedFrame()} textureKey="rec|/cam/image|100" />
      </>,
    );

    await waitFor(() =>
      expect(screen.queryAllByText("Loading image")).toHaveLength(0),
    );

    expect(createBitmap).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats().decodeCount).toBe(1);
  });

  it("decodes privately per panel when no texture key is provided", async () => {
    const createBitmap = mockImageBitmap();

    render(
      <>
        <ImagePanel frame={loadedFrame()} />
        <ImagePanel frame={loadedFrame()} />
      </>,
    );

    await waitFor(() =>
      expect(screen.queryAllByText("Loading image")).toHaveLength(0),
    );

    expect(createBitmap).toHaveBeenCalledTimes(2);
  });

  it("renders raw RGBA frames through the shared image panel", async () => {
    const onImageLoaded = vi.fn();

    render(<ImagePanel frame={rawFrame()} onImageLoaded={onImageLoaded} />);

    await waitFor(() => expect(onImageLoaded).toHaveBeenCalledWith(2, 1));
    expect(screen.queryByText("Loading image")).toBeNull();
    expect(screen.getByTestId("image-texture-plane")).toBeTruthy();
  });

  it("shares one raw texture decode between panels rendering the same texture key", async () => {
    render(
      <>
        <ImagePanel frame={rawFrame()} textureKey="rec|/cam/raw|100" />
        <ImagePanel frame={rawFrame()} textureKey="rec|/cam/raw|100" />
      </>,
    );

    await waitFor(() =>
      expect(screen.queryAllByText("Loading image")).toHaveLength(0),
    );

    expect(imageTextureCacheStats().decodeCount).toBe(1);
  });

  it("surfaces video keyframe wait states from the shared image panel", async () => {
    render(<ImagePanel frame={deltaVideoFrame()} />);

    const noticeToggle = await screen.findByLabelText("1 image notice");
    expect(screen.queryByText("Waiting for H.264 keyframe")).toBeNull();

    fireEvent.click(noticeToggle);
    expect(screen.getByText("Waiting for H.264 keyframe")).toBeTruthy();
  });

  it("does not start parent panning from image notices", async () => {
    const onPointerDown = vi.fn();
    render(
      <div onPointerDown={onPointerDown}>
        <ImagePanel frame={deltaVideoFrame()} />
      </div>,
    );

    fireEvent.pointerDown(await screen.findByLabelText("1 image notice"));
    expect(onPointerDown).not.toHaveBeenCalled();
  });
});

function loadedFrame(): EncodedImageVisualization {
  return {
    bytes: new Uint8Array([1]),
    kind: VISUALIZATION_KIND.ENCODED_IMAGE,
  };
}

function mockImageBitmap() {
  const createBitmap = vi.fn(async () => ({
    close: vi.fn(),
    height: 12,
    width: 16,
  }));
  vi.stubGlobal("createImageBitmap", createBitmap);
  return createBitmap;
}

function rawFrame(): RawImageVisualization {
  return {
    height: 1,
    kind: VISUALIZATION_KIND.RAW_IMAGE,
    rgba: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
    sourceEncoding: "rgb8",
    width: 2,
  };
}

function deltaVideoFrame(): EncodedVideoVisualization {
  return {
    bytes: Uint8Array.of(0, 0, 1, 0x41, 0xc0),
    codec: "h264",
    format: "h264",
    h264: { hasFrame: true },
    keyframe: false,
    kind: VISUALIZATION_KIND.ENCODED_VIDEO,
    timestampNs: 1000n,
  };
}
