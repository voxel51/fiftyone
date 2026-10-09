import { render } from "@testing-library/react";
import { Vector3 } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRID_TOGGLED_EVENT } from "../../constants";
import { Gizmos } from "../Gizmos";

const { dispatch, gridOn } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  gridOn: { current: true },
}));

vi.mock("@fiftyone/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/events")>()),
  getEventBus: () => ({ dispatch }),
  createUseEventHandler: () => () => undefined,
  isLegacyDomMirror: () => false,
}));

// the grid toggle is the only state under test; the grid sizing reads defaults
vi.mock("recoil", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recoil")>();
  const value = ({ key }: { key: string }) =>
    key === "fo3d-isGridOn" ? gridOn.current : undefined;
  return {
    ...actual,
    useRecoilValue: value,
    useRecoilState: (atom: { key: string }) => [value(atom), vi.fn()],
  };
});

vi.mock("@react-three/drei", () => ({
  GizmoHelper: () => null,
  GizmoViewport: () => null,
  Grid: () => null,
  Line: () => null,
}));

vi.mock("../context", () => ({
  useFo3dContext: () => ({
    upVector: new Vector3(0, 1, 0),
    sceneBoundingBox: null,
  }),
}));

const renderGizmos = (isGridVisible: boolean, isGridOn: boolean) => {
  gridOn.current = isGridOn;
  return render(
    <Gizmos isGridVisible={isGridVisible} isGizmoHelperVisible={false} />,
  );
};

describe("Gizmos grid announcement", () => {
  beforeEach(() => dispatch.mockClear());

  it.each([true, false])(
    "reports the grid the scene renders: on=%s",
    (isGridOn) => {
      renderGizmos(true, isGridOn);

      expect(dispatch.mock.calls).toEqual([
        [GRID_TOGGLED_EVENT, { on: isGridOn }],
      ]);
    },
  );

  it("reports nothing from a scene that never shows the grid", () => {
    renderGizmos(false, true);

    expect(dispatch).not.toHaveBeenCalled();
  });
});
