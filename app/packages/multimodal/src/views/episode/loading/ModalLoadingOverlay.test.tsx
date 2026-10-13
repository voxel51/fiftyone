import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FramePresentationProvider,
  useFramePresentation,
  useFrameUnavailable,
} from "../../../visualization/webgpu/FramePresentation";
import {
  DESTINATION_LOADING_WATCHDOG_MS,
  DestinationVisitProvider,
} from "./destination-visit";
import { ModalLoadingOverlay } from "./ModalLoadingOverlay";

const tiling = vi.hoisted(() => ({
  tiles: { camera: { type: "image" } } as Record<string, { type: string }>,
}));
vi.mock("@fiftyone/tiling", () => ({
  collectTileIds: () => Object.keys(tiling.tiles),
  useTiling: () => ({
    expandedTileId: null,
    layout: Object.keys(tiling.tiles)[0],
    tiles: tiling.tiles,
  }),
}));
vi.mock("./EpisodeModalLoading", () => ({
  EpisodeModalLoading: ({ sampleId }: { sampleId: string }) => (
    <div>{sampleId}</div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const identity = {
  datasetId: "dataset",
  mediaField: "filepath",
  sampleId: "destination",
};

interface Destination {
  readonly pending: boolean;
  readonly presented?: boolean;
  readonly sourceKey?: string;
  readonly unavailableTileId?: string | null;
  readonly visitKey?: string;
}

function Probe({
  presented,
  sourceKey,
  unavailableTileId,
}: {
  readonly presented: boolean;
  readonly sourceKey: string;
  readonly unavailableTileId: string | null;
}) {
  const onRendered = useFramePresentation(sourceKey, presented);
  useFrameUnavailable(sourceKey, unavailableTileId, true);
  return presented ? <RenderedFrame onRendered={onRendered} /> : null;
}

function RenderedFrame({ onRendered }: { readonly onRendered?: () => void }) {
  return (
    <button onClick={onRendered} type="button">
      paint
    </button>
  );
}

function Shell({
  children,
  sourceKey,
  visitKey,
}: {
  readonly children: ReactNode;
  readonly sourceKey: string;
  readonly visitKey: string;
}) {
  return (
    <FramePresentationProvider sourceKey={sourceKey}>
      <DestinationVisitProvider visitKey={visitKey}>
        {children}
      </DestinationVisitProvider>
    </FramePresentationProvider>
  );
}

function renderDestination(initial: Destination) {
  const view = (next: Destination) => {
    const sourceKey = next.sourceKey ?? "source";
    return (
      <Shell sourceKey={sourceKey} visitKey={next.visitKey ?? "visit"}>
        <Probe
          presented={next.presented ?? false}
          sourceKey={sourceKey}
          unavailableTileId={next.unavailableTileId ?? null}
        />
        <ModalLoadingOverlay identity={identity} pending={next.pending} />
      </Shell>
    );
  };
  const result = render(view(initial));
  return {
    paint: () => act(() => screen.getByText("paint").click()),
    rerender: (next: Destination) => result.rerender(view(next)),
  };
}

const covered = () => screen.queryByText("destination") !== null;

describe("modal loading overlay", () => {
  it("holds the cover for pending work and an unpainted media pane", () => {
    tiling.tiles = { camera: { type: "image" } };
    const destination = renderDestination({ pending: false });
    expect(covered()).toBe(true);
    destination.rerender({ pending: true, presented: true });
    destination.paint();
    // Media surfaces stay hidden until playhead data is ready.
    expect(covered()).toBe(true);
    destination.rerender({ pending: false, presented: true });
    expect(covered()).toBe(false);
  });

  it("does not hold a log-only layout waiting for an image", () => {
    tiling.tiles = { log: { type: "log" } };
    const destination = renderDestination({ pending: true });
    expect(covered()).toBe(true);
    destination.rerender({ pending: false });
    expect(covered()).toBe(false);
  });

  it("reveals one terminal pane without waiting for another media pane", () => {
    tiling.tiles = { camera: { type: "image" }, lidar: { type: "3d" } };
    const destination = renderDestination({
      pending: true,
      unavailableTileId: "camera",
    });
    expect(covered()).toBe(true);
    destination.rerender({ pending: false, unavailableTileId: "camera" });
    expect(covered()).toBe(false);
  });

  it("stays dismissed through URL renewals, retries, and later seeks", () => {
    tiling.tiles = { camera: { type: "image" } };
    const destination = renderDestination({
      pending: false,
      unavailableTileId: "camera",
    });
    expect(covered()).toBe(false);
    // A gap that starts loading again on seek clears the terminal pane.
    destination.rerender({ pending: false });
    expect(covered()).toBe(false);
    // A renewed URL changes the presentation scope and re-enters pending.
    destination.rerender({ pending: true, sourceKey: "renewed" });
    expect(covered()).toBe(false);
  });

  it("re-arms for every navigation visit, including A to B to A", () => {
    tiling.tiles = { camera: { type: "image" } };
    const destination = renderDestination({ pending: false, visitKey: "a" });
    destination.rerender({
      pending: false,
      presented: true,
      visitKey: "a",
    });
    destination.paint();
    expect(covered()).toBe(false);
    destination.rerender({ pending: true, visitKey: "b" });
    expect(covered()).toBe(true);
    destination.rerender({ pending: true, visitKey: "a" });
    expect(covered()).toBe(true);
  });

  it("drops only the cover when destination work never settles", () => {
    vi.useFakeTimers();
    tiling.tiles = { camera: { type: "image" } };
    renderDestination({ pending: true });
    act(() => vi.advanceTimersByTime(DESTINATION_LOADING_WATCHDOG_MS - 1));
    expect(covered()).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(covered()).toBe(false);
  });
});
