import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import type { CuboidCreationState } from "../types";
import { CreateCuboidRenderer } from "./CreateCuboidRenderer";

const mocks = vi.hoisted(() => ({
  atoms: {
    annotationPlaneAtom: Symbol("annotationPlaneAtom"),
    continuousCuboidCreationAtom: Symbol("continuousCuboidCreationAtom"),
    cuboidCreationStateAtom: Symbol("cuboidCreationStateAtom"),
    currentActiveAnnotationField3dAtom: Symbol(
      "currentActiveAnnotationField3dAtom",
    ),
    currentArchetypeSelectedForTransformAtom: Symbol(
      "currentArchetypeSelectedForTransformAtom",
    ),
    isCreatingCuboidAtom: Symbol("isCreatingCuboidAtom"),
    isCreatingCuboidPointerDownAtom: Symbol("isCreatingCuboidPointerDownAtom"),
    selectedLabelForAnnotationAtom: Symbol("selectedLabelForAnnotationAtom"),
    transformModeAtom: Symbol("transformModeAtom"),
    workingDocSelector: Symbol("workingDocSelector"),
  },
  createCuboid: vi.fn(),
  dispatchAnnotationEvent: vi.fn(),
  recordLastCreatedLabel: vi.fn(),
  selectNewCuboidForTransform: vi.fn(),
  setEditingToNewCuboid: vi.fn(),
  setTransformMode: vi.fn(),
  useEmptyCanvasInteraction: vi.fn(),
}));

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEventBus: () => ({ dispatch: mocks.dispatchAnnotationEvent }),
}));

vi.mock("@fiftyone/utilities", () => ({
  DETECTION: "Detection",
  objectId: () => "new-cuboid-id",
}));

vi.mock("recoil", () => ({
  useRecoilState: vi.fn(),
  useRecoilValue: vi.fn(),
  useSetRecoilState: vi.fn(),
}));

vi.mock("../hooks/use-empty-canvas-interaction", () => ({
  useEmptyCanvasInteraction: mocks.useEmptyCanvasInteraction,
}));

// The renderer reads live scene point clouds (via useThree under the hood) to
// fit a new cuboid's height; outside a Canvas we just report none, leaving the
// gestured dimensions untouched.
vi.mock("../hooks/use-scene-point-clouds", () => ({
  useScenePointClouds: () => () => [],
}));

vi.mock("../state", () => ({
  ...mocks.atoms,
  useCuboidTransformCommands: () => ({
    selectNewCuboidForTransform: mocks.selectNewCuboidForTransform,
    setTransformMode: mocks.setTransformMode,
  }),
}));

vi.mock("./store/operations", () => ({
  useCuboidOperations: () => ({ createCuboid: mocks.createCuboid }),
}));

vi.mock("./store/labelResolution", () => ({
  getDefaultLabel: () => "vehicle",
  recordLastCreatedLabel: mocks.recordLastCreatedLabel,
}));

vi.mock("./store/working", () => ({
  workingDocSelector: mocks.atoms.workingDocSelector,
}));

vi.mock("./useSetEditingToNewCuboid", () => ({
  useSetEditingToNewCuboid: () => mocks.setEditingToNewCuboid,
}));

const INITIAL_CREATION_STATE: CuboidCreationState = {
  step: 0,
  centerPosition: null,
  orientationPoint: null,
  currentPosition: null,
};

// A finished step-2 gesture: center at origin, heading along +x, width along +y.
const STEP_TWO_CREATION_STATE: CuboidCreationState = {
  step: 2,
  centerPosition: [0, 0, 0],
  orientationPoint: [1, 0, 0],
  currentPosition: [1, 1, 0],
};

