import { act, cleanup, renderHook } from "@testing-library/react";
import type { ThreeEvent } from "@react-three/fiber";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
  isScenePrimarySelection,
  useSceneHoverLifecycle,
} from "./use-scene-object-interaction";

afterEach(() => {
  cleanup();
  document.body.style.cursor = "";
});

describe("scene object interaction", () => {
  it("keeps overlapping targets active until each target's final hit leaves", () => {
    const onEnter = vi.fn<(target: string) => void>();
    const onLeave = vi.fn();
    const { result } = renderHook(() =>
      useSceneHoverLifecycle({
        enabled: true,
        keyForTarget: (target: string) => target,
        onEnter,
        onLeave,
      }),
    );
    const front = pointerEvent(new THREE.Object3D(), { index: 0 });
    const rear = pointerEvent(new THREE.Object3D(), { index: 0 });

    act(() => {
      result.current.onPointerOver(front, "front");
      result.current.onPointerOver(rear, "rear");
    });
    expect(onEnter.mock.calls.map(([target]) => target)).toEqual([
      "front",
      "rear",
    ]);
    expect(document.body.style.cursor).toBe("pointer");

    act(() => {
      result.current.onPointerOut(front);
    });
    expect(onLeave).toHaveBeenLastCalledWith("front", "pointer");
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(document.body.style.cursor).toBe("pointer");

    act(() => {
      result.current.onPointerOut(rear);
    });
    expect(onLeave).toHaveBeenLastCalledWith("rear", "pointer");
    expect(document.body.style.cursor).toBe("");
  });

  it("shares cursor ownership across independent scene layers", () => {
    document.body.style.cursor = "crosshair";
    const { result } = renderHook(() => {
      const options = {
        enabled: true,
        keyForTarget: (target: string) => target,
        onEnter: () => undefined,
        onLeave: () => undefined,
      };
      return {
        entity: useSceneHoverLifecycle(options),
        frustum: useSceneHoverLifecycle(options),
      };
    });
    const entity = pointerEvent(new THREE.Object3D());
    const frustum = pointerEvent(new THREE.Object3D());

    act(() => {
      result.current.entity.onPointerOver(entity, "entity");
      result.current.frustum.onPointerOver(frustum, "frustum");
      result.current.entity.onPointerOut(entity);
    });
    expect(document.body.style.cursor).toBe("pointer");

    act(() => {
      result.current.frustum.onPointerOut(frustum);
    });
    expect(document.body.style.cursor).toBe("crosshair");
  });

  it("clears hover once when picking is disabled or the layer unmounts", () => {
    const onLeave = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) =>
        useSceneHoverLifecycle({
          enabled,
          keyForTarget: (target: string) => target,
          onEnter: () => undefined,
          onLeave,
        }),
      { initialProps: { enabled: true } },
    );
    const first = pointerEvent(new THREE.Object3D());

    act(() => {
      result.current.onPointerOver(first, "first");
    });
    rerender({ enabled: false });
    expect(onLeave).toHaveBeenLastCalledWith("first", "disabled");

    rerender({ enabled: true });
    const second = pointerEvent(new THREE.Object3D());
    act(() => {
      result.current.onPointerOver(second, "second");
    });
    unmount();
    expect(onLeave).toHaveBeenLastCalledWith("second", "unmount");
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it("selects only primary-button clicks within the established drag tolerance", () => {
    expect(isScenePrimarySelection(clickEvent({ button: 0, delta: 4 }))).toBe(
      true,
    );
    expect(isScenePrimarySelection(clickEvent({ button: 0, delta: 5 }))).toBe(
      false,
    );
    expect(isScenePrimarySelection(clickEvent({ button: 1, delta: 0 }))).toBe(
      false,
    );
    expect(isScenePrimarySelection(clickEvent({ button: 2, delta: 0 }))).toBe(
      false,
    );
  });
});

function pointerEvent(
  object: THREE.Object3D,
  overrides: { readonly index?: number; readonly instanceId?: number } = {},
): ThreeEvent<PointerEvent> {
  return {
    ...overrides,
    object,
  } as unknown as ThreeEvent<PointerEvent>;
}

function clickEvent({
  button,
  delta,
}: {
  readonly button: number;
  readonly delta: number;
}): ThreeEvent<MouseEvent> {
  return {
    delta,
    nativeEvent: { button },
  } as ThreeEvent<MouseEvent>;
}
