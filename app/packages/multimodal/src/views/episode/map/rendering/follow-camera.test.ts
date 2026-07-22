import { describe, expect, it, vi } from "vitest";

import { createFollowCameraState, updateFollowCamera } from "./follow-camera";

describe("map follow camera", () => {
  it("follows meaningful movement, throttles, and respects recenter guards", () => {
    const jumpTo = vi.fn();
    const map = {
      getCenter: vi.fn(() => ({ lat: 0, lng: 0 })),
      jumpTo,
      project: vi.fn(
        (value: { lat: number; lng: number } | [number, number]) =>
          Array.isArray(value)
            ? { x: value[0] * 10, y: value[1] * 10 }
            : { x: value.lng * 10, y: value.lat * 10 },
      ),
    } as never;
    const state = createFollowCameraState();
    const suppressViewportWrite = { current: false };
    const common = {
      cameraReady: true,
      current: { latitude: 2, longitude: 3, timeNs: 0n },
      enabled: true,
      map,
      recenterGuardUntil: 0,
      state,
      suppressViewportWrite,
    } as const;

    updateFollowCamera({ ...common, nowMs: 100 });
    updateFollowCamera({ ...common, nowMs: 110 });
    updateFollowCamera({ ...common, nowMs: 1_000, recenterGuardUntil: 1_100 });

    expect(jumpTo).toHaveBeenCalledOnce();
    expect(jumpTo).toHaveBeenCalledWith({ center: [3, 2] });
    expect(suppressViewportWrite.current).toBe(false);
  });
});
