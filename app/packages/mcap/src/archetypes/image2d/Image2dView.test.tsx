/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Image2dView } from "./Image2dView";

vi.mock("@fiftyone/playback/experimental/views/TexturedImageView", () => ({
  TexturedImageView: ({
    alt,
    objectFit,
    src,
    testId,
  }: {
    alt?: string;
    objectFit?: string;
    src: string;
    testId?: string;
  }) => (
    <div
      aria-label={alt}
      data-object-fit={objectFit}
      data-src={src}
      data-testid={testId ?? "textured-image-view"}
    />
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
  });

  it("renders nothing when there is no frame", () => {
    const { container } = render(<Image2dView frame={null} />);
    expect(container.firstChild).toBeNull();
  });
});
