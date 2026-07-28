import { act, renderHook } from "@testing-library/react-hooks";
import { afterEach, describe, expect, it, vi } from "vitest";

// `hooks.ts` pulls in a heavy dependency chain (`@fiftyone/annotation`,
// `@fiftyone/state`, `@fiftyone/looker`, `@react-three/drei`) that isn't
// safely importable in isolation under vitest (a circular-import issue
// surfaces deep inside `@fiftyone/looker`'s module graph). Mock all of it so
// this test exercises only `hooks.ts`'s own logic — specifically, that
// `useEventHandlers`/`useMeshTooltipProps` correctly operate on whichever
// label is passed at call time, rather than one captured at hook-call time.

const mocks = vi.hoisted(() => ({
  atoms: {
    selectedLabelForAnnotationAtom: Symbol("selectedLabelForAnnotationAtom"),
    isCurrentlyTransformingAtom: Symbol("isCurrentlyTransformingAtom"),
    editSegmentsModeAtom: Symbol("editSegmentsModeAtom"),
    isActivelySegmentingSelector: Symbol("isActivelySegmentingSelector"),
  },
  fosAtoms: {
    isTooltipLocked: Symbol("isTooltipLocked"),
    tooltipDetail: Symbol("tooltipDetail"),
    tooltipCoordinates: Symbol("tooltipCoordinates"),
  },
  atomValues: new Map<symbol, unknown>(),
  setSpy: vi.fn(),
  emitSpy: vi.fn(),
  setHoveredSpy: vi.fn(),
  getHoveredSpy: vi.fn(() => [] as { instanceId: string }[]),
  isAnnotateMode: false,
}));

vi.mock("../../state", () => ({
  selectedLabelForAnnotationAtom: mocks.atoms.selectedLabelForAnnotationAtom,
  isCurrentlyTransformingAtom: mocks.atoms.isCurrentlyTransformingAtom,
  editSegmentsModeAtom: mocks.atoms.editSegmentsModeAtom,
  isActivelySegmentingSelector: mocks.atoms.isActivelySegmentingSelector,
}));

vi.mock("@fiftyone/state", () => ({
  isTooltipLocked: mocks.fosAtoms.isTooltipLocked,
  tooltipDetail: mocks.fosAtoms.tooltipDetail,
  tooltipCoordinates: mocks.fosAtoms.tooltipCoordinates,
  computeCoordinates: (xy: [number, number]) => ({ x: xy[0], y: xy[1] }),
  useModalMode: () => (mocks.isAnnotateMode ? "annotate" : "explore"),
  useCurrentSampleId: () => "sample-1",
}));

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEngine: () => ({
    interaction: {
      setHovered: mocks.setHoveredSpy,
      getHovered: mocks.getHoveredSpy,
    },
  }),
}));

vi.mock("@fiftyone/looker", () => ({
  LabelHoveredEvent: class LabelHoveredEvent {
    detail: unknown;
    constructor(detail: unknown) {
      this.detail = detail;
    }
  },
  LabelUnhoveredEvent: class LabelUnhoveredEvent {},
  selectiveRenderingEventBus: { emit: mocks.emitSpy, on: vi.fn() },
}));

vi.mock("@react-three/drei", () => ({
  useCursor: vi.fn(),
}));

vi.mock("../../hooks/use-3d-label-color", () => ({
  use3dLabelColor: vi.fn(),
}));

vi.mock("../../hooks/use-similar-labels-3d", () => ({
  useSimilarLabels3d: vi.fn(),
}));