describe("CreateCuboidRenderer", () => {
  const setCreationState = vi.fn();
  const setIsCreatingCuboid = vi.fn();
  const setIsCreatingCuboidPointerDown = vi.fn();
  const setSelectedLabelForAnnotation = vi.fn();
  const setCurrentArchetypeSelectedForTransform = vi.fn();
  const setTransformMode = vi.fn();

  let creationStateValue: CuboidCreationState = INITIAL_CREATION_STATE;
  let continuousCreationValue = true;

  beforeEach(() => {
    vi.clearAllMocks();
    creationStateValue = INITIAL_CREATION_STATE;
    continuousCreationValue = true;

    (useRecoilState as Mock).mockImplementation((atom) => {
      if (atom === mocks.atoms.isCreatingCuboidAtom) {
        return [true, setIsCreatingCuboid];
      }

      if (atom === mocks.atoms.cuboidCreationStateAtom) {
        return [creationStateValue, setCreationState];
      }

      throw new Error(`Unexpected recoil state: ${String(atom)}`);
    });

    (useRecoilValue as Mock).mockImplementation((atom) => {
      if (atom === mocks.atoms.currentActiveAnnotationField3dAtom) {
        return "ground_truth";
      }

      if (atom === mocks.atoms.continuousCuboidCreationAtom) {
        return continuousCreationValue;
      }

      if (atom === mocks.atoms.annotationPlaneAtom) {
        return {
          enabled: true,
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
          showX: true,
          showY: true,
          showZ: false,
        };
      }

      if (atom === mocks.atoms.workingDocSelector) {
        return { labelsById: {} };
      }

      return null;
    });

    (useSetRecoilState as Mock).mockImplementation((atom) => {
      if (atom === mocks.atoms.isCreatingCuboidPointerDownAtom) {
        return setIsCreatingCuboidPointerDown;
      }

      if (atom === mocks.atoms.selectedLabelForAnnotationAtom) {
        return setSelectedLabelForAnnotation;
      }

      if (atom === mocks.atoms.currentArchetypeSelectedForTransformAtom) {
        return setCurrentArchetypeSelectedForTransform;
      }

      if (atom === mocks.atoms.transformModeAtom) {
        return setTransformMode;
      }

      throw new Error(`Unexpected recoil setter: ${String(atom)}`);
    });
  });

  afterEach(() => {
    document.body.style.cursor = "";
  });

  // The handler the canvas wires up for the final (commit) click.
  const triggerCommitClick = () => {
    const lastCall = mocks.useEmptyCanvasInteraction.mock.calls.at(-1);
    const onPointerUp = lastCall?.[0]?.onPointerUp;
    expect(onPointerUp).toBeTypeOf("function");

    act(() => {
      onPointerUp({ x: 1, y: 1, z: 0 });
    });
  };

  it("exits cuboid create mode when Escape is pressed before the first click", () => {
    render(<CreateCuboidRenderer />);

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);

    expect(setIsCreatingCuboid).toHaveBeenCalledWith(false);
    expect(setIsCreatingCuboidPointerDown).toHaveBeenCalledWith(false);
    expect(setCreationState).toHaveBeenCalledWith(INITIAL_CREATION_STATE);
    expect(event.defaultPrevented).toBe(true);
  });

  it("stays in create mode after committing when continuous creation is on", () => {
    creationStateValue = STEP_TWO_CREATION_STATE;
    continuousCreationValue = true;

    render(<CreateCuboidRenderer />);
    triggerCommitClick();

    // Cuboid is committed and its class is remembered for the next one.
    expect(mocks.createCuboid).toHaveBeenCalledWith(
      "new-cuboid-id",
      expect.any(Object),
      "ground_truth",
      "vehicle",
    );
    expect(mocks.recordLastCreatedLabel).toHaveBeenCalledWith(
      "ground_truth",
      "vehicle",
    );

    // Create mode stays active; the new cuboid is not selected for editing.
    expect(setIsCreatingCuboid).not.toHaveBeenCalled();
    expect(mocks.setEditingToNewCuboid).not.toHaveBeenCalled();
    expect(setSelectedLabelForAnnotation).not.toHaveBeenCalled();
    expect(mocks.selectNewCuboidForTransform).not.toHaveBeenCalled();
    expect(mocks.setTransformMode).not.toHaveBeenCalled();

    // Gesture is reset so the next cuboid starts fresh.
    expect(setCreationState).toHaveBeenCalledWith(INITIAL_CREATION_STATE);
  });

  it("selects the new cuboid and exits create mode when continuous creation is off", () => {
    creationStateValue = STEP_TWO_CREATION_STATE;
    continuousCreationValue = false;

    render(<CreateCuboidRenderer />);
    triggerCommitClick();

    expect(mocks.createCuboid).toHaveBeenCalledTimes(1);
    expect(mocks.setEditingToNewCuboid).toHaveBeenCalledTimes(1);
    expect(setSelectedLabelForAnnotation).toHaveBeenCalledTimes(1);
    expect(mocks.selectNewCuboidForTransform).toHaveBeenCalledTimes(1);
    expect(mocks.setTransformMode).toHaveBeenCalledWith("scale");
    expect(setIsCreatingCuboid).toHaveBeenCalledWith(false);
  });
});
