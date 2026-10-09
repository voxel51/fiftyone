/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoadingScreen from ".";
import { DWELL_MS } from "./useDetections";

beforeEach(() => {
  vi.useFakeTimers();
  // without a canvas the word shows at once, as it does with reduced motion
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const color = () =>
  (
    document.querySelector('[data-cy="loading-detection"]') as HTMLElement
  ).style.getPropertyValue("--detection");

describe("LoadingScreen", () => {
  it("names what it is waiting on", () => {
    render(<LoadingScreen text="Pixelating" />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "Pixelating",
    );
    expect(screen.getByText("pixelating")).toBeTruthy();
  });

  it("blinks a new box on the next object", () => {
    render(<LoadingScreen text="Pixelating" />);
    const box = () =>
      document.querySelector('[data-cy="loading-detection"]') as HTMLElement;
    const first = box();
    const firstColor = color();

    act(() => vi.advanceTimersByTime(DWELL_MS));
    expect(box()).not.toBe(first);
    expect(color()).not.toBe(firstColor);
  });

  it("holds one box still when motion is reduced", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
    }));
    render(<LoadingScreen text="Pixelating" />);
    const firstColor = color();

    act(() => vi.advanceTimersByTime(DWELL_MS * 3));
    expect(color()).toBe(firstColor);
  });
});
