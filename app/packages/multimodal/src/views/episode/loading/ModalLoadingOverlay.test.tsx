import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalLoadingOverlay } from "./ModalLoadingOverlay";

const tiling = vi.hoisted(() => ({ type: "image" }));
vi.mock("@fiftyone/tiling", () => ({
  collectTileIds: () => ["tile"],
  useTiling: () => ({
    expandedTileId: null,
    layout: "tile",
    tiles: { tile: { type: tiling.type } },
  }),
}));
vi.mock("./EpisodeModalLoading", () => ({
  EpisodeModalLoading: ({ sampleId }: { sampleId: string }) => (
    <div>{sampleId}</div>
  ),
}));
afterEach(cleanup);

describe("modal loading overlay", () => {
  const identity = {
    datasetId: "dataset",
    mediaField: "filepath",
    sampleId: "destination",
  };
  it("covers pending navigation and waits for a rendered media frame", () => {
    tiling.type = "image";
    const { rerender } = render(
      <ModalLoadingOverlay
        identity={identity}
        pending={false}
        presented={false}
      />,
    );
    expect(screen.getByText("destination")).toBeTruthy();
    rerender(
      <ModalLoadingOverlay
        identity={identity}
        pending={true}
        presented={true}
      />,
    );
    expect(screen.getByText("destination")).toBeTruthy();
    rerender(
      <ModalLoadingOverlay
        identity={identity}
        pending={false}
        presented={true}
      />,
    );
    expect(screen.queryByText("destination")).toBeNull();
  });
  it("does not hold a log-only layout waiting for an image", () => {
    tiling.type = "log";
    render(
      <ModalLoadingOverlay
        identity={identity}
        pending={false}
        presented={false}
      />,
    );
    expect(screen.queryByText("destination")).toBeNull();
  });
});
