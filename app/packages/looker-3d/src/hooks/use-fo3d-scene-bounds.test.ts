import { renderHook } from "@testing-library/react-hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFo3dSceneBounds } from "./use-fo3d-scene-bounds";

const useFo3dBoundsMock = vi.hoisted(() => vi.fn());

vi.mock("./use-bounds", () => ({
  useFo3dBounds: (...args: unknown[]) => useFo3dBoundsMock(...args),
}));

describe("useFo3dSceneBounds", () => {
  beforeEach(() => {
    useFo3dBoundsMock.mockReset();
    useFo3dBoundsMock.mockReturnValue({
      boundingBox: null,
      recomputeBounds: vi.fn(),
      isComputing: false,
    });
  });

  it("starts bounds polling once the scene exists and is no longer actively loading", () => {
    const assetsGroupRef = { current: null };

    const { rerender } = renderHook(
      ({ isThreeJsLoading }: { isThreeJsLoading: boolean }) =>
        useFo3dSceneBounds({
          assetsGroupRef,
          foScene: {} as never,
          isParsingFo3d: false,
          rootAssetCount: 1,
          isThreeJsLoading,
        }),
      {
        initialProps: { isThreeJsLoading: true },
      }
    );

    expect(useFo3dBoundsMock.mock.calls[0][1]).toBe(false);

    rerender({ isThreeJsLoading: false });

    expect(useFo3dBoundsMock.mock.calls[1][1]).toBe(true);
  });
});
