/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoadingScreen from ".";
import { DWELL_MS } from "./useDetections";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LoadingScreen", () => {
  it("names what it is waiting on", () => {
    render(<LoadingScreen text="Pixelating" />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "Pixelating",
    );
    expect(screen.getByText("pixelating")).toBeTruthy();
  });

  it("moves its detection box between the label's parts", () => {
    render(<LoadingScreen text="Pixelating" />);
    const first = document.querySelector(
      '[data-cy="loading-detection"]',
    )?.textContent;
    expect(first).toBe("loading 0.951");

    act(() => vi.advanceTimersByTime(DWELL_MS));
    const next = document.querySelector(
      '[data-cy="loading-detection"]',
    )?.textContent;
    expect(next).not.toBe(first);
  });
});
