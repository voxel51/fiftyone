/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Image2dView } from "./Image2dView";

const { orbitControlsPropsRef, threeState, useFrameCallbacks } = vi.hoisted(
  () => ({
    orbitControlsPropsRef: {
      current: null as Record<string, unknown> | null,
    },
    threeState: {
      camera: { zoom: 100 },
      invalidate: vi.fn(),
      size: { width: 640, height: 480 },
      viewport: { width: 12, height: 9 },
    },
    useFrameCallbacks: [] as Array<() => void>,
  })
);

const useLoaderMock = vi.fn(() => ({
  image: { width: 640, height: 480 },
  colorSpace: "",
  generateMipmaps: false,
  minFilter: 0,
  magFilter: 0,
  needsUpdate: false,
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: (props: Record<string, unknown>) => {
    orbitControlsPropsRef.current = props;
    return null;
  },
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: () => void) => {
    useFrameCallbacks.push(callback);
  },
  useLoader: (...args: unknown[]) => useLoaderMock(...args),
  useThree: () => threeState,
}));

vi.mock("../shared/WebGpuCanvas", () => ({
  WebGpuCanvas: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="image2d-canvas">{children}</div>
  ),
}));

describe("Image2dView", () => {
  beforeEach(() => {
    vi.spyOn(THREE.Vector3.prototype, "project").mockImplementation(function (
      camera
    ) {
      const zoomScale = (camera as { zoom?: number }).zoom ?? 100;
      this.x = (this.x / 12) * (zoomScale / 100);
      this.y = (this.y / 9) * (zoomScale / 100);
      this.z = 0;
      return this;
    });
  });

  afterEach(() => {
    cleanup();
    orbitControlsPropsRef.current = null;
    threeState.camera.zoom = 100;
    threeState.invalidate.mockReset();
    useFrameCallbacks.length = 0;
    useLoaderMock.mockClear();
    vi.restoreAllMocks();
  });

  it("renders a generic image frame", () => {
    render(
      <Image2dView
        alt="Front camera"
        frame={{
          id: "frame-1",
          src: "blob:frame-1",
          timestampNs: 10,
        }}
      />
    );

    const image = screen.getByTestId("image2d-view");
    expect(image.getAttribute("data-src")).toBe("blob:frame-1");
    expect(image.getAttribute("aria-label")).toBe("Front camera");
    expect(image.getAttribute("data-object-fit")).toBe("contain");
    expect(screen.getByTestId("image2d-canvas")).toBeTruthy();
  });

  it("renders predecoded playback frames without loading a texture by URL", () => {
    render(
      <Image2dView
        frame={{
          id: "frame-1",
          src: "blob:frame-1",
          timestampNs: 10,
          imageSource: {
            naturalWidth: 640,
            naturalHeight: 480,
            width: 640,
            height: 480,
          } as HTMLImageElement,
        }}
      />
    );

    expect(useLoaderMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("image2d-view").getAttribute("data-src")).toBe(
      "blob:frame-1"
    );
  });

  it("renders nothing when there is no frame", () => {
    const { container } = render(<Image2dView frame={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows text overlays only while the image view is hovered", () => {
    render(
      <Image2dView
        frame={{
          id: "frame-1",
          src: "blob:frame-1",
          timestampNs: 10,
          overlays: [
            {
              kind: "text",
              id: "text:0",
              position: { x: 32, y: 48 },
              text: "Front camera",
            },
          ],
        }}
      />
    );

    const imageView = screen.getByTestId("image2d-view");

    expect(screen.queryByText("Front camera")).toBeNull();

    fireEvent.pointerEnter(imageView);
    expect(screen.getByText("Front camera")).toBeTruthy();

    fireEvent.pointerLeave(imageView);
    expect(screen.queryByText("Front camera")).toBeNull();
  });

  it("rescales overlays when the camera zoom changes", async () => {
    render(
      <Image2dView
        frame={{
          id: "frame-1",
          src: "blob:frame-1",
          timestampNs: 10,
          overlays: [
            {
              kind: "circle",
              id: "circle:0",
              center: { x: 320, y: 240 },
              radius: 32,
            },
          ],
        }}
      />
    );

    const overlay = screen.getByTestId("image2d-overlay");

    await waitFor(() => {
      expect(overlay.style.width).toBe("320px");
      expect(overlay.style.height).toBe("240px");
    });

    threeState.camera.zoom = 200;
    (
      orbitControlsPropsRef.current as { onChange?: () => void } | null
    )?.onChange?.();

    await waitFor(() => {
      expect(overlay.style.width).toBe("640px");
      expect(overlay.style.height).toBe("480px");
    });
  });

  it("keeps overlay scaling after rerendering to a later frame", async () => {
    const { rerender } = render(
      <Image2dView
        frame={{
          id: "frame-1",
          src: "blob:frame-1",
          timestampNs: 10,
          overlays: [
            {
              kind: "circle",
              id: "circle:0",
              center: { x: 320, y: 240 },
              radius: 32,
            },
          ],
        }}
      />
    );

    const overlay = screen.getByTestId("image2d-overlay");

    await waitFor(() => {
      expect(overlay.style.width).toBe("320px");
      expect(overlay.style.height).toBe("240px");
    });

    rerender(
      <Image2dView
        frame={{
          id: "frame-2",
          src: "blob:frame-2",
          timestampNs: 20,
          overlays: [
            {
              kind: "circle",
              id: "circle:1",
              center: { x: 320, y: 240 },
              radius: 32,
            },
          ],
        }}
      />
    );

    await waitFor(() => {
      expect(overlay.style.width).toBe("320px");
      expect(overlay.style.height).toBe("240px");
    });

    threeState.camera.zoom = 200;
    (
      orbitControlsPropsRef.current as { onChange?: () => void } | null
    )?.onChange?.();

    await waitFor(() => {
      expect(overlay.style.width).toBe("640px");
      expect(overlay.style.height).toBe("480px");
    });
  });
});
