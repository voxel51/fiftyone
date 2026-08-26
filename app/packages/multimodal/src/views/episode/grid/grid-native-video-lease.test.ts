import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GRID_NATIVE_VIDEO_CAP,
  gridNativeVideoLeaseStats,
  requestGridNativeVideoLease,
  resetGridNativeVideoLeasesForTests,
} from "./grid-native-video-lease";

afterEach(() => {
  resetGridNativeVideoLeasesForTests();
});

describe("grid native video leases", () => {
  it("queues poster captures behind the bounded active set", () => {
    const grants = [vi.fn(), vi.fn(), vi.fn()];
    const first = requestGridNativeVideoLease(
      "first",
      "poster",
      grants[0],
      vi.fn(),
    );
    requestGridNativeVideoLease("second", "poster", grants[1], vi.fn());
    requestGridNativeVideoLease("third", "poster", grants[2], vi.fn());

    expect(grants.map((grant) => grant.mock.calls.length)).toEqual([1, 1, 0]);
    expect(gridNativeVideoLeaseStats()).toEqual({
      active: GRID_NATIVE_VIDEO_CAP,
      cap: GRID_NATIVE_VIDEO_CAP,
      pending: 1,
    });

    first.release();
    expect(grants[2]).toHaveBeenCalledOnce();
    expect(gridNativeVideoLeaseStats()).toMatchObject({
      active: 2,
      pending: 0,
    });
  });

  it("lets playback revoke the oldest active poster capture", () => {
    const firstRevoked = vi.fn();
    requestGridNativeVideoLease("first", "poster", vi.fn(), firstRevoked);
    requestGridNativeVideoLease("second", "poster", vi.fn(), vi.fn());
    const playGranted = vi.fn();

    const playback = requestGridNativeVideoLease(
      "playing",
      "playing",
      playGranted,
      vi.fn(),
    );

    expect(firstRevoked).toHaveBeenCalledOnce();
    expect(playGranted).toHaveBeenCalledOnce();
    expect(gridNativeVideoLeaseStats()).toMatchObject({
      active: 2,
      pending: 1,
    });

    playback.release();
    expect(gridNativeVideoLeaseStats()).toMatchObject({
      active: 2,
      pending: 0,
    });
  });

  it("keeps playback queued when every active lease is interactive", () => {
    requestGridNativeVideoLease("first", "playing", vi.fn(), vi.fn());
    requestGridNativeVideoLease("second", "playing", vi.fn(), vi.fn());
    const thirdGranted = vi.fn();
    requestGridNativeVideoLease("third", "playing", thirdGranted, vi.fn());

    expect(thirdGranted).not.toHaveBeenCalled();
    expect(gridNativeVideoLeaseStats()).toMatchObject({
      active: 2,
      pending: 1,
    });
  });
});
