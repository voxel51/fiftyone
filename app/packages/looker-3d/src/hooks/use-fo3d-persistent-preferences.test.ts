import { act, renderHook } from "@testing-library/react-hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFo3dPersistentPreferences } from "./use-fo3d-persistent-preferences";

const storage = vi.hoisted(() => ({
  autoRotateSetter: vi.fn(),
  pointCloudSetter: vi.fn(),
  splatSetter: vi.fn(),
  splatValue: null as unknown,
  useBrowserStorage: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  useBrowserStorage: (key: string, defaultValue: unknown) => {
    storage.useBrowserStorage(key, defaultValue);

    if (key === "fo3dAutoRotate") {
      return [false, storage.autoRotateSetter];
    }
    if (key === "fo3d-pointCloudSettings") {
      return [defaultValue, storage.pointCloudSetter];
    }

    return [storage.splatValue ?? defaultValue, storage.splatSetter];
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  storage.splatValue = null;
});

describe("useFo3dPersistentPreferences", () => {
  it("uses a versioned key and normalizes malformed splat settings", () => {
    storage.splatValue = {
      detail: "ultra",
      sharpness: 50,
      sorting: "random",
      maxSh: 7,
    };

    const { result } = renderHook(() => useFo3dPersistentPreferences());

    expect(storage.useBrowserStorage).toHaveBeenCalledWith(
      "fo3d-splatSettings:v1",
      expect.any(Object),
    );
    expect(result.current.splatSettings).toEqual({
      detail: "low",
      sharpness: 2,
      sorting: "stable",
      maxSh: 0,
    });
  });

  it("normalizes functional preference updates before storing them", () => {
    const { result } = renderHook(() => useFo3dPersistentPreferences());

    act(() => {
      result.current.setSplatSettings((previous) => ({
        ...previous,
        detail: "high",
        sharpness: 1.6,
      }));
    });

    const update = storage.splatSetter.mock.calls[0][0] as (
      previous: unknown,
    ) => unknown;
    expect(update({ sorting: "accurate", maxSh: 1 })).toEqual({
      detail: "high",
      sharpness: 1.6,
      sorting: "accurate",
      maxSh: 1,
    });
  });
});
