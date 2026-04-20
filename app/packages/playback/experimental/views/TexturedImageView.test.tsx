/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TexturedImageView } from "./TexturedImageView";

const { invalidateMock, textureMock, useLoaderMock } = vi.hoisted(() => ({
  invalidateMock: vi.fn(),
  textureMock: {
    image: { width: 640, height: 480 },
    colorSpace: null,
    generateMipmaps: true,
    minFilter: null,
    magFilter: null,
    needsUpdate: false,
  },
  useLoaderMock: vi.fn(),
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="textured-image-canvas" data-props={JSON.stringify(props)}>
      {children}
    </div>
  ),
  useLoader: (...args: unknown[]) => useLoaderMock(...args),
  useThree: () => ({
    invalidate: invalidateMock,
    viewport: { width: 10, height: 5 },
  }),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: (props: Record<string, unknown>) => (
    <div
      data-testid="textured-image-controls"
      data-props={JSON.stringify(props)}
    />
  ),
}));

describe("TexturedImageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLoaderMock.mockReturnValue(textureMock);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a textured image plane", () => {
    const { container } = render(
      <TexturedImageView alt="Front camera" src="blob:frame-1" />
    );
    const controls = screen.getByTestId("textured-image-controls");
    const controlProps = JSON.parse(
      controls.getAttribute("data-props") ?? "{}"
    );

    expect(screen.getByTestId("textured-image-view")).toBeTruthy();
    expect(screen.getByTestId("textured-image-canvas")).toBeTruthy();
    expect(controls).toBeTruthy();
    expect(controlProps.enablePan).toBe(true);
    expect(controlProps.enableZoom).toBe(true);
    expect(controlProps.enableRotate).toBe(false);
    expect(controlProps.screenSpacePanning).toBe(true);
    expect(container.querySelector("mesh")).toBeTruthy();
    expect(useLoaderMock).toHaveBeenCalled();
    expect(textureMock.needsUpdate).toBe(true);
    expect(invalidateMock).toHaveBeenCalled();
  });

  it("supports cover scaling", () => {
    const { container } = render(
      <TexturedImageView objectFit="cover" src="blob:frame-2" />
    );

    const mesh = container.querySelector("mesh");

    expect(mesh?.getAttribute("scale")).toContain("10");
    expect(mesh?.getAttribute("scale")).toContain("7.5");
  });
});
