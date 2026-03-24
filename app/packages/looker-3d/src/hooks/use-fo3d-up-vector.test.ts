import { act, renderHook } from "@testing-library/react-hooks";
import { Vector3 } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoScene } from "../fo3d/render-types";
import { useFo3dUpVector } from "./use-fo3d-up-vector";

const storageState = vi.hoisted(() => ({
  localUpVector: null as Vector3 | null,
  sessionUpVector: null as Vector3 | null,
  localSetter: vi.fn(),
  sessionSetter: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  useBrowserStorage: vi.fn(
    (_key: string, _initialValue: unknown, useSessionStorage: boolean) =>
      useSessionStorage
        ? [storageState.sessionUpVector, storageState.sessionSetter]
        : [storageState.localUpVector, storageState.localSetter]
  ),
}));

const buildScene = (up?: string | null) =>
  ({
    cameraProps: {
      up,
    },
  } as FoScene);

describe("useFo3dUpVector", () => {
  beforeEach(() => {
    storageState.localUpVector = null;
    storageState.sessionUpVector = null;
    storageState.localSetter.mockReset();
    storageState.sessionSetter.mockReset();
  });

  it("prefers the scene-authored up axis over stale session storage", () => {
    storageState.sessionUpVector = new Vector3(1, 0, 0);

    const { result } = renderHook(() =>
      useFo3dUpVector(buildScene("Y"), undefined)
    );

    expect(result.current[0].equals(new Vector3(0, 1, 0))).toBe(true);
  });

  it("normalizes stale session storage back to the scene-authored up axis", () => {
    const staleUpVector = new Vector3(1, 0, 0);
    storageState.sessionUpVector = staleUpVector;

    renderHook(() => useFo3dUpVector(buildScene("Y"), undefined));

    expect(storageState.sessionSetter).toHaveBeenCalledTimes(1);
    expect(storageState.localSetter).not.toHaveBeenCalled();

    const updateSessionUpVector = storageState.sessionSetter.mock.calls[0][0];
    expect(typeof updateSessionUpVector).toBe("function");

    const normalizedUpVector = updateSessionUpVector(staleUpVector);
    expect(normalizedUpVector.equals(new Vector3(0, 1, 0))).toBe(true);
  });

  it("preserves the stored local up vector when the scene has no authored axis", () => {
    storageState.localUpVector = new Vector3(-1, 0, 0);

    const { result } = renderHook(() =>
      useFo3dUpVector(buildScene(undefined), undefined)
    );

    expect(result.current[0].equals(new Vector3(-1, 0, 0))).toBe(true);
  });

  it("writes manual updates to scene-scoped storage when the scene defines an up axis", () => {
    const nextUpVector = new Vector3(0, 0, 1);

    const { result } = renderHook(() =>
      useFo3dUpVector(buildScene("Y"), undefined)
    );

    storageState.sessionSetter.mockClear();
    storageState.localSetter.mockClear();

    act(() => {
      result.current[1](nextUpVector);
    });

    expect(storageState.sessionSetter).toHaveBeenCalledTimes(1);
    expect(storageState.localSetter).not.toHaveBeenCalled();

    const updateSessionUpVector = storageState.sessionSetter.mock.calls[0][0];
    expect(typeof updateSessionUpVector).toBe("function");
    expect(updateSessionUpVector(null)).toBe(nextUpVector);
  });

  it("writes manual updates to local storage when the scene has no authored axis", () => {
    const nextUpVector = new Vector3(0, 0, -1);

    const { result } = renderHook(() =>
      useFo3dUpVector(buildScene(undefined), undefined)
    );

    storageState.sessionSetter.mockClear();
    storageState.localSetter.mockClear();

    act(() => {
      result.current[1](nextUpVector);
    });

    expect(storageState.localSetter).toHaveBeenCalledTimes(1);
    expect(storageState.sessionSetter).not.toHaveBeenCalled();

    const updateLocalUpVector = storageState.localSetter.mock.calls[0][0];
    expect(typeof updateLocalUpVector).toBe("function");
    expect(updateLocalUpVector(null)).toBe(nextUpVector);
  });
});