vi.mock("recoil", () => ({
  useRecoilCallback:
    (fn: (iface: unknown) => (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn({
        snapshot: {
          getLoadable: (atom: symbol) => ({
            getValue: () => mocks.atomValues.get(atom),
          }),
        },
        set: mocks.setSpy,
      })(...args),
  useRecoilValue: (atom: symbol) => mocks.atomValues.get(atom),
}));

import { useEventHandlers } from "./hooks";

function makeLabel(id: string) {
  return {
    _id: id,
    id,
    path: "ground_truth",
    color: "#fff",
    sampleId: "sample-1",
    type: "Detection",
    instance: { _id: `instance-${id}` },
  };
}

describe("useEventHandlers", () => {
  afterEach(() => {
    // `clearAllMocks` only clears call records, not implementations — a test
    // that sets `getHoveredSpy.mockReturnValue(...)` would otherwise leak
    // that return value into later tests, so reset it explicitly.
    vi.clearAllMocks();
    mocks.getHoveredSpy.mockReturnValue([]);
    mocks.atomValues.clear();
    mocks.isAnnotateMode = false;
  });

  it("sets tooltipDetail from whichever label is passed at call time", () => {
    const { result } = renderHook(() => useEventHandlers());

    const labelA = makeLabel("a");
    const labelB = makeLabel("b");

    act(() => {
      result.current.onPointerOver(labelA, undefined);
    });
    expect(mocks.setSpy).toHaveBeenLastCalledWith(
      mocks.fosAtoms.tooltipDetail,
      expect.objectContaining({ label: labelA }),
    );

    act(() => {
      result.current.onPointerOver(labelB, undefined);
    });
    expect(mocks.setSpy).toHaveBeenLastCalledWith(
      mocks.fosAtoms.tooltipDetail,
      expect.objectContaining({ label: labelB }),
    );
  });

  it("does not set tooltipDetail for the label currently selected for annotation", () => {
    const labelA = makeLabel("a");
    mocks.atomValues.set(mocks.atoms.selectedLabelForAnnotationAtom, {
      _id: "a",
    });

    const { result } = renderHook(() => useEventHandlers());
    act(() => {
      result.current.onPointerOver(labelA, undefined);
    });

    expect(mocks.setSpy).not.toHaveBeenCalledWith(
      mocks.fosAtoms.tooltipDetail,
      expect.anything(),
    );
  });

  it("emits a hover event only for labels with an instance", () => {
    const withInstance = makeLabel("a");
    const withoutInstance = { ...makeLabel("b"), instance: undefined };

    const { result } = renderHook(() => useEventHandlers());

    act(() => {
      result.current.onPointerOver(withInstance, undefined);
    });
    expect(mocks.emitSpy).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.onPointerOver(withoutInstance, undefined);
    });
    expect(mocks.emitSpy).toHaveBeenCalledTimes(1);
  });

  it("only writes the engine's hovered set in annotate mode, keyed by the call-time label", () => {
    mocks.isAnnotateMode = true;
    const labelA = makeLabel("a");
    const labelB = makeLabel("b");

    const { result } = renderHook(() => useEventHandlers());

    act(() => {
      result.current.onPointerOver(labelA, undefined);
    });
    expect(mocks.setHoveredSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ instanceId: "a" }),
      true,
    );

    act(() => {
      result.current.onPointerOver(labelB, undefined);
    });
    expect(mocks.setHoveredSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ instanceId: "b" }),
      true,
    );
  });

  it("does not write the engine's hovered set outside annotate mode", () => {
    mocks.isAnnotateMode = false;
    const { result } = renderHook(() => useEventHandlers());

    act(() => {
      result.current.onPointerOver(makeLabel("a"), undefined);
    });

    expect(mocks.setHoveredSpy).not.toHaveBeenCalled();
  });

  it("resolves onPointerOut's hover-clear from the engine's hovered set by the call-time label", () => {
    mocks.isAnnotateMode = true;
    mocks.getHoveredSpy.mockReturnValue([{ instanceId: "b" }]);

    const { result } = renderHook(() => useEventHandlers());
    act(() => {
      result.current.onPointerOut(makeLabel("b"));
    });

    expect(mocks.setHoveredSpy).toHaveBeenCalledWith(
      { instanceId: "b" },
      false,
    );
  });
});
