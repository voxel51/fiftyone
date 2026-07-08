import { renderHook } from "@testing-library/react-hooks";
import type { CameraControls } from "@react-three/drei";
import type { RefObject } from "react";
import type { PerspectiveCamera } from "three";
import { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SET_ZOOM_TO_SELECTED_EVENT } from "../constants";
import { useCameraViews } from "./use-camera-views";

// The hook pulls in a wide surface of app state; stub it all out so the test
// exercises only the keydown guard logic.
vi.mock(
  "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotate",
  () => ({
    default: () => false,
  }),
);

vi.mock("@fiftyone/state", () => ({
  ModalMode: { ANNOTATE: "annotate" },
  modalMode: { key: "modalMode" },
}));

vi.mock("jotai", () => ({
  useAtomValue: () => "explore",
}));

vi.mock("recoil", () => ({
  useRecoilValue: (atom: { key?: string } | null) =>
    atom?.key === "annotationPlaneAtom" ? { enabled: false } : null,
  useSetRecoilState: () => () => {},
}));

vi.mock("../annotation/store", () => ({
  useWorkingLabel: () => null,
}));

vi.mock("../fo3d/context", () => ({
  useFo3dContext: () => ({
    sceneBoundingBox: null,
    upVector: new Vector3(0, 1, 0),
  }),
}));

vi.mock("../state", () => ({
  annotationPlaneAtom: { key: "annotationPlaneAtom" },
  cameraViewStatusAtom: { key: "cameraViewStatusAtom" },
  currentArchetypeSelectedForTransformAtom: {
    key: "currentArchetypeSelectedForTransformAtom",
  },
  isFo3dBackgroundOnAtom: { key: "isFo3dBackgroundOnAtom" },
  selectedLabelForAnnotationAtom: { key: "selectedLabelForAnnotationAtom" },
  selectedPolylineVertexAtom: { key: "selectedPolylineVertexAtom" },
}));

const makeRefs = () => ({
  cameraRef: {
    current: { position: new Vector3(1, 1, 1) },
  } as unknown as RefObject<PerspectiveCamera>,
  cameraControlsRef: {
    current: { getTarget: vi.fn(), setLookAt: vi.fn() },
  } as unknown as RefObject<CameraControls>,
});

const dispatchKeyZ = (
  modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {},
) => {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      code: "KeyZ",
      bubbles: true,
      cancelable: true,
      ...modifiers,
    }),
  );
};

describe("useCameraViews keydown guard", () => {
  let zoomListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    zoomListener = vi.fn();
    window.addEventListener(SET_ZOOM_TO_SELECTED_EVENT, zoomListener);
  });

  afterEach(() => {
    window.removeEventListener(SET_ZOOM_TO_SELECTED_EVENT, zoomListener);
    vi.clearAllMocks();
  });

  it("fires zoom-to-selected for bare Z (no modifiers)", () => {
    const { cameraRef, cameraControlsRef } = makeRefs();
    renderHook(() => useCameraViews({ cameraRef, cameraControlsRef }));

    dispatchKeyZ();

    expect(zoomListener).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire zoom for Ctrl+Z (so it can fall through to undo on Windows)", () => {
    const { cameraRef, cameraControlsRef } = makeRefs();
    renderHook(() => useCameraViews({ cameraRef, cameraControlsRef }));

    dispatchKeyZ({ ctrlKey: true });

    expect(zoomListener).not.toHaveBeenCalled();
  });

  it("does NOT fire zoom for Cmd/meta+Z (undo on Mac)", () => {
    const { cameraRef, cameraControlsRef } = makeRefs();
    renderHook(() => useCameraViews({ cameraRef, cameraControlsRef }));

    dispatchKeyZ({ metaKey: true });

    expect(zoomListener).not.toHaveBeenCalled();
  });
});
