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
});
