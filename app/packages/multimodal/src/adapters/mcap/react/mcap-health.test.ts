import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MCAP_NOTICE_APPEARANCE_FLOOR_MS,
  MCAP_NOTICE_DISAPPEAR_LINGER_MS,
  buildMcap3dPlacementNotices,
  buildMcap3dTransformNotices,
  buildMcapCameraTargetNotice,
  buildMcapTileEmptyStateModel,
  buildMcapTileStreamNotice,
  createMcapNoticeStabilizer,
  useStabilizedMcapNotices,
  type McapHealthNotice,
} from "./mcap-health";

const NO_PLACEMENT_IDS = {
  pendingAnnotationFrameIds: [],
  pendingFrustumFrameIds: [],
  pendingGridFrameIds: [],
  provisionalFrameIds: [],
} as const;

const NO_TRANSFORM_CONDITIONS = {
  clampedFrameIds: [],
  frameTransformsError: null,
  largeInterpolationGaps: [],
  unresolvedFrameIds: [],
  worldFrameId: "map",
} as const;

describe("buildMcap3dPlacementNotices", () => {
  it("returns nothing while no placement is pending", () => {
    expect(buildMcap3dPlacementNotices(NO_PLACEMENT_IDS)).toEqual([]);
  });

  it("builds the placement-loading quartet with frame ids in detail", () => {
    const notices = buildMcap3dPlacementNotices({
      pendingAnnotationFrameIds: ["base_link"],
      pendingFrustumFrameIds: ["cam_front", "cam_back"],
      pendingGridFrameIds: ["map"],
      provisionalFrameIds: ["lidar_top", "radar_front"],
    });

    expect(notices).toEqual([
      {
        detail: "Displaying source-frame preview for lidar_top, radar_front",
        id: "placement:provisional",
        message: "Positioning transforms loading",
        scope: "scene",
        severity: "info",
      },
      {
        detail: "Hiding boxes in base_link",
        id: "placement:pending-annotations",
        message: "Annotation transforms loading",
        scope: "scene",
        severity: "info",
      },
      {
        detail: "Hiding grids in map",
        id: "placement:pending-grids",
        message: "Map layer transforms loading",
        scope: "scene",
        severity: "info",
      },
      {
        detail: "Hiding frustums in cam_front, cam_back",
        id: "placement:pending-frustums",
        message: "Camera transforms loading",
        scope: "scene",
        severity: "info",
      },
    ]);
  });
});

describe("buildMcap3dTransformNotices", () => {
  it("returns nothing when transforms resolve cleanly", () => {
    expect(buildMcap3dTransformNotices(NO_TRANSFORM_CONDITIONS)).toEqual([]);
  });

  it("short-circuits everything else on a window fetch failure", () => {
    const notices = buildMcap3dTransformNotices({
      ...NO_TRANSFORM_CONDITIONS,
      frameTransformsError: "network unreachable",
      unresolvedFrameIds: ["radar_front"],
    });

    expect(notices).toEqual([
      {
        detail: "network unreachable",
        id: "transform:failed",
        message: "Frame transforms failed to load",
        scope: "scene",
        severity: "error",
      },
    ]);
  });

  it("returns nothing before a world frame is selected", () => {
    expect(
      buildMcap3dTransformNotices({
        ...NO_TRANSFORM_CONDITIONS,
        unresolvedFrameIds: ["radar_front"],
        worldFrameId: "",
      }),
    ).toEqual([]);
  });

  it("reports missing, clamped, and large-gap conditions per frame list", () => {
    const notices = buildMcap3dTransformNotices({
      clampedFrameIds: ["lidar_top"],
      frameTransformsError: null,
      largeInterpolationGaps: [
        { frameId: "lidar", gapNs: 2_300_000_000n },
        { frameId: "radar", gapNs: 250_000_000n },
      ],
      unresolvedFrameIds: ["radar_front"],
      worldFrameId: "map",
    });

    expect(notices).toEqual([
      {
        detail: "radar_front",
        id: "transform:missing",
        message: "Missing transform to map",
        scope: "scene",
        severity: "warning",
      },
      {
        detail: "lidar_top",
        id: "transform:clamped",
        message: "Using boundary-clamped transform to map",
        scope: "scene",
        severity: "info",
      },
      {
        detail: "lidar (2.3s), radar (250ms)",
        id: "transform:large-gap",
        message: "Interpolating transform across large gap to map",
        scope: "scene",
        severity: "warning",
      },
    ]);
  });
});

