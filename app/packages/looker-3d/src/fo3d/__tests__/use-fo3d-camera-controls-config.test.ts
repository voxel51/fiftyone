import { act, renderHook } from "@testing-library/react-hooks";
import type { RefObject } from "react";
import { MOUSE, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { useFo3dCameraControlsConfig } from "../../hooks/use-fo3d-camera-controls-config";
import type { Fo3dCameraControls } from "../camera-controls";

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
    useRecoilValue: () => false,
    useSetRecoilState: () => () => undefined,
  };
});

type TestControls = Fo3dCameraControls & {
  domElement: HTMLElement;
};

const makeControls = () => {
  const controls = {
    enablePan: true,
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

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "ShiftLeft" }));
    });
    expect(controls.mouseButtons.LEFT).toBe(MOUSE.ROTATE);

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
  });
});
