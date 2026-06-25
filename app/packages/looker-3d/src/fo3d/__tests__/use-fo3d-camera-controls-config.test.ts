import { act, renderHook } from "@testing-library/react-hooks";
import type { RefObject } from "react";
import { MOUSE, Vector3 } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFo3dCameraControlsConfig } from "../../hooks/use-fo3d-camera-controls-config";
import type { Fo3dCameraControls } from "../camera-controls";

const recoilMocks = vi.hoisted(() => ({
  values: new Map<string, boolean>(),
  setPointCropModifierPressed: vi.fn(),
}));

vi.mock("@fiftyone/state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useEventHandler: (
      target: EventTarget | undefined,
      eventType: string,
      handler: EventListener
    ) => {
      React.useEffect(() => {
        target?.addEventListener(eventType, handler);

        return () => {
          target?.removeEventListener(eventType, handler);
        };
      }, [target, eventType, handler]);
    },
  };
});

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");

  return {
    ...actual,
    useRecoilValue: (atom: { key?: string }) =>
      recoilMocks.values.get(atom.key ?? "") ?? false,
    useSetRecoilState: () => recoilMocks.setPointCropModifierPressed,
  };
});

type TestControls = Fo3dCameraControls & {
  domElement: HTMLElement;
};

const makeControls = () => {
  const controls = {
    enableRotate: true,
    enablePan: true,
    enableZoom: true,
    enabled: true,
    mouseButtons: {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    },
    target: new Vector3(),
    update: vi.fn(),
  } as unknown as TestControls;

  return {
    controls,
    cameraControlsRef: { current: controls } as RefObject<Fo3dCameraControls>,
  };
};

describe("useFo3dCameraControlsConfig", () => {
  beforeEach(() => {
    recoilMocks.values.clear();
    recoilMocks.setPointCropModifierPressed.mockClear();
  });

  it("maps modifiers without letting cmd-left drag pan", () => {
    const { controls, cameraControlsRef } = makeControls();

    renderHook(() => useFo3dCameraControlsConfig({ cameraControlsRef }));

    expect(controls.mouseButtons.LEFT).toBe(MOUSE.ROTATE);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "ShiftLeft" })
      );
    });
    expect(controls.mouseButtons.LEFT).toBe(MOUSE.ROTATE);
    expect(recoilMocks.setPointCropModifierPressed).toHaveBeenLastCalledWith(
      true
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "ShiftLeft" }));
    });
    expect(controls.mouseButtons.LEFT).toBe(MOUSE.ROTATE);
    expect(recoilMocks.setPointCropModifierPressed).toHaveBeenLastCalledWith(
      false
    );

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "ControlLeft" })
      );
    });
    expect(controls.mouseButtons.LEFT).toBe(MOUSE.DOLLY);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keyup", { code: "ControlLeft" })
      );
    });
    expect(controls.mouseButtons.LEFT).toBe(MOUSE.ROTATE);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "MetaLeft" })
      );
    });
    expect(controls.mouseButtons.LEFT).toBe(MOUSE.PAN);
    expect(recoilMocks.setPointCropModifierPressed).toHaveBeenLastCalledWith(
      true
    );

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "ShiftLeft" })
      );
    });
    expect(controls.mouseButtons.LEFT).toBe(MOUSE.ROTATE);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "MetaLeft" }));
    });
    expect(controls.mouseButtons.LEFT).toBe(MOUSE.ROTATE);
    expect(recoilMocks.setPointCropModifierPressed).toHaveBeenLastCalledWith(
      true
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "ShiftLeft" }));
    });
    expect(recoilMocks.setPointCropModifierPressed).toHaveBeenLastCalledWith(
      false
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "AltLeft" }));
    });
    expect(controls.mouseButtons.LEFT).toBe(MOUSE.ROTATE);
    expect(recoilMocks.setPointCropModifierPressed).toHaveBeenLastCalledWith(
      true
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "AltLeft" }));
    });
    expect(recoilMocks.setPointCropModifierPressed).toHaveBeenLastCalledWith(
      false
    );
  });

  it.each([
    "fo3d-isSegmentingPointerDownAtom",
    "fo3d-isCreatingCuboidPointerDownAtom",
    "fo3d-isCurrentlyTransformingAtom",
  ])(
    "keeps wheel zoom while annotation interactions own drags for %s",
    (key) => {
      recoilMocks.values.set(key, true);
      const { controls, cameraControlsRef } = makeControls();
      controls.mouseButtons.LEFT = MOUSE.DOLLY;

      renderHook(() => useFo3dCameraControlsConfig({ cameraControlsRef }));

      expect(controls.enabled).toBe(true);
      expect(controls.enableZoom).toBe(true);
      expect(controls.enableRotate).toBe(false);
      expect(controls.enablePan).toBe(false);
      expect(controls.mouseButtons.LEFT).toBe(MOUSE.ROTATE);
    }
  );

  it("restores drag navigation after annotation interactions release controls", () => {
    recoilMocks.values.set("fo3d-isCurrentlyTransformingAtom", true);
    const { controls, cameraControlsRef } = makeControls();
    const { rerender } = renderHook(() =>
      useFo3dCameraControlsConfig({ cameraControlsRef })
    );

    expect(controls.enableRotate).toBe(false);
    expect(controls.enablePan).toBe(false);

    recoilMocks.values.set("fo3d-isCurrentlyTransformingAtom", false);
    rerender();

    expect(controls.enabled).toBe(true);
    expect(controls.enableZoom).toBe(true);
    expect(controls.enableRotate).toBe(true);
    expect(controls.enablePan).toBe(true);
    expect(controls.mouseButtons.LEFT).toBe(MOUSE.ROTATE);
  });
});
