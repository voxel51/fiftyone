import type { SampleRendererProps } from "@fiftyone/plugins";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  publishEpisodePlayhead,
  publishEpisodeTimeRange,
  resetEpisodePlayheadsForTests,
} from "../runtime";
import { resetEpisodeTimeRangesForTests } from "../runtime/episode-time-range-registry";
import { registerEpisodeIntervalSource } from "../extensions/episode-intervals";
import type {
  EpisodeInterval,
  EpisodeIntervalSourceProps,
} from "../extensions/episode-intervals";

// The built-in temporal-tag source is exercised on its own; keep it inert here
// so these assertions are about the lane, not about tags.
vi.mock("./temporal-tag-interval-source", () => ({
  temporalTagIntervalSource: {
    id: "test:temporal-tags",
    label: "Temporal tags",
    order: 200,
    Component: ({ children }: EpisodeIntervalSourceProps) => (
      <>{children({ intervals: [] })}</>
    ),
  },
}));

const { EpisodeGridOverlay } = await import("./EpisodeGridOverlay");

const TILE_WIDTH = 400;
const TILE_HEIGHT = 400;
/** The overlay sits in the bottom strip of the tile. */
const OVERLAY_TOP = 360;
const IN_OVERLAY = { clientX: TILE_WIDTH / 2, clientY: 380 };
const OVER_PREVIEW = { clientX: TILE_WIDTH / 2, clientY: 10 };

const NS = 1_000_000_000;
const START = 1_800_000_000_000_000_000n;
const RANGE = { startNs: START, endNs: START + 100n * BigInt(NS) };

const CTX = {
  dataset: { datasetId: "ds", name: "ds" },
  sample: { sample: { _id: "ep" } },
  media: {},
} as unknown as SampleRendererProps["ctx"];

const interval = (
  eventName: string,
  startSec: number,
  endSec: number,
  sourceId = "test:events",
): EpisodeInterval => ({
  sourceId,
  eventName,
  color: "#f00",
  startNs: startSec * NS,
  endNs: endSec * NS,
});

const disposers: (() => void)[] = [];

/** Registers a source contributing exactly these intervals. */
function useSourceWith(intervals: EpisodeInterval[], id = "test:events") {
  disposers.push(
    registerEpisodeIntervalSource({
      id,
      label: id,
      order: 210,
      Component: ({ children }: EpisodeIntervalSourceProps) => (
        <>{children({ intervals })}</>
      ),
    }),
  );
}

/** The tile element the overlay finds by `closest` to track the pointer on. */
function tileOf(container: HTMLElement): HTMLElement {
  const tile = container.querySelector<HTMLElement>("[data-grid-tile]");
  if (!tile) throw new Error("expected the tile wrapper to be rendered");
  return tile;
}

/**
 * A tile wrapper carrying the attribute the overlay tracks the pointer on.
 *
 * The same attribute the grid publishes in
 * `core/src/components/Grid/GridCustomRendererItem.tsx` — a production handle,
 * not the `data-cy` test hook, so renaming the latter cannot silently take the
 * ghost line and the size gates with it.
 */
const Tile = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-grid-tile="">{children}</div>
);

beforeEach(() => {
  publishEpisodeTimeRange("ep", RANGE);
  // jsdom gives every element a zero-size box, which the overlay reads as a
  // tile too small to draw on. Report a tile comfortably past the size gates,
  // with the overlay itself occupying the bottom strip of it, so "is the
  // pointer over the overlay" is a real question here.
  const box = (top: number, bottom: number): DOMRect =>
    ({
      bottom,
      height: bottom - top,
      left: 0,
      right: TILE_WIDTH,
      toJSON: () => ({}),
      top,
      width: TILE_WIDTH,
      x: 0,
      y: top,
    }) as DOMRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.dataset?.gridTile !== undefined
        ? box(0, TILE_HEIGHT)
        : box(OVERLAY_TOP, TILE_HEIGHT);
    },
  );
});

afterEach(() => {
  // This project does not enable Testing Library's auto-cleanup, so an
  // un-unmounted overlay would keep contributing marks to the next test.
  cleanup();
  for (const dispose of disposers.splice(0)) dispose();
  resetEpisodeTimeRangesForTests();
  resetEpisodePlayheadsForTests();
  vi.restoreAllMocks();
});