describe("buildMcapCameraTargetNotice", () => {
  const missingTarget = {
    cameraTargetFrameId: "base_link",
    cameraTargetStatus: "missing",
    trackingMode: "position",
    worldFrameId: "map",
  } as const;

  it("warns when a follow-mode target transform is missing", () => {
    expect(buildMcapCameraTargetNotice(missingTarget)).toEqual({
      detail: "base_link to map",
      id: "camera:target-unavailable",
      message: "Camera target transform unavailable",
      scope: "scene",
      severity: "warning",
    });
  });

  it("stays quiet outside follow modes", () => {
    expect(
      buildMcapCameraTargetNotice({ ...missingTarget, trackingMode: "free" }),
    ).toBeNull();
  });

  it("stays quiet while resolution is merely pending", () => {
    expect(
      buildMcapCameraTargetNotice({
        ...missingTarget,
        cameraTargetStatus: "pending",
      }),
    ).toBeNull();
  });

  it("stays quiet before both frames are selected", () => {
    expect(
      buildMcapCameraTargetNotice({ ...missingTarget, worldFrameId: "" }),
    ).toBeNull();
    expect(
      buildMcapCameraTargetNotice({
        ...missingTarget,
        cameraTargetFrameId: "",
      }),
    ).toBeNull();
  });
});

describe("buildMcapTileStreamNotice", () => {
  it("returns null while every topic is current", () => {
    expect(
      buildMcapTileStreamNotice({
        staleAges: [null, null],
        startTimes: [null, null],
        statuses: ["ready", "ready"],
      }),
    ).toBeNull();
  });

  it("summarizes buffering with an affected suffix on multi-source tiles", () => {
    expect(
      buildMcapTileStreamNotice({
        staleAges: [null, null],
        startTimes: [null, null],
        statuses: ["loading", "ready"],
      }),
    ).toEqual({
      id: "stream:loading",
      message: "Buffering (1/2)",
      scope: "tile",
      severity: "info",
      status: "loading",
    });
  });

  it("omits the suffix on single-source tiles", () => {
    expect(
      buildMcapTileStreamNotice({
        staleAges: [null],
        startTimes: [null],
        statuses: ["loading"],
      })?.message,
    ).toBe("Buffering");
  });

  it("rounds tiny gap starts up to the displayed centisecond", () => {
    expect(
      buildMcapTileStreamNotice({
        staleAges: [null],
        startTimes: [0.001],
        statuses: ["gap"],
      })?.message,
    ).toBe("No data until 0:00.01");
  });

  it("falls back to a generic gap message without a known start", () => {
    const notice = buildMcapTileStreamNotice({
      staleAges: [null],
      startTimes: [null],
      statuses: ["gap"],
    });
    expect(notice?.message).toBe("No data at this time");
    expect(notice?.severity).toBe("info");
  });

  it("describes the age of the oldest stale displayed frame", () => {
    expect(
      buildMcapTileStreamNotice({
        staleAges: [2_400_000_000n, null],
        startTimes: [null, null],
        statuses: ["stale", "ready"],
      }),
    ).toEqual({
      id: "stream:stale",
      message: "Displaying stale frame from 2.4s ago (1/2)",
      scope: "tile",
      severity: "warning",
      status: "stale",
    });
  });

  it("formats stale ages across ms, seconds, and minutes", () => {
    const messageForAge = (ageNs: bigint) =>
      buildMcapTileStreamNotice({
        staleAges: [ageNs],
        startTimes: [null],
        statuses: ["stale"],
      })?.message;

    expect(messageForAge(500_000_000n)).toBe(
      "Displaying stale frame from 500ms ago",
    );
    expect(messageForAge(15_000_000_000n)).toBe(
      "Displaying stale frame from 15s ago",
    );
    expect(messageForAge(90_000_000_000n)).toBe(
      "Displaying stale frame from 1m 30s ago",
    );
  });

  it("drops the age copy when no stale age is known", () => {
    expect(
      buildMcapTileStreamNotice({
        staleAges: [null],
        startTimes: [null],
        statuses: ["stale"],
      })?.message,
    ).toBe("Displaying stale frame");
  });

  it("summarizes failures as errors", () => {
    expect(
      buildMcapTileStreamNotice({
        staleAges: [null],
        startTimes: [null],
        statuses: ["failed"],
      }),
    ).toEqual({
      id: "stream:failed",
      message: "Failed to load",
      scope: "tile",
      severity: "error",
      status: "failed",
    });
  });

  it("orders severity: failed over loading over gap over stale", () => {
    expect(
      buildMcapTileStreamNotice({
        staleAges: [null, null, null, null],
        startTimes: [null, null, null, null],
        statuses: ["stale", "gap", "loading", "failed"],
      }),
    ).toMatchObject({ message: "Failed to load (1/4)", status: "failed" });
    expect(
      buildMcapTileStreamNotice({
        staleAges: [null, null, null],
        startTimes: [null, null, null],
        statuses: ["stale", "gap", "loading"],
      }),
    ).toMatchObject({ message: "Buffering (1/3)", status: "loading" });
    expect(
      buildMcapTileStreamNotice({
        staleAges: [null, null],
        startTimes: [null, null],
        statuses: ["stale", "gap"],
      }),
    ).toMatchObject({ status: "gap" });
  });
});

