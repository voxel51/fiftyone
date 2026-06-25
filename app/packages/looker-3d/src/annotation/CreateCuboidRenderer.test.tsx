import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { CreateCuboidRenderer } from "./CreateCuboidRenderer";

const mocks = vi.hoisted(() => ({
  atoms: {
    annotationPlaneAtom: Symbol("annotationPlaneAtom"),
    cuboidCreationStateAtom: Symbol("cuboidCreationStateAtom"),
    currentActiveAnnotationField3dAtom: Symbol(
      "currentActiveAnnotationField3dAtom"
    ),
    currentArchetypeSelectedForTransformAtom: Symbol(
      "currentArchetypeSelectedForTransformAtom"
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
  setEditingToNewCuboid: vi.fn(),
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

vi.mock("../state", () => mocks.atoms);

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

describe("CreateCuboidRenderer", () => {
  const setCreationState = vi.fn();
  const setIsCreatingCuboid = vi.fn();
  const setIsCreatingCuboidPointerDown = vi.fn();
  const setSelectedLabelForAnnotation = vi.fn();
  const setCurrentArchetypeSelectedForTransform = vi.fn();
  const setTransformMode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useRecoilState as Mock).mockImplementation((atom) => {
      if (atom === mocks.atoms.isCreatingCuboidAtom) {
        return [true, setIsCreatingCuboid];
      }

      if (atom === mocks.atoms.cuboidCreationStateAtom) {
        return [
          {
            step: 0,
            centerPosition: null,
            orientationPoint: null,
            currentPosition: null,
          },
          setCreationState,
        ];
      }

      throw new Error(`Unexpected recoil state: ${String(atom)}`);
    });

    (useRecoilValue as Mock).mockImplementation((atom) => {
      if (atom === mocks.atoms.currentActiveAnnotationField3dAtom) {
        return "ground_truth";
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
    expect(setCreationState).toHaveBeenCalledWith({
      step: 0,
      centerPosition: null,
      orientationPoint: null,
      currentPosition: null,
    });
    expect(event.defaultPrevented).toBe(true);
  });
});