describe("EpisodeGridOverlay", () => {
  it("renders nothing when no source contributes", () => {
    render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    expect(screen.queryByTestId("episode-grid-overlay")).toBeNull();
  });

  it("renders one mark per interval", () => {
    useSourceWith([interval("a", 0, 10), interval("b", 20, 30)]);

    render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    expect(screen.getAllByTestId("episode-grid-overlay-mark")).toHaveLength(2);
  });

  it("attributes each mark to the source that contributed it", () => {
    useSourceWith([interval("a", 0, 10)]);

    render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    expect(
      screen.getAllByTestId("episode-grid-overlay-mark")[0].dataset.source,
    ).toBe("test:events");
  });

  it("positions a mark as a percentage of the episode's span", () => {
    // The range is 100s, so an interval at 10-20s sits at 10% and spans 10%.
    useSourceWith([interval("a", 10, 20)]);

    render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    const mark = screen.getAllByTestId("episode-grid-overlay-mark")[0];
    expect(mark.style.left).toBe("10%");
    expect(mark.style.width).toBe("10%");
  });

  it("omits a fourth concurrent interval rather than stacking it", () => {
    useSourceWith([
      interval("a", 0, 30),
      interval("b", 1, 30),
      interval("c", 2, 30),
      interval("d", 3, 30),
    ]);

    render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    expect(screen.getAllByTestId("episode-grid-overlay-mark")).toHaveLength(3);
  });

  it("shows no playhead until the tile publishes one", () => {
    useSourceWith([interval("a", 0, 10)]);

    render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    expect(screen.queryByTestId("episode-grid-overlay-playhead")).toBeNull();
  });

  it("draws the playhead where the tile is presenting", () => {
    useSourceWith([interval("a", 0, 10)]);
    publishEpisodePlayhead("ep", START + 25n * BigInt(NS));

    render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    expect(screen.getByTestId("episode-grid-overlay-playhead").style.left).toBe(
      "25%",
    );
  });

  it("names what the playhead is inside", () => {
    useSourceWith([interval("covering", 0, 50), interval("elsewhere", 80, 90)]);
    publishEpisodePlayhead("ep", START + 25n * BigInt(NS));

    render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    const readout = screen.getByTestId("episode-grid-overlay-readout");
    expect(readout.textContent).toContain("covering");
    expect(readout.textContent).not.toContain("elsewhere");
  });

  it("shows no ghost until the pointer reaches the overlay", () => {
    useSourceWith([interval("a", 0, 10)]);

    render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    expect(screen.queryByTestId("episode-grid-overlay-ghost")).toBeNull();
  });

  it("follows the pointer while it is over the overlay", () => {
    useSourceWith([interval("a", 0, 100)]);

    const { container } = render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    fireEvent.mouseMove(tileOf(container), IN_OVERLAY);

    expect(screen.getByTestId("episode-grid-overlay-ghost").style.left).toBe(
      "50%",
    );
  });

  it("ignores the pointer while it is over the preview above", () => {
    // Hovering the media is not an act of inspection, and capturing it there
    // would also mean taking the pointer off the cell.
    useSourceWith([interval("a", 0, 100)]);

    const { container } = render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    fireEvent.mouseMove(tileOf(container), OVER_PREVIEW);

    expect(screen.queryByTestId("episode-grid-overlay-ghost")).toBeNull();
  });

  it("prefers the pointer over the playhead for the readout", () => {
    useSourceWith([interval("early", 0, 20), interval("late", 40, 60)]);
    publishEpisodePlayhead("ep", START + 10n * BigInt(NS));

    const { container } = render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );
    expect(
      screen.getByTestId("episode-grid-overlay-readout").textContent,
    ).toContain("early");

    fireEvent.mouseMove(tileOf(container), IN_OVERLAY);

    const readout = screen.getByTestId("episode-grid-overlay-readout");
    expect(readout.textContent).toContain("late");
    expect(readout.textContent).not.toContain("early");
  });

  it("lists one entry per name, not per occurrence", () => {
    useSourceWith([interval("a", 0, 50), interval("a", 10, 60)]);
    publishEpisodePlayhead("ep", START + 25n * BigInt(NS));

    render(
      <Tile>
        <EpisodeGridOverlay ctx={CTX} />
      </Tile>,
    );

    const readout = screen.getByTestId("episode-grid-overlay-readout");
    expect(readout.textContent?.match(/a/g)).toHaveLength(1);
  });
});
