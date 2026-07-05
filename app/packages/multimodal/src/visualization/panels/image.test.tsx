import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EncodedImageVisualization } from "../../decoders";
import { VISUALIZATION_KIND } from "../visualization-registry";
import { ImagePanel } from "./image";
import {
  imageTextureCacheStats,
  resetImageTextureCacheForTests,
} from "./image-texture-cache";

vi.mock("./base-2d-scene", () => ({
  Base2DScene: ({ children }: { readonly children?: ReactNode }) => (
    <div data-cy="base-2d-scene">{children}</div>
  ),
  ImageTexturePlane: () => <div data-cy="image-texture-plane" />,
}));

vi.mock("./webgpu-canvas", () => ({
  WebGpuCanvas: ({ children }: { readonly children?: ReactNode }) => (
    <div data-cy="webgpu-canvas">{children}</div>
  ),
}));

beforeEach(() => {
  resetImageTextureCacheForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ImagePanel", () => {
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
