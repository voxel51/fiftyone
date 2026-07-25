import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NOTICE_APPEARANCE_FLOOR_MS,
  NOTICE_DISAPPEAR_LINGER_MS,
  buildScene3dPlacementNotices,
  buildScene3dTransformNotices,
  buildCameraTargetNotice,
  buildCapabilityNotices,
  buildPointCloudSamplingNotice,
  buildReferenceFrameNotices,
  buildTileEmptyStateModel,
  buildTileStreamNotice,
  createNoticeStabilizer,
  useStabilizedNotices,
  type HealthNotice,
} from "./health";

const NO_PLACEMENT_IDS = {
  pendingAnnotationFrameIds: [],
  pendingFrustumFrameIds: [],
  pendingGridFrameIds: [],
  provisionalFrameIds: [],
} as const;

const NO_TRANSFORM_CONDITIONS = {
  frameTransformsError: null,
  stalePoseUsages: [],
  unresolvedPoseUsages: [],
  worldFrameId: "map",
} as const;

describe("buildScene3dPlacementNotices", () => {
  it("returns nothing while no placement is pending", () => {
    expect(buildScene3dPlacementNotices(NO_PLACEMENT_IDS)).toEqual([]);
  });

  it("builds the placement-loading quartet with frame ids in detail", () => {
    const notices = buildScene3dPlacementNotices({
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

describe("buildScene3dTransformNotices", () => {
  it("returns nothing when transforms resolve cleanly", () => {
    expect(buildScene3dTransformNotices(NO_TRANSFORM_CONDITIONS)).toEqual([]);
  });

  it("short-circuits everything else on a window fetch failure", () => {
    const notices = buildScene3dTransformNotices({
      ...NO_TRANSFORM_CONDITIONS,
      frameTransformsError: "network unreachable",
      unresolvedPoseUsages: [
        {
          sourceFrameId: "radar_front",
          sourceId: "/radar",
          targetFrameId: "map",
        },
      ],
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
      buildScene3dTransformNotices({
        ...NO_TRANSFORM_CONDITIONS,
        unresolvedPoseUsages: [
          {
            sourceFrameId: "radar_front",
            sourceId: "/radar",
            targetFrameId: "map",
          },
        ],
        worldFrameId: "",
      }),
    ).toEqual([]);
  });

  it("reports unplaceable content by its friendly source label", () => {
    const notices = buildScene3dTransformNotices({
      frameTransformsError: null,
      sourceLabelsById: new Map([["/radar", "Front radar"]]),
      stalePoseUsages: [],
      unresolvedPoseUsages: [
        {
          sourceFrameId: "radar_front",
          sourceId: "/radar",
          targetFrameId: "map",
        },
      ],
      worldFrameId: "map",
    });

    expect(notices).toEqual([
      {
        detail: "No pose connects radar_front to map at this time.",
        id: "transform:missing:/radar",
        message: "Cannot place Front radar in the scene",
        scope: "scene",
        severity: "warning",
      },
    ]);
  });

  it("does not expose a canonical id when a source label is unavailable", () => {
    const notices = buildScene3dTransformNotices({
      frameTransformsError: null,
      stalePoseUsages: [],
      unresolvedPoseUsages: [
        {
          sourceFrameId: "radar_front",
          sourceId: "17",
          targetFrameId: "map",
        },
      ],
      worldFrameId: "map",
    });

    expect(notices[0]?.message).toBe(
      "Cannot place Unknown source in the scene",
    );
    expect(notices[0]?.message).not.toContain("17");
  });

  it("describes stale poses with source time and age, not interpolation internals", () => {
    const notices = buildScene3dTransformNotices({
      frameTransformsError: null,
      sourceLabelsById: new Map([
        ["/lidar", "LiDAR"],
        ["/radar", "Radar"],
      ]),
      stalePoseUsages: [
        {
          ageNs: 3_200_000_000n,
          sourceFrameId: "base_link",
          sourceId: "/lidar",
          sourceTimeNs: 15_000_000_000n,
          staleAfterNs: 500_000_000n,
          targetFrameId: "map",
        },
        {
          ageNs: 900_000_000n,
          sourceFrameId: "base_link",
          sourceId: "/radar",
          sourceTimeNs: 17_300_000_000n,
          staleAfterNs: 500_000_000n,
          targetFrameId: "map",
        },
      ],
      timelineStartTimeNs: 5_000_000_000n,
      unresolvedPoseUsages: [],
      worldFrameId: "map",
    });

    expect(notices).toEqual([
      {
        detail:
          "LiDAR — using pose from 0:10.00 (3.2s old). Radar — using pose from 0:12.30 (900ms old). Placement may be inaccurate.",
        id: "transform:stale",
        message: "Pose data is stale",
        scope: "scene",
        severity: "warning",
      },
    ]);
    expect(notices[0]?.detail).not.toContain("limit");
  });

  it("folds paused camera follow into the stale-pose notice", () => {
    expect(
      buildScene3dTransformNotices({
        cameraFollowHeldPose: {
          ageNs: 3_200_000_000n,
          sourceFrameId: "base_link",
          sourceTimeNs: 15_000_000_000n,
          staleAfterNs: 500_000_000n,
          targetFrameId: "map",
        },
        frameTransformsError: null,
        stalePoseUsages: [],
        timelineStartTimeNs: 5_000_000_000n,
        unresolvedPoseUsages: [],
        worldFrameId: "map",
      }),
    ).toEqual([
      {
        detail:
          "Camera follow is paused — using pose from 0:10.00 (3.2s old). Placement may be inaccurate.",
        id: "transform:stale",
        message: "Pose data is stale",
        scope: "scene",
        severity: "warning",
      },
    ]);
  });

  it("shows the three stalest affected sources and a remainder count", () => {
    const usageInputs: readonly (readonly [string, bigint])[] = [
      ["/a", 1_000_000_000n],
      ["/b", 4_000_000_000n],
      ["/c", 3_000_000_000n],
      ["/d", 2_000_000_000n],
    ];
    const usages = usageInputs.map(([sourceId, ageNs]) => ({
      ageNs,
      sourceFrameId: "base_link",
      sourceId,
      sourceTimeNs: 10_000_000_000n,
      staleAfterNs: 500_000_000n,
      targetFrameId: "map",
    }));

    const [notice] = buildScene3dTransformNotices({
      frameTransformsError: null,
      sourceLabelsById: new Map([
        ["/a", "A"],
        ["/b", "B"],
        ["/c", "C"],
        ["/d", "D"],
      ]),
      stalePoseUsages: usages,
      timelineStartTimeNs: 0n,
      unresolvedPoseUsages: [],
      worldFrameId: "map",
    });

    expect(notice?.detail).toBe(
      "B — using pose from 0:10.00 (4.0s old). C — using pose from 0:10.00 (3.0s old). D — using pose from 0:10.00 (2.0s old). +1 more. Placement may be inaccurate.",
    );
    expect(notice?.detail).not.toContain("A —");
  });
});

describe("buildCameraTargetNotice", () => {
  const missingTarget = {
    cameraTargetFrameId: "base_link",
    cameraTargetStatus: "missing",
    trackingMode: "position",
    worldFrameId: "map",
  } as const;

  it("warns when a follow-mode target transform is missing", () => {
    expect(buildCameraTargetNotice(missingTarget)).toEqual({
      detail: "base_link to map",
      id: "camera:target-unavailable",
      message: "Camera target transform unavailable",
      scope: "scene",
      severity: "warning",
    });
  });

  it("stays quiet outside follow modes", () => {
    expect(
      buildCameraTargetNotice({
        ...missingTarget,
        trackingMode: "free",
      }),
    ).toBeNull();
  });

  it("stays quiet while resolution is merely pending", () => {
    expect(
      buildCameraTargetNotice({
        ...missingTarget,
        cameraTargetStatus: "pending",
      }),
    ).toBeNull();
  });

  it("stays quiet before both frames are selected", () => {
    expect(
      buildCameraTargetNotice({ ...missingTarget, worldFrameId: "" }),
    ).toBeNull();
    expect(
      buildCameraTargetNotice({
        ...missingTarget,
        cameraTargetFrameId: "",
      }),
    ).toBeNull();
  });
});

describe("buildPointCloudSamplingNotice", () => {
  it("details the single sampled cloud against the render cap", () => {
    expect(
      buildPointCloudSamplingNotice(
        { largestFinitePointCount: 275_000, sampledCloudCount: 1 },
        150_000,
      ),
    ).toEqual({
      detail: "Showing 150,000 of 275,000 points.",
      id: "render:sampled",
      message: "Point cloud sampled for display",
      scope: "scene",
      severity: "warning",
    });
  });

  it("counts clouds when several exceed the display limit", () => {
    expect(
      buildPointCloudSamplingNotice(
        { largestFinitePointCount: 900_000, sampledCloudCount: 3 },
        150_000,
      )?.detail,
    ).toBe("3 point clouds exceed the 150,000-point display limit.");
  });

  it("stays quiet while every cloud renders in full", () => {
    expect(buildPointCloudSamplingNotice(null, 150_000)).toBeNull();
    expect(
      buildPointCloudSamplingNotice(
        { largestFinitePointCount: 0, sampledCloudCount: 0 },
        150_000,
      ),
    ).toBeNull();
  });
});

describe("capability and reference notices", () => {
  it("keeps unavailable camera calibration scoped to its stream", () => {
    expect(
      buildCapabilityNotices(
        ["/camera/info"],
        [
          [
            {
              capability: "camera-calibration",
              code: "camera-calibration-unavailable",
              message: "Camera calibration is unavailable",
              severity: "warning",
            },
          ],
        ],
      ),
    ).toEqual([
      {
        id: "capability:/camera/info:camera-calibration-unavailable",
        message: "Camera calibration is unavailable",
        scope: "stream",
        severity: "warning",
        streamId: "/camera/info",
      },
    ]);
  });

  it("explains the truthful local reference without claiming registration", () => {
    expect(
      buildReferenceFrameNotices({
        omittedFrameIds: ["base_link", "world"],
        omittedSourceIds: ["/camera/info"],
        referenceFrameId: "velodyne",
        source: "auto-local",
      }),
    ).toEqual([
      {
        detail:
          "Omitted sources: /camera/info. No transform path to base_link, world",
        id: "reference:local",
        message: "Showing velodyne in local coordinates",
        scope: "scene",
        severity: "info",
      },
    ]);
  });
});

describe("buildTileStreamNotice", () => {
  it("returns null while every stream is current", () => {
    expect(
      buildTileStreamNotice({
        staleAges: [null, null],
        startTimes: [null, null],
        statuses: ["ready", "ready"],
      }),
    ).toBeNull();
  });

  it("summarizes buffering with an affected suffix on multi-source tiles", () => {
    expect(
      buildTileStreamNotice({
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
      buildTileStreamNotice({
        staleAges: [null],
        startTimes: [null],
        statuses: ["loading"],
      })?.message,
    ).toBe("Buffering");
  });

  it("rounds tiny gap starts up to the displayed centisecond", () => {
    expect(
      buildTileStreamNotice({
        staleAges: [null],
        startTimes: [0.001],
        statuses: ["gap"],
      })?.message,
    ).toBe("No data until 0:00.01");
  });

  it("falls back to a generic gap message without a known start", () => {
    const notice = buildTileStreamNotice({
      staleAges: [null],
      startTimes: [null],
      statuses: ["gap"],
    });
    expect(notice?.message).toBe("No data at this time");
    expect(notice?.severity).toBe("info");
  });

  it("describes the age of the oldest stale displayed frame", () => {
    expect(
      buildTileStreamNotice({
        contentTimes: [12.34, null],
        staleAges: [2_400_000_000n, null],
        startTimes: [null, null],
        statuses: ["stale", "ready"],
      }),
    ).toEqual({
      id: "stream:stale",
      message: "Displaying stale frame from 2.4s ago (source 0:12.34) (1/2)",
      scope: "tile",
      severity: "warning",
      status: "stale",
    });
  });

  it("formats stale ages across ms, seconds, and minutes", () => {
    const messageForAge = (ageNs: bigint) =>
      buildTileStreamNotice({
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
      buildTileStreamNotice({
        staleAges: [null],
        startTimes: [null],
        statuses: ["stale"],
      })?.message,
    ).toBe("Displaying stale frame");
  });

  it("summarizes failures as errors", () => {
    expect(
      buildTileStreamNotice({
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

  it("names failed sources instead of showing an aggregate fraction", () => {
    expect(
      buildTileStreamNotice({
        staleAges: [null, null, null],
        startTimes: [null, null, null],
        statuses: ["failed", "ready", "failed"],
        streams: ["/camera/ir", "/lidar", "/camera/front"],
      })?.message,
    ).toBe("Failed to load: /camera/ir, /camera/front");
  });

  it("orders severity: failed over loading over gap over stale", () => {
    expect(
      buildTileStreamNotice({
        staleAges: [null, null, null, null],
        startTimes: [null, null, null, null],
        statuses: ["stale", "gap", "loading", "failed"],
      }),
    ).toMatchObject({ message: "Failed to load (1/4)", status: "failed" });
    expect(
      buildTileStreamNotice({
        staleAges: [null, null, null],
        startTimes: [null, null, null],
        statuses: ["stale", "gap", "loading"],
      }),
    ).toMatchObject({ message: "Buffering (1/3)", status: "loading" });
    expect(
      buildTileStreamNotice({
        staleAges: [null, null],
        startTimes: [null, null],
        statuses: ["stale", "gap"],
      }),
    ).toMatchObject({ status: "gap" });
  });
});

describe("buildTileEmptyStateModel", () => {
  it("reports failure only once every stream has failed", () => {
    expect(
      buildTileEmptyStateModel({
        startTimes: [null, null],
        statuses: ["failed", "failed"],
      }),
    ).toEqual({ kind: "failed", message: "Failed to load stream data" });
    expect(
      buildTileEmptyStateModel({
        startTimes: [null, null],
        statuses: ["failed", "loading"],
      }),
    ).toEqual({ kind: "loading" });
  });

  it("prefers a spinner while anything is loading", () => {
    expect(
      buildTileEmptyStateModel({
        startTimes: [null, null],
        statuses: ["gap", "loading"],
      }),
    ).toEqual({ kind: "loading" });
  });

  it("offers the earliest known long-gap start", () => {
    expect(
      buildTileEmptyStateModel({
        startTimes: [12, 30],
        statuses: ["gap", "gap"],
      }),
    ).toEqual({
      kind: "gap",
      message: "Starts at 0:12.00",
      startSec: 12,
    });
  });

  it("retains short-gap and unknown-gap copy", () => {
    expect(
      buildTileEmptyStateModel({
        startTimes: [0.2],
        statuses: ["gap"],
      }),
    ).toEqual({
      kind: "gap",
      message: "No data until 0:00.20",
      startSec: 0.2,
    });
    expect(
      buildTileEmptyStateModel({
        startTimes: [null],
        statuses: ["gap"],
      }),
    ).toEqual({
      kind: "gap",
      message: "No data at this time",
      startSec: null,
    });
  });
});

function testNotice(
  id: string,
  overrides: Partial<HealthNotice> = {},
): HealthNotice {
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

describe("createNoticeStabilizer", () => {
  it("holds a new notice below the appearance floor, then shows it", () => {
    const clock = createManualClock();
    const stabilizer = createNoticeStabilizer({ now: clock.now });
    const produced = [testNotice("transform:clamped")];

    expect(stabilizer.update(produced)).toEqual([]);
    clock.advance(NOTICE_APPEARANCE_FLOOR_MS - 1);
    expect(stabilizer.update(produced)).toEqual([]);

    clock.advance(1);
    const visible = stabilizer.update(produced);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("transform:clamped");
  });

  it("returns the same array identity while the visible content holds", () => {
    const clock = createManualClock();
    const stabilizer = createNoticeStabilizer({ now: clock.now });

    const emptyA = stabilizer.update([]);
    const emptyB = stabilizer.update([]);
    expect(emptyA).toBe(emptyB);

    stabilizer.update([testNotice("transform:clamped")]);
    clock.advance(NOTICE_APPEARANCE_FLOOR_MS);
    // Fresh input arrays/objects with equal content must not change the
    // output identity: consumers re-render per playback tick.
    const first = stabilizer.update([testNotice("transform:clamped")]);
    clock.advance(50);
    expect(stabilizer.update([testNotice("transform:clamped")])).toBe(first);
  });

  it("shows a boundary-oscillating condition once and keeps it", () => {
    const clock = createManualClock();
    const stabilizer = createNoticeStabilizer({ now: clock.now });
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
    expect(firstVisibleAt).toBe(NOTICE_APPEARANCE_FLOOR_MS);
    expect(previouslyVisible).toBe(true);
  });

  it("updates message and detail in place without resetting the floor", () => {
    const clock = createManualClock();
    const stabilizer = createNoticeStabilizer({ now: clock.now });

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
    const stabilizer = createNoticeStabilizer({ now: clock.now });
    const produced = [testNotice("transform:clamped")];

    stabilizer.update(produced);
    clock.advance(NOTICE_APPEARANCE_FLOOR_MS);
    expect(stabilizer.update(produced)).toHaveLength(1);

    clock.advance(100);
    expect(stabilizer.update([])).toHaveLength(1);
    clock.advance(100);
    expect(stabilizer.update([])).toHaveLength(1);
    clock.advance(NOTICE_DISAPPEAR_LINGER_MS - 200);
    expect(stabilizer.update([])).toHaveLength(1);

    clock.advance(1);
    expect(stabilizer.update([])).toEqual([]);

    // A retired notice re-earns the appearance floor from scratch.
    clock.advance(100);
    expect(stabilizer.update(produced)).toEqual([]);
    clock.advance(NOTICE_APPEARANCE_FLOOR_MS - 1);
    expect(stabilizer.update(produced)).toEqual([]);
    clock.advance(1);
    expect(stabilizer.update(produced)).toHaveLength(1);
  });

  it("starts a new episode after a long observed absence", () => {
    const clock = createManualClock();
    const stabilizer = createNoticeStabilizer({ now: clock.now });
    const produced = [testNotice("transform:clamped")];

    stabilizer.update(produced);
    clock.advance(NOTICE_APPEARANCE_FLOOR_MS);
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
    const stabilizer = createNoticeStabilizer({ now: clock.now });
    const produced = [testNotice("transform:clamped")];

    stabilizer.update(produced);
    // Paused playback: no updates for a long stretch, but the notice was
    // present at the previous update, so the episode continues.
    clock.advance(10_000);
    expect(stabilizer.update(produced)).toHaveLength(1);
  });

  it("orders output by first-visible time, not producer order", () => {
    const clock = createManualClock();
    const stabilizer = createNoticeStabilizer({ now: clock.now });
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
    const stabilizer = createNoticeStabilizer({ now: clock.now });
    const produced = [
      testNotice("transform:clamped", { detail: "first" }),
      testNotice("transform:clamped", { detail: "second" }),
    ];

    stabilizer.update(produced);
    clock.advance(NOTICE_APPEARANCE_FLOOR_MS);
    const visible = stabilizer.update(produced);
    expect(visible).toHaveLength(1);
    expect(visible[0].detail).toBe("first");
  });

  it("reports the next time-driven transition", () => {
    const clock = createManualClock();
    const stabilizer = createNoticeStabilizer({ now: clock.now });
    const produced = [testNotice("transform:clamped")];

    expect(stabilizer.nextEvaluateAtMs()).toBeNull();

    stabilizer.update(produced);
    expect(stabilizer.nextEvaluateAtMs()).toBe(NOTICE_APPEARANCE_FLOOR_MS);

    clock.advance(NOTICE_APPEARANCE_FLOOR_MS);
    stabilizer.update(produced);
    // Steadily visible and produced: no transition without new input.
    expect(stabilizer.nextEvaluateAtMs()).toBeNull();

    clock.advance(100);
    stabilizer.update([]);
    // Visible but absent: it retires strictly after the linger, so the
    // wake lands one tick past the boundary.
    expect(stabilizer.nextEvaluateAtMs()).toBe(
      NOTICE_APPEARANCE_FLOOR_MS + NOTICE_DISAPPEAR_LINGER_MS + 1,
    );
  });
});

describe("useStabilizedNotices", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("applies the appearance floor and linger through wall-clock wakes", () => {
    vi.useFakeTimers({ toFake: ["Date", "clearTimeout", "setTimeout"] });
    const notice = testNotice("transform:clamped");
    const { rerender, result } = renderHook(
      ({ notices }: { notices: readonly HealthNotice[] }) =>
        useStabilizedNotices(notices),
      { initialProps: { notices: [notice] } },
    );

    expect(result.current).toEqual([]);

    // The wake timer promotes the pending notice once the floor passes,
    // even though no consumer re-render happens in between.
    act(() => {
      vi.advanceTimersByTime(NOTICE_APPEARANCE_FLOOR_MS + 10);
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("transform:clamped");

    // Dropping the producer keeps the notice visible through the linger…
    rerender({ notices: [] });
    expect(result.current).toHaveLength(1);

    // …and the wake timer retires it once the linger runs out.
    act(() => {
      vi.advanceTimersByTime(NOTICE_DISAPPEAR_LINGER_MS + 10);
    });
    expect(result.current).toEqual([]);
  });

  it("keeps the output identity across re-renders with equal content", () => {
    vi.useFakeTimers({ toFake: ["Date", "clearTimeout", "setTimeout"] });
    const { rerender, result } = renderHook(
      ({ notices }: { notices: readonly HealthNotice[] }) =>
        useStabilizedNotices(notices),
      { initialProps: { notices: [testNotice("transform:clamped")] } },
    );

    act(() => {
      vi.advanceTimersByTime(NOTICE_APPEARANCE_FLOOR_MS + 10);
    });
    const first = result.current;
    expect(first).toHaveLength(1);

    // Fresh array and object with equal content — per-tick producer churn.
    rerender({ notices: [testNotice("transform:clamped")] });
    expect(result.current).toBe(first);
  });
});
