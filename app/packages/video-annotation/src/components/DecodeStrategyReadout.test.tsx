import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecodeStrategyReadout, linkFor } from "./DecodeStrategyReadout";

const hover = (container: HTMLElement) => {
  const trigger = container.querySelector(
    '[data-cy="timeline-decode-strategy"]',
  )!.parentElement!;
  fireEvent.mouseEnter(trigger);
};

const card = () =>
  document.body.querySelector('[data-cy="timeline-decode-strategy-card"]');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DecodeStrategyReadout", () => {
  it("shows one letter, and the strategy and reason on hover", () => {
    const { container } = render(
      <DecodeStrategyReadout
        strategy="fetch"
        reason="the video container isn't MP4"
      />,
    );

    expect(
      container.querySelector('[data-cy="timeline-decode-strategy"]')
        ?.textContent,
    ).toBe("F");

    hover(container);

    expect(card()?.textContent).toContain(
      "fetch - load extracted frame images",
    );
    expect(card()?.textContent).toContain("why: the video container isn't mp4");
  });

  it("marks a runtime fallback and the failure that caused it", () => {
    const { container } = render(
      <DecodeStrategyReadout
        strategy="html"
        reason="Failed to fetch"
        fellBackFrom="fetch"
      />,
    );

    expect(
      container.querySelector('[data-cy="timeline-decode-strategy"]')
        ?.textContent,
    ).toBe("V•");

    hover(container);

    expect(card()?.textContent).toContain(
      "switched from fetch, which loaded no frames: failed to fetch",
    );
  });

  it("copies this page's link with the chosen strategy", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { container } = render(<DecodeStrategyReadout strategy="extract" />);

    hover(container);
    const row = document.body.querySelector(
      '[data-cy="timeline-decode-strategy-option-html"]',
    )!;
    await act(async () => {
      fireEvent.click(row.querySelector("button")!);
    });

    expect(writeText).toHaveBeenCalledWith(
      linkFor("html", window.location.href),
    );
    expect(row.querySelector("button")?.getAttribute("aria-label")).toBe(
      "copied",
    );
  });

  it("doesn't offer fetch without extracted frame images", () => {
    const { container } = render(
      <DecodeStrategyReadout strategy="extract" hasFrames={false} />,
    );

    hover(container);

    expect(
      document.body.querySelector(
        '[data-cy="timeline-decode-strategy-option-fetch"]',
      ),
    ).toBeNull();
    expect(
      document.body.querySelector(
        '[data-cy="timeline-decode-strategy-option-html"]',
      ),
    ).not.toBeNull();
  });

  it("offers only the strategies that aren't active", () => {
    const { container } = render(<DecodeStrategyReadout strategy="extract" />);

    hover(container);

    const options = [
      ...document.body.querySelectorAll(
        '[data-cy^="timeline-decode-strategy-option-"]',
      ),
    ].map((row) => row.getAttribute("data-cy"));
    expect(options).toEqual([
      "timeline-decode-strategy-option-fetch",
      "timeline-decode-strategy-option-html",
    ]);
  });
});

describe("linkFor", () => {
  it("sets video-decode and keeps the rest of the URL", () => {
    expect(
      linkFor(
        "html",
        "https://app.example/datasets/d?id=s1&video-decode=fetch",
      ),
    ).toBe("https://app.example/datasets/d?id=s1&video-decode=html");
  });
});
