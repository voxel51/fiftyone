/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Image2dView } from "./Image2dView";

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
    expect(image.getAttribute("src")).toBe("blob:frame-1");
    expect(image.getAttribute("alt")).toBe("Front camera");
  });

  it("renders nothing when there is no frame", () => {
    const { container } = render(<Image2dView frame={null} />);
    expect(container.firstChild).toBeNull();
  });
});
