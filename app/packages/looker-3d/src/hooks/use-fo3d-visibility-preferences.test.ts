import { act, renderHook } from "@testing-library/react-hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoScene, FoSceneNode } from "../fo3d/render-types";
import { useFo3dVisibilityPreferences } from "./use-fo3d-visibility-preferences";

const storageState = vi.hoisted(() => ({
  visibility: {} as Record<string, boolean>,
  setter: vi.fn(
    (
      updater:
        | Record<string, boolean>
        | ((previous: Record<string, boolean>) => Record<string, boolean>),
    ) => {
      storageState.visibility =
        typeof updater === "function"
          ? updater(storageState.visibility)
          : updater;
    },
  ),
}));

vi.mock("@fiftyone/state", () => ({
  useBrowserStorage: vi.fn(() => [
    storageState.visibility,
    storageState.setter,
  ]),
}));

const node = (
  name: string,
  visible: boolean,
  children: FoSceneNode[] = [],
): FoSceneNode => ({ name, visible, children }) as FoSceneNode;

const sceneOf = (children: FoSceneNode[]) => ({ children }) as FoScene;

describe("useFo3dVisibilityPreferences", () => {
  beforeEach(() => {
    storageState.visibility = {};
    storageState.setter.mockClear();
  });

  it("does not persist untouched authored defaults", () => {
    const scene = sceneOf([node("pointcloud", true), node("mesh", false)]);
    const { result } = renderHook(() => useFo3dVisibilityPreferences(scene));

    act(() => {
      result.current.persistVisibility({ pointcloud: true, mesh: false });
    });

    expect(storageState.visibility).toEqual({});
  });

  it("persists only the node a user actually toggled", () => {
    const scene = sceneOf([node("pointcloud", true), node("mesh", false)]);
    const { result } = renderHook(() => useFo3dVisibilityPreferences(scene));

    act(() => {
      // user hides the point cloud; mesh is untouched at its authored default
      result.current.persistVisibility({ pointcloud: false, mesh: false });
    });

    expect(storageState.visibility).toEqual({ pointcloud: false });
  });

  it("removes a saved override once toggled back to the authored default", () => {
    storageState.visibility = { pointcloud: false };

    const scene = sceneOf([node("pointcloud", true)]);
    const { result } = renderHook(() => useFo3dVisibilityPreferences(scene));

    act(() => {
      result.current.persistVisibility({ pointcloud: true });
    });

    expect(storageState.visibility).toEqual({});
  });

  it("does not let a stale override from a differently-authored scene leak in", () => {
    // Regression: previously every seeded control value (including untouched
    // authored defaults) was written to storage, so a node name reused across
    // scenes with different authored defaults would incorrectly inherit the
    // first scene's default.
    const sceneA = sceneOf([node("pointcloud", false)]);
    const { result: resultA } = renderHook(() =>
      useFo3dVisibilityPreferences(sceneA),
    );

    act(() => {
      // mount-time seed matches the authored default -- nothing to persist
      resultA.current.persistVisibility({ pointcloud: false });
    });

    expect(storageState.visibility).toEqual({});

    const sceneB = sceneOf([node("pointcloud", true)]);
    const { result: resultB } = renderHook(() =>
      useFo3dVisibilityPreferences(sceneB),
    );

    expect(resultB.current.visibilitySchema).toEqual({ pointcloud: true });
  });
});
