import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { TrackProvider } from "../../lib/tracks/TrackProvider";
import TemporalTagTimeline from "./TemporalTagTimeline";

function renderTimeline(ui: React.ReactElement) {
  return render(
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <TrackProvider>{ui}</TrackProvider>
    </PlaybackProvider>,
  );
}

describe("TemporalTagTimeline slot composition", () => {
  beforeEach(() => {
    // useElementSize relies on ResizeObserver which jsdom doesn't support.
    global.ResizeObserver = vi.fn().mockImplementation(function () {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders caller extraActions alongside the tag button", () => {
    renderTimeline(
      <TemporalTagTimeline
        onTagCreate={async () => {}}
        extraActions={<span data-testid="host-clock">clock</span>}
      />,
    );
    expect(screen.getByTestId("host-clock")).toBeTruthy();
    expect(screen.getByTestId("temporal-tag-mode-button")).toBeTruthy();
  });

  it("renders caller rulerOverlay alongside the tag overlay", () => {
    renderTimeline(
      <TemporalTagTimeline
        onTagCreate={async () => {}}
        rulerOverlay={<div data-testid="host-overlay" />}
      />,
    );
    expect(screen.getByTestId("host-overlay")).toBeTruthy();
  });
});