describe("buildMcapTileEmptyStateModel", () => {
  it("reports failure only once every topic has failed", () => {
    expect(
      buildMcapTileEmptyStateModel({
        startTimes: [null, null],
        statuses: ["failed", "failed"],
      }),
    ).toEqual({ kind: "failed", message: "Failed to load stream data" });
    expect(
      buildMcapTileEmptyStateModel({
        startTimes: [null, null],
        statuses: ["failed", "loading"],
      }),
    ).toEqual({ kind: "loading" });
  });

  it("prefers a spinner while anything is loading", () => {
    expect(
      buildMcapTileEmptyStateModel({
        startTimes: [null, null],
        statuses: ["gap", "loading"],
      }),
    ).toEqual({ kind: "loading" });
  });

  it("falls back to gap copy with the earliest known start", () => {
    expect(
      buildMcapTileEmptyStateModel({
        startTimes: [12, 30],
        statuses: ["gap", "gap"],
      }),
    ).toEqual({ kind: "gap", message: "No data until 0:12.00" });
    expect(
      buildMcapTileEmptyStateModel({
        startTimes: [null],
        statuses: ["gap"],
      }),
    ).toEqual({ kind: "gap", message: "No data at this time" });
  });
});

function testNotice(
  id: string,
  overrides: Partial<McapHealthNotice> = {},
): McapHealthNotice {
  return {
    id,
    message: `message for ${id}`,
    scope: "scene",
    severity: "warning",
    ...overrides,
  };
}

function createManualClock(startMs = 0) {
  let nowMs = startMs;
  return {
    advance(ms: number) {
      nowMs += ms;
    },
    now: () => nowMs,
  };
}

