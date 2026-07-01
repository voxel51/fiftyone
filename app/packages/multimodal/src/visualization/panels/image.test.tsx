import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EncodedImageVisualization } from "../../decoders";
import { VISUALIZATION_KIND } from "../visualization-registry";
import { ImagePanel } from "./image";

vi.mock("./base-2d-scene", () => ({
  Base2DScene: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid="base-2d-scene">{children}</div>
  ),
  ImageTexturePlane: () => <div data-testid="image-texture-plane" />,
}));

vi.mock("./webgpu-canvas", () => ({
  WebGpuCanvas: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid="webgpu-canvas">{children}</div>
  ),
}));

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

    fireEvent.click(await screen.findByLabelText("Recenter image view"));

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

    fireEvent.pointerDown(await screen.findByLabelText("Recenter image view"));

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
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({
      close: vi.fn(),
      height: 12,
      width: 16,
    })),
  );
}
