// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FacetCell, { type FacetCellProps } from "./FacetCell";
import type { EmbeddingsViewHandle, HoverHit } from "./renderer";
import type { Loaded } from "./useRunColumns";

// RTL only auto-cleans up with vitest globals enabled; ours are off
afterEach(cleanup);

// The renderer needs a real WebGL context. This stand-in is the two things
// the cell's point-anchored chrome talks to: where a point is drawn, and
// when the camera moved.
type Projection = { x: number; y: number } | null;
let projectPoint = vi.fn<(index: number) => Projection>();
let moveCamera: () => void = () => undefined;
vi.mock("./renderer", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    EmbeddingsView: forwardRef<
      EmbeddingsViewHandle,
      { onCameraChange?: () => void }
    >(function MockEmbeddingsView({ onCameraChange }, ref) {
      moveCamera = () => onCameraChange?.();
      useImperativeHandle(ref, () => ({
        resetCamera: vi.fn(),
        clearSelection: vi.fn(),
        projectPoint: (index: number) => projectPoint(index),
      }));
      return <div data-testid="chart" />;
    }),
  };
});

const LOADED: Loaded = {
  brainKey: "viz",
  points: [
    { id: "a", x: 0, y: 0, label: null },
    { id: "b", x: 1, y: 1, label: null },
  ],
  ids: new Uint8Array(24),
  total: 2,
};

const HIT: HoverHit = { index: 1, id: "b", label: "", x: 40, y: 60 };

const CARD = {
  hit: HIT,
  src: null,
  value: null,
  filename: "b.png",
};

function renderCell(overrides: Partial<FacetCellProps> = {}) {
  const onHover = vi.fn();
  const props: FacetCellProps = {
    cellKey: "cell",
    rowLabel: null,
    colLabel: null,
    count: 2,
    loaded: LOADED,
    colors: null,
    selected: null,
    visible: new Uint8Array([1, 1]),
    mode: "explore",
    onLasso: vi.fn(),
    onPointClick: vi.fn(),
    onBackgroundClick: vi.fn(),
    onError: vi.fn(),
    onHover,
    onKeepHover: vi.fn(),
    hoverAction: null,
    registerChart: vi.fn(),
    hover: CARD,
    hoverHit: HIT,
    pinned: true,
    ...overrides,
  };
  render(<FacetCell {...props} />);
  return { onHover };
}

describe("FacetCell point anchoring", () => {
  it("re-anchors a pinned point to where the camera left it", () => {
    // The pin marks a POINT; a pan moves that point out from under the
    // pixel the pointer was over, and a ring left at the pixel marks
    // nothing
    projectPoint = vi.fn((_index: number): Projection => ({ x: 90, y: 12 }));
    const { onHover } = renderCell();

    moveCamera();

    expect(projectPoint).toHaveBeenCalledWith(HIT.index);
    expect(onHover).toHaveBeenCalledWith({ ...HIT, x: 90, y: 12 });
  });

  it("stays quiet when the camera left the point where it was", () => {
    // A re-anchor to the same pixel is a render for nothing, every frame
    // of a gesture that moved the camera off the point's axis
    projectPoint = vi.fn(
      (_index: number): Projection => ({ x: HIT.x, y: HIT.y }),
    );
    const { onHover } = renderCell();

    moveCamera();

    expect(onHover).not.toHaveBeenCalled();
  });

  it("stays quiet when the point has no projection", () => {
    // Behind the camera, or a chart that has not loaded: the ring is
    // clipped by the cell either way, and inventing a position would put
    // the frozen card somewhere the point is not
    projectPoint = vi.fn((_index: number): Projection => null);
    const { onHover } = renderCell();

    moveCamera();

    expect(onHover).not.toHaveBeenCalled();
  });

  it("leaves a live hover to the pointer's own hit-test", () => {
    // Unpinned, the picker re-tests under the pointer as the camera moves —
    // re-anchoring here would claim the pointer is still on a point the
    // camera just moved away from it
    projectPoint = vi.fn((_index: number): Projection => ({ x: 90, y: 12 }));
    const { onHover } = renderCell({ pinned: false });

    moveCamera();

    expect(projectPoint).not.toHaveBeenCalled();
    expect(onHover).not.toHaveBeenCalled();
  });

  it("leaves a pinned point in another cell alone", () => {
    // Cells own their own cameras, so only the cell the point is drawn in
    // knows where it went
    projectPoint = vi.fn((_index: number): Projection => ({ x: 90, y: 12 }));
    const { onHover } = renderCell({ visible: new Uint8Array([1, 0]) });

    moveCamera();

    expect(onHover).not.toHaveBeenCalled();
  });
});
