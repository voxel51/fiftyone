import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DecodeStrategyReadout } from "./DecodeStrategyReadout";

const readout = (container: HTMLElement) =>
  container.querySelector('[data-cy="timeline-decode-strategy"]');

describe("DecodeStrategyReadout", () => {
  it("names the strategy and says why it isn't extract", () => {
    const { container } = render(
      <DecodeStrategyReadout
        strategy="fetch"
        reason="the video container isn't MP4"
      />,
    );

    expect(readout(container)?.textContent).toBe("fetch");
    expect(readout(container)?.getAttribute("title")).toBe(
      [
        "Loading extracted frame images (fetch).",
        "Why: the video container isn't MP4.",
        "Override with ?video-decode=extract|fetch|html in the URL.",
      ].join("\n"),
    );
  });

  it("marks a runtime fallback and the failure that caused it", () => {
    const { container } = render(
      <DecodeStrategyReadout
        strategy="html"
        reason="Failed to fetch"
        fellBackFrom="fetch"
      />,
    );

    expect(readout(container)?.textContent).toBe("html (fallback)");
    expect(readout(container)?.getAttribute("title")).toContain(
      "Switched from fetch, which loaded no frames: Failed to fetch",
    );
  });
});
