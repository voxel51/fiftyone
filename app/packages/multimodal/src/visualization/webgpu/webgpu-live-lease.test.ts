import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WEBGPU_DEVICE_BUDGET,
  registerGraphicsRenderer,
  resetGraphicsRendererRegistryForTests,
} from "./graphics-renderer-registry";
import {
  GRID_LIVE_RENDERER_CAP,
  acquireGridLiveLease,
  gridLiveLeaseStats,
  resetGridLiveLeasesForTests,
} from "./webgpu-live-lease";

beforeEach(() => {
  resetGridLiveLeasesForTests();
  resetGraphicsRendererRegistryForTests();
});

afterEach(() => {
  resetGridLiveLeasesForTests();
  resetGraphicsRendererRegistryForTests();
  vi.restoreAllMocks();
});

/** Reserves `count` possible WebGPU devices while fake renderers initialize. */
function fillDeviceRegistry(count: number) {
  return Array.from({ length: count }, () =>
    registerGraphicsRenderer("modal-3d", "auto"),
  );
}

describe("webgpu-live-lease", () => {
  it("grants leases while under the cap", () => {
    const first = acquireGridLiveLease("cell-a", vi.fn());
    const second = acquireGridLiveLease("cell-b", vi.fn());

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(gridLiveLeaseStats()).toEqual({
      active: 2,
      cap: GRID_LIVE_RENDERER_CAP,
      denied: 0,
      granted: 2,
      revoked: 0,
    });
  });

  it("steals the oldest lease at cap and grants the new holder", () => {
    const onRevokedA = vi.fn();
    const onRevokedB = vi.fn();
    const onRevokedC = vi.fn();
    acquireGridLiveLease("cell-a", onRevokedA);
    acquireGridLiveLease("cell-b", onRevokedB);

    const third = acquireGridLiveLease("cell-c", onRevokedC);

    expect(third).not.toBeNull();
    expect(onRevokedA).toHaveBeenCalledTimes(1);
    expect(onRevokedB).not.toHaveBeenCalled();
    expect(onRevokedC).not.toHaveBeenCalled();
    expect(gridLiveLeaseStats()).toMatchObject({
      active: 2,
      granted: 3,
      revoked: 1,
    });
  });

  it("refreshes recency on re-acquire so the steal skips the refreshed holder", () => {
    const onRevokedA = vi.fn();
    const onRevokedB = vi.fn();
    const first = acquireGridLiveLease("cell-a", onRevokedA);
    acquireGridLiveLease("cell-b", onRevokedB);

    // Same holder re-acquires: same lease back, no new grant counted.
    const again = acquireGridLiveLease("cell-a", onRevokedA);
    expect(again).toBe(first);
    expect(gridLiveLeaseStats()).toMatchObject({ active: 2, granted: 2 });

    // At cap, the steal now takes cell-b — cell-a's recency was refreshed.
    acquireGridLiveLease("cell-c", vi.fn());
    expect(onRevokedB).toHaveBeenCalledTimes(1);
    expect(onRevokedA).not.toHaveBeenCalled();
  });

  it("uses the latest revoke callback after a re-acquire", () => {
    const staleCallback = vi.fn();
    const freshCallback = vi.fn();
    acquireGridLiveLease("cell-a", staleCallback);
    acquireGridLiveLease("cell-b", vi.fn());
    acquireGridLiveLease("cell-a", freshCallback);

    // cell-c steals cell-b (oldest), then cell-d steals cell-a.
    acquireGridLiveLease("cell-c", vi.fn());
    acquireGridLiveLease("cell-d", vi.fn());

    expect(staleCallback).not.toHaveBeenCalled();
    expect(freshCallback).toHaveBeenCalledTimes(1);
  });

  it("releases idempotently", () => {
    const lease = acquireGridLiveLease("cell-a", vi.fn());
    acquireGridLiveLease("cell-b", vi.fn());

    lease?.release();
    lease?.release();
    lease?.release();

    expect(gridLiveLeaseStats()).toMatchObject({ active: 1, revoked: 0 });
  });

  it("lets a holder re-acquire after releasing", () => {
    const first = acquireGridLiveLease("cell-a", vi.fn());
    first?.release();
    expect(gridLiveLeaseStats()).toMatchObject({ active: 0, granted: 1 });

    const second = acquireGridLiveLease("cell-a", vi.fn());
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(gridLiveLeaseStats()).toMatchObject({ active: 1, granted: 2 });
  });

  it("treats a revoked lease's release as a no-op", () => {
    const onRevokedA = vi.fn();
    const revokedLease = acquireGridLiveLease("cell-a", onRevokedA);
    acquireGridLiveLease("cell-b", vi.fn());
    acquireGridLiveLease("cell-c", vi.fn());
    expect(onRevokedA).toHaveBeenCalledTimes(1);

    // The stolen holder's cleanup still runs release(); it must not
    // disturb the live holders.
    revokedLease?.release();
    expect(gridLiveLeaseStats()).toMatchObject({ active: 2, revoked: 1 });

    // And the LRU order is intact: the next steal takes cell-b.
    const onRevokedB = vi.fn();
    acquireGridLiveLease("cell-b", onRevokedB);
    acquireGridLiveLease("cell-d", vi.fn());
    expect(onRevokedB).not.toHaveBeenCalled();
  });

  it("keeps granting to the newest holder even if a revoke callback throws", () => {
    acquireGridLiveLease("cell-a", () => {
      throw new Error("holder fallback failed");
    });
    acquireGridLiveLease("cell-b", vi.fn());

    const third = acquireGridLiveLease("cell-c", vi.fn());
    expect(third).not.toBeNull();
    expect(gridLiveLeaseStats()).toMatchObject({ active: 2, revoked: 1 });
  });

  it("denies a fresh acquire at the device budget and steals nothing", () => {
    const onRevokedA = vi.fn();
    const onRevokedB = vi.fn();
    const leaseA = acquireGridLiveLease("cell-a", onRevokedA);
    const leaseB = acquireGridLiveLease("cell-b", onRevokedB);
    // The page reaches the device budget (say, a heavy modal layout).
    const registrations = fillDeviceRegistry(WEBGPU_DEVICE_BUDGET);

    const denied = acquireGridLiveLease("cell-c", vi.fn());

    // Denied BEFORE the steal: null grant, denied counted, and the two
    // existing holders are untouched — a denied acquire never evicts.
    expect(denied).toBeNull();
    expect(onRevokedA).not.toHaveBeenCalled();
    expect(onRevokedB).not.toHaveBeenCalled();
    expect(gridLiveLeaseStats()).toEqual({
      active: 2,
      cap: GRID_LIVE_RENDERER_CAP,
      denied: 1,
      granted: 2,
      revoked: 0,
    });

    // The active set is unchanged: both holders still own their original
    // leases (idempotent re-acquire hands the same objects back, and is
    // itself never denied — the holder already owns its device).
    expect(acquireGridLiveLease("cell-a", onRevokedA)).toBe(leaseA);
    expect(acquireGridLiveLease("cell-b", onRevokedB)).toBe(leaseB);
    expect(gridLiveLeaseStats()).toMatchObject({ denied: 1, granted: 2 });

    // Back under budget, the same acquire is granted (stealing resumes:
    // cell-a is the LRU holder after the refresh order above).
    registrations[0].release();
    expect(acquireGridLiveLease("cell-c", vi.fn())).not.toBeNull();
    expect(onRevokedA).toHaveBeenCalledTimes(1);
  });

  it("denies under-cap acquires too when the budget is exhausted", () => {
    // Even with zero live grid cells, an at-budget page grants nothing.
    fillDeviceRegistry(WEBGPU_DEVICE_BUDGET);

    expect(acquireGridLiveLease("cell-a", vi.fn())).toBeNull();
    expect(gridLiveLeaseStats()).toEqual({
      active: 0,
      cap: GRID_LIVE_RENDERER_CAP,
      denied: 1,
      granted: 0,
      revoked: 0,
    });
  });

  it("never exceeds the cap across a long acquire sweep", () => {
    for (let index = 0; index < 10; index += 1) {
      acquireGridLiveLease(`cell-${index}`, vi.fn());
      expect(gridLiveLeaseStats().active).toBeLessThanOrEqual(
        GRID_LIVE_RENDERER_CAP,
      );
    }

    expect(gridLiveLeaseStats()).toEqual({
      active: GRID_LIVE_RENDERER_CAP,
      cap: GRID_LIVE_RENDERER_CAP,
      denied: 0,
      granted: 10,
      revoked: 10 - GRID_LIVE_RENDERER_CAP,
    });
  });
});
