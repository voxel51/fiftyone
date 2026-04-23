/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Image2dView } from "./Image2dView";

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: () => {},
  useLoader: () => ({
    image: { width: 640, height: 480 },
    colorSpace: "",
    generateMipmaps: false,
    minFilter: 0,
    magFilter: 0,
    needsUpdate: false,
  }),
  useThree: () => ({
    camera: {},
    invalidate: vi.fn(),
    size: { width: 640, height: 480 },
    viewport: { width: 12, height: 9 },
  }),
}));

vi.mock("../../WebGpuCanvas", () => ({
  WebGpuCanvas: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="image2d-canvas">{children}</div>
  ),
}));

describe("Image2dView", () => {
  afterEach(() => {
    cleanup();
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
});