describe("createMcapNoticeStabilizer", () => {
  it("holds a new notice below the appearance floor, then shows it", () => {
    const clock = createManualClock();
    const stabilizer = createMcapNoticeStabilizer({ now: clock.now });
    const produced = [testNotice("transform:clamped")];

    expect(stabilizer.update(produced)).toEqual([]);
    clock.advance(MCAP_NOTICE_APPEARANCE_FLOOR_MS - 1);
    expect(stabilizer.update(produced)).toEqual([]);

    clock.advance(1);
    const visible = stabilizer.update(produced);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("transform:clamped");
  });

  it("returns the same array identity while the visible content holds", () => {
    const clock = createManualClock();
    const stabilizer = createMcapNoticeStabilizer({ now: clock.now });

    const emptyA = stabilizer.update([]);
    const emptyB = stabilizer.update([]);
    expect(emptyA).toBe(emptyB);

    stabilizer.update([testNotice("transform:clamped")]);
    clock.advance(MCAP_NOTICE_APPEARANCE_FLOOR_MS);
    // Fresh input arrays/objects with equal content must not change the
    // output identity: consumers re-render per playback tick.
    const first = stabilizer.update([testNotice("transform:clamped")]);
    clock.advance(50);
    expect(stabilizer.update([testNotice("transform:clamped")])).toBe(first);
  });

  it("shows a boundary-oscillating condition once and keeps it", () => {
    const clock = createManualClock();
    const stabilizer = createMcapNoticeStabilizer({ now: clock.now });
    const produced = [testNotice("transform:clamped")];

    let appearances = 0;
    let previouslyVisible = false;
    let firstVisibleAt: number | null = null;
    // The condition flips on/off every 100ms around a transform boundary.
    for (let tick = 0; tick <= 30; tick++) {
      const timeMs = tick * 100;
      const visible = stabilizer.update(tick % 2 === 0 ? produced : []);
      if (visible.length > 0 && !previouslyVisible) {
        appearances += 1;
        firstVisibleAt = firstVisibleAt ?? timeMs;
      }
      previouslyVisible = visible.length > 0;
      clock.advance(100);
    }

    expect(appearances).toBe(1);
    expect(firstVisibleAt).toBe(MCAP_NOTICE_APPEARANCE_FLOOR_MS);
    expect(previouslyVisible).toBe(true);
  });

  it("updates message and detail in place without resetting the floor", () => {
    const clock = createManualClock();
    const stabilizer = createMcapNoticeStabilizer({ now: clock.now });

    stabilizer.update([testNotice("transform:clamped", { detail: "lidar" })]);
    clock.advance(300);
    stabilizer.update([
      testNotice("transform:clamped", { detail: "lidar, radar" }),
    ]);
    clock.advance(200);

    // One episode: 500ms after the first production, despite detail churn.
    const visible = stabilizer.update([
      testNotice("transform:clamped", { detail: "radar" }),
    ]);
    expect(visible).toHaveLength(1);
    expect(visible[0].detail).toBe("radar");

    clock.advance(50);
    const updated = stabilizer.update([
      testNotice("transform:clamped", { detail: "lidar" }),
    ]);
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe("transform:clamped");
    expect(updated[0].detail).toBe("lidar");
    expect(updated).not.toBe(visible);
  });

  it("survives dropouts up to the linger and retires past it", () => {
    const clock = createManualClock();
    const stabilizer = createMcapNoticeStabilizer({ now: clock.now });
    const produced = [testNotice("transform:clamped")];

    stabilizer.update(produced);
    clock.advance(MCAP_NOTICE_APPEARANCE_FLOOR_MS);
    expect(stabilizer.update(produced)).toHaveLength(1);

    clock.advance(100);
    expect(stabilizer.update([])).toHaveLength(1);
    clock.advance(100);
    expect(stabilizer.update([])).toHaveLength(1);
    clock.advance(MCAP_NOTICE_DISAPPEAR_LINGER_MS - 200);
    expect(stabilizer.update([])).toHaveLength(1);

    clock.advance(1);
    expect(stabilizer.update([])).toEqual([]);

    // A retired notice re-earns the appearance floor from scratch.
    clock.advance(100);
    expect(stabilizer.update(produced)).toEqual([]);
    clock.advance(MCAP_NOTICE_APPEARANCE_FLOOR_MS - 1);
    expect(stabilizer.update(produced)).toEqual([]);
    clock.advance(1);
    expect(stabilizer.update(produced)).toHaveLength(1);
  });

  it("starts a new episode after a long observed absence", () => {
    const clock = createManualClock();
    const stabilizer = createMcapNoticeStabilizer({ now: clock.now });
    const produced = [testNotice("transform:clamped")];

    stabilizer.update(produced);
    clock.advance(MCAP_NOTICE_APPEARANCE_FLOOR_MS);
    expect(stabilizer.update(produced)).toHaveLength(1);

    clock.advance(100);
    expect(stabilizer.update([])).toHaveLength(1);

    // Re-produced long after the observed absence: the old episode is over,
    // so the notice is pending again rather than instantly visible.
    clock.advance(10_000);
    expect(stabilizer.update(produced)).toEqual([]);
  });

  it("keeps a steadily-produced notice alive across sparse updates", () => {
    const clock = createManualClock();
    const stabilizer = createMcapNoticeStabilizer({ now: clock.now });
    const produced = [testNotice("transform:clamped")];

    stabilizer.update(produced);
    // Paused playback: no updates for a long stretch, but the notice was
    // present at the previous update, so the episode continues.
    clock.advance(10_000);
    expect(stabilizer.update(produced)).toHaveLength(1);
  });

  it("orders output by first-visible time, not producer order", () => {
    const clock = createManualClock();
    const stabilizer = createMcapNoticeStabilizer({ now: clock.now });
    const a = testNotice("a");
    const b = testNotice("b");

    stabilizer.update([a]);
    clock.advance(100);
    stabilizer.update([b, a]);
    clock.advance(400);
    expect(stabilizer.update([b, a]).map((notice) => notice.id)).toEqual(["a"]);
    clock.advance(100);
    expect(stabilizer.update([b, a]).map((notice) => notice.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("dedupes producers by id within one update", () => {
    const clock = createManualClock();
    const stabilizer = createMcapNoticeStabilizer({ now: clock.now });
    const produced = [
      testNotice("transform:clamped", { detail: "first" }),
      testNotice("transform:clamped", { detail: "second" }),
    ];

    stabilizer.update(produced);
    clock.advance(MCAP_NOTICE_APPEARANCE_FLOOR_MS);
    const visible = stabilizer.update(produced);
    expect(visible).toHaveLength(1);
    expect(visible[0].detail).toBe("first");
  });

  it("reports the next time-driven transition", () => {
    const clock = createManualClock();
    const stabilizer = createMcapNoticeStabilizer({ now: clock.now });
    const produced = [testNotice("transform:clamped")];

    expect(stabilizer.nextEvaluateAtMs()).toBeNull();

    stabilizer.update(produced);
    expect(stabilizer.nextEvaluateAtMs()).toBe(MCAP_NOTICE_APPEARANCE_FLOOR_MS);

    clock.advance(MCAP_NOTICE_APPEARANCE_FLOOR_MS);
    stabilizer.update(produced);
    // Steadily visible and produced: no transition without new input.
    expect(stabilizer.nextEvaluateAtMs()).toBeNull();

    clock.advance(100);
    stabilizer.update([]);
    // Visible but absent: it retires strictly after the linger, so the
    // wake lands one tick past the boundary.
    expect(stabilizer.nextEvaluateAtMs()).toBe(
      MCAP_NOTICE_APPEARANCE_FLOOR_MS + MCAP_NOTICE_DISAPPEAR_LINGER_MS + 1,
    );
  });
});

describe("useStabilizedMcapNotices", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("applies the appearance floor and linger through wall-clock wakes", () => {
    vi.useFakeTimers({ toFake: ["Date", "clearTimeout", "setTimeout"] });
    const notice = testNotice("transform:clamped");
    const { rerender, result } = renderHook(
      ({ notices }: { notices: readonly McapHealthNotice[] }) =>
        useStabilizedMcapNotices(notices),
      { initialProps: { notices: [notice] } },
    );

    expect(result.current).toEqual([]);

    // The wake timer promotes the pending notice once the floor passes,
    // even though no consumer re-render happens in between.
    act(() => {
      vi.advanceTimersByTime(MCAP_NOTICE_APPEARANCE_FLOOR_MS + 10);
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("transform:clamped");

    // Dropping the producer keeps the notice visible through the linger…
    rerender({ notices: [] });
    expect(result.current).toHaveLength(1);

    // …and the wake timer retires it once the linger runs out.
    act(() => {
      vi.advanceTimersByTime(MCAP_NOTICE_DISAPPEAR_LINGER_MS + 10);
    });
    expect(result.current).toEqual([]);
  });

  it("keeps the output identity across re-renders with equal content", () => {
    vi.useFakeTimers({ toFake: ["Date", "clearTimeout", "setTimeout"] });
    const { rerender, result } = renderHook(
      ({ notices }: { notices: readonly McapHealthNotice[] }) =>
        useStabilizedMcapNotices(notices),
      { initialProps: { notices: [testNotice("transform:clamped")] } },
    );

    act(() => {
      vi.advanceTimersByTime(MCAP_NOTICE_APPEARANCE_FLOOR_MS + 10);
    });
    const first = result.current;
    expect(first).toHaveLength(1);

    // Fresh array and object with equal content — per-tick producer churn.
    rerender({ notices: [testNotice("transform:clamped")] });
    expect(result.current).toBe(first);
  });
});
