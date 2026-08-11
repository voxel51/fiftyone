import { Button } from "@voxel51/voodo";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlayIcon } from "./stableIcons";

describe("stableIcons", () => {
  afterEach(cleanup);

  it("keeps the icon's DOM node across re-renders, so a click that starts on the SVG survives", () => {
    const { container, rerender } = render(
      <Button leadingIcon={PlayIcon} aria-label="Play" />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();

    rerender(<Button leadingIcon={PlayIcon} aria-label="Play" />);
    expect(container.querySelector("svg")).toBe(svg);
  });
});
