import {
  expectDominantColor,
  long,
  openMcapModal,
  sampleIndex,
  test,
  tinyA,
  tinyB,
} from "src/oss/fixtures/mcap";

const longExpectation = {
  diagnosticBeforeMidpointSecond:
    Math.floor((long.midpointSecond - 0.5) / long.diagnosticIntervalSeconds) *
    long.diagnosticIntervalSeconds,
  lidarAfterGapSecond: long.lidarGapLastSecond + long.lidarIntervalSeconds,
  lidarBeforeGapSecond: long.lidarGapFirstSecond - long.lidarIntervalSeconds,
  statusCounterAtMidpoint: long.midpointSecond / long.statusIntervalSeconds,
  statusCounterAtThreeQuarters:
    (long.durationSeconds * 0.75) / long.statusIntervalSeconds,
};

test.describe("MCAP playback", () => {
  test("keeps paused stepping, raw values, logs, and image pixels synchronized", async ({
    grid,
    modal,
  }) => {
    const { episode } = modal;
    await episode.afterReady(
      tinyA.fileName,
      () => openMcapModal(grid, modal, sampleIndex.episodeA),
      [episode.imageShown("camera/front")],
    );
    await episode.addTile("log", "Logs / Diagnostics");
    await episode.setSamplingRate(1);
    await episode.inspectStream("/pose");
    await episode.expectRawField("position.x", tinyA.poseX[0]);
    await expectDominantColor(episode.image("camera/front"), tinyA.imageRgb[0]);

    const second = "2024-01-01 00:00:01.000";
    const playhead = "2024-01-01 00:00:01.000 / 2024-01-01 00:00:02.000";
    await episode.after(
      [
        episode.utcTime(second),
        episode.playhead(playhead),
        episode.raw("/pose"),
        episode.logs(["A log 1"]),
        episode.imageShown("camera/front"),
      ],
      () => episode.stepForward(),
    );
    await episode.expectUtcTime(second);
    await episode.expectPlayhead(playhead);
    await episode.expectRawField("position.x", tinyA.poseX[1]);
    await episode.expectLog("A log 1");
    await expectDominantColor(episode.image("camera/front"), tinyA.imageRgb[1]);

    const first = "2024-01-01 00:00:00.000";
    await episode.after([episode.utcTime(first), episode.raw("/pose")], () =>
      episode.stepBack(),
    );
    await episode.expectUtcTime(first);
    await episode.expectRawField("position.x", tinyA.poseX[0]);
  });

  // KNOWN APP RACE: returning to A sometimes restores A's own layout (one
  // camera/front tile) and sometimes keeps B's two image tiles on A's camera.
  test.fixme("replaces inventory, layout, capabilities, clock, and decoded content A-B-A", async ({
    grid,
    modal,
  }) => {
    const { episode } = modal;
    await episode.afterReady(tinyA.fileName, () =>
      openMcapModal(grid, modal, sampleIndex.episodeA),
    );
    await episode.expectTileTitles(
      ["camera/front", "points"],
      ["Logs / Diagnostics"],
    );
    await episode.expectStreams(["/camera/front", "/points", "/log", "/pose"]);

    await episode.navigateDatasetSample("forward", tinyB.fileName, [
      episode.playhead("0:00.00 / 0:01.50"),
      episode.imageShown("camera/rear"),
    ]);
    await episode.expectStreams(
      ["/camera/rear", "/camera/side", "/scan/rear", "/status"],
      ["/camera/front", "/points", "/log", "/pose"],
    );
    await episode.expectTileTitles(
      ["camera/rear", "camera/side", "scan/rear"],
      ["camera/front", "Logs / Diagnostics"],
    );
    await episode.expectNoUtcTime();
    await episode.expectPlayhead("0:00.00 / 0:01.50");
    await episode.setSamplingRate(2);
    await episode.inspectStream("/status");
    await episode.expectRawField("status_code", tinyB.statusCodes[0]);
    await expectDominantColor(
      episode.image("camera/rear"),
      tinyB.rearImageRgb[0],
    );

    await episode.after(
      [episode.playhead("0:00.50 / 0:01.50"), episode.raw("/status")],
      () => episode.stepForward(),
    );
    await episode.expectPlayhead("0:00.50 / 0:01.50");
    await episode.expectRawField("status_code", tinyB.statusCodes[1]);

    const first = "2024-01-01 00:00:00.000";
    const playhead = "2024-01-01 00:00:00.000 / 2024-01-01 00:00:02.000";
    await episode.navigateDatasetSample("backward", tinyA.fileName, [
      episode.utcTime(first),
      episode.playhead(playhead),
      episode.imageShown("camera/front"),
    ]);
    await episode.expectTileTitleCount("camera/front", 2);
    await episode.expectTileTitles(
      ["camera/front", "points"],
      ["camera/rear", "camera/side", "Logs / Diagnostics"],
    );
    await episode.expectUtcTime(first);
    await episode.expectPlayhead(playhead);
    await episode.setSamplingRate(1);
    const second = "2024-01-01 00:00:01.000";
    await episode.after([episode.utcTime(second)], () => episode.stepForward());
    await episode.expectUtcTime(second);
  });

  test("seeks, scrubs, synchronizes sparse streams, and clamps one-hour boundaries", async ({
    grid,
    modal,
  }) => {
    const { episode } = modal;
    const start = "2024-01-01 00:00:00.000 / 2024-01-01 01:00:00.000";
    await episode.afterReady(
      long.fileName,
      () => openMcapModal(grid, modal, sampleIndex.long),
      [episode.playhead(start)],
    );
    await episode.setSamplingRate(2);
    await episode.expectPlayhead(start);
    await episode.expectStreams([
      "/camera/front",
      "/camera/rear",
      "/lidar/points",
      "/scan/rear",
      "/odometry",
      "/camera/front/detections",
      "/tf",
      "/tf_static",
      "/status",
      "/rosout",
      "/diagnostics",
    ]);

    await episode.after([episode.utcTime("2024-01-01 00:00:00.500")], () =>
      episode.stepForward(),
    );
    await episode.expectUtcTime("2024-01-01 00:00:00.500");
    await episode.after([episode.utcTime("2024-01-01 00:00:00.000")], () =>
      episode.stepBack(),
    );
    await episode.expectUtcTime("2024-01-01 00:00:00.000");

    const midpoint = "2024-01-01 00:30:00.000";
    const midpointPlayhead = `${midpoint} / 2024-01-01 01:00:00.000`;
    await episode.after(
      [episode.utcTime(midpoint), episode.playhead(midpointPlayhead)],
      () => episode.scrubToFraction(0.5),
    );
    await episode.expectUtcTime(midpoint);
    await episode.expectPlayhead(midpointPlayhead);
    await episode.inspectStream("/odometry");
    await episode.expectRawField("pose.pose.position.x", 180);
    await episode.inspectStream("/status");
    await episode.expectRawField(
      "counter",
      longExpectation.statusCounterAtMidpoint,
    );
    await episode.expectRawField("state", "active-warning");

    await episode.inspectStream("/lidar/points");
    await episode.expectRawMeta(
      relativeSecond(longExpectation.lidarBeforeGapSecond),
    );
    await episode.after([episode.utcTime("2024-01-01 00:45:00.000")], () =>
      episode.seekToFraction(0.75),
    );
    await episode.expectUtcTime("2024-01-01 00:45:00.000");
    await episode.seekToUtcTime(
      "2024-01-01 00:30:12.000",
      500,
      () =>
        episode.seekToFraction(
          fractionOfLongRecording(longExpectation.lidarAfterGapSecond),
        ),
      [episode.raw("/lidar/points")],
    );
    await episode.expectRawMeta(
      relativeSecond(longExpectation.lidarAfterGapSecond),
    );

    // the scrub moves the open /status tile to its terminal record
    await episode.seekToUtcTime(
      "2024-01-01 01:00:00.000",
      500,
      () => episode.scrubToFraction(1),
      [episode.raw("/status", "2024-01-01 01:00:00.000")],
    );
    await episode.expectPlayhead(
      "2024-01-01 01:00:00.000 / 2024-01-01 01:00:00.000",
    );
    await episode.inspectStream("/status");
    await episode.expectRawField("state", "complete");
    // the playhead is clamped at the end, so this step changes nothing
    await episode.stepForward();
    await episode.expectUtcTime("2024-01-01 01:00:00.000");
    await episode.after([episode.utcTime("2024-01-01 00:59:59.500")], () =>
      episode.stepBack(),
    );
    await episode.expectUtcTime("2024-01-01 00:59:59.500");
  });

  test("resets duration, streams, playback, seek state, and values short-long-short", async ({
    grid,
    modal,
  }) => {
    const { episode } = modal;
    await episode.afterReady(tinyA.fileName, () =>
      openMcapModal(grid, modal, sampleIndex.shortBeforeLong),
    );
    await episode.setSamplingRate(1);
    await episode.after(
      [
        episode.utcTime("2024-01-01 00:00:01.000"),
        episode.imageShown("camera/front"),
      ],
      () => episode.stepForward(),
    );
    await episode.expectUtcTime("2024-01-01 00:00:01.000");
    await episode.inspectStream("/pose");
    await episode.expectRawField("position.x", tinyA.poseX[1]);
    await expectDominantColor(episode.image("camera/front"), tinyA.imageRgb[1]);

    const longStart = "2024-01-01 00:00:00.000 / 2024-01-01 01:00:00.000";
    await episode.navigateDatasetSample("forward", long.fileName, [
      episode.playhead(longStart),
      episode.imageShown("camera/front"),
    ]);
    await episode.expectPaused();
    await episode.expectPlayhead(longStart);
    await episode.expectStreams(
      ["/camera/rear", "/odometry", "/status", "/diagnostics"],
      ["/points", "/log", "/pose"],
    );
    await episode.expectTileTitles(["camera/front"], ["/pose"]);
    await episode.inspectStream("/status");
    await episode.expectRawField("counter", 0);
    await expectDominantColor(
      episode.image("camera/front"),
      long.cameraPhaseRgb[0],
    );

    await episode.after(
      [episode.utcTime("2024-01-01 00:45:00.000"), episode.raw("/status")],
      () => episode.seekToFraction(0.75),
    );
    await episode.expectUtcTime("2024-01-01 00:45:00.000");
    await episode.expectRawField(
      "counter",
      longExpectation.statusCounterAtThreeQuarters,
    );

    const tinyStart = "2024-01-01 00:00:00.000 / 2024-01-01 00:00:02.000";
    await episode.navigateDatasetSample("forward", tinyA.fileName, [
      episode.playhead(tinyStart),
      episode.raw(""),
      episode.imageShown("camera/front"),
    ]);
    await episode.expectPaused();
    await episode.expectPlayhead(tinyStart);
    await episode.expectStreams(
      ["/camera/front", "/points", "/log", "/pose"],
      ["/camera/rear", "/odometry", "/status", "/diagnostics"],
    );
    await episode.expectTileTitles(
      ["camera/front", "points"],
      ["camera/rear", "/status", "Logs / Diagnostics"],
    );
    await episode.expectRawSelectionCleared();
    await episode.inspectStream("/pose");
    await episode.expectRawField("position.x", tinyA.poseX[0]);
    await expectDominantColor(episode.image("camera/front"), tinyA.imageRgb[0]);
  });

  test("honors rear-camera first and last temporal boundaries through seeks and scrubs", async ({
    grid,
    modal,
  }) => {
    const { episode } = modal;
    await episode.afterReady(long.fileName, () =>
      openMcapModal(grid, modal, sampleIndex.long),
    );
    await episode.setSamplingRate(2);

    // the rear camera shows the same pre-start message from the beginning
    await episode.seekToUtcTime("2024-01-01 00:09:59.500", 500, () =>
      episode.seekToFraction(
        fractionOfLongRecording(long.rearFirstSecond - 0.5),
      ),
    );
    await episode.expectTileEmpty("camera/rear", "Starts at 10:00.00");

    await episode.seekToUtcTime(
      "2024-01-01 00:10:00.000",
      500,
      () =>
        episode.scrubToFraction(fractionOfLongRecording(long.rearFirstSecond)),
      [episode.imageShown("camera/rear")],
    );
    await expectDominantColor(
      episode.image("camera/rear"),
      long.cameraPhaseRgb[0],
    );

    await episode.seekToUtcTime(
      "2024-01-01 00:50:00.000",
      500,
      () =>
        episode.seekToFraction(fractionOfLongRecording(long.rearLastSecond)),
      [episode.imageShown("camera/rear")],
    );
    await expectDominantColor(
      episode.image("camera/rear"),
      long.cameraPhaseRgb[3],
    );

    await episode.seekToUtcTime(
      "2024-01-01 00:50:00.500",
      500,
      () =>
        episode.scrubToFraction(
          fractionOfLongRecording(long.rearLastSecond + 0.5),
        ),
      [episode.tileEmpty("No data at this time")],
    );
    await episode.expectTileEmpty("camera/rear", "No data at this time");
  });

  test("keeps sparse log and diagnostic predecessor anchors synchronized", async ({
    grid,
    modal,
  }) => {
    const { episode } = modal;
    await episode.afterReady(long.fileName, () =>
      openMcapModal(grid, modal, sampleIndex.long),
    );
    await episode.addTile("log", "Logs / Diagnostics");
    await episode.setSamplingRate(2);

    await episode.seekToUtcTime(
      "2024-01-01 00:29:59.500",
      500,
      () =>
        episode.seekToFraction(
          fractionOfLongRecording(long.midpointSecond - 0.5),
        ),
      [episode.imageShown("camera/front")],
    );
    await episode.inspectStream("/diagnostics");
    await episode.expectRawMeta(
      relativeSecond(longExpectation.diagnosticBeforeMidpointSecond),
    );
    await episode.expectRawField("status.0.message", "nominal");
    await episode.inspectStream("/rosout");
    await episode.expectRawMeta(relativeSecond(long.logBeforeMidpointSecond));
    await episode.expectRawField("msg", "LONG pre-midpoint nominal");
    await expectDominantColor(
      episode.image("camera/front"),
      long.cameraPhaseRgb[1],
    );

    await episode.seekToUtcTime(
      "2024-01-01 00:30:00.000",
      500,
      () =>
        episode.scrubToFraction(fractionOfLongRecording(long.midpointSecond)),
      [
        episode.raw("/diagnostics"),
        episode.raw("/rosout"),
        episode.logs(["LONG midpoint warning"]),
        episode.imageShown("camera/front"),
      ],
    );
    episode.focusRawTile("/diagnostics");
    await episode.expectRawMeta(relativeSecond(long.midpointSecond));
    await episode.expectRawField("status.0.message", "midpoint warning");
    await episode.expectRawField("status.0.level", 1);
    episode.focusRawTile("/rosout");
    await episode.expectRawMeta(relativeSecond(long.midpointSecond));
    await episode.expectRawField("msg", "LONG midpoint warning");
    await episode.expectLogs(["LONG midpoint warning"]);
    await episode.expectDiagnostics(["midpoint warning"]);
    await expectDominantColor(
      episode.image("camera/front"),
      long.cameraPhaseRgb[2],
    );

    // both anchors stay on the midpoint records, so nothing re-renders
    await episode.seekToUtcTime("2024-01-01 00:30:00.500", 500, () =>
      episode.seekToFraction(
        fractionOfLongRecording(long.midpointSecond + 0.5),
      ),
    );
    episode.focusRawTile("/diagnostics");
    await episode.expectRawMeta(relativeSecond(long.midpointSecond));
    episode.focusRawTile("/rosout");
    await episode.expectRawMeta(relativeSecond(long.midpointSecond));

    await episode.seekToUtcTime(
      "2024-01-01 00:29:59.500",
      500,
      () =>
        episode.scrubToFraction(
          fractionOfLongRecording(long.midpointSecond - 0.5),
        ),
      [episode.raw("/diagnostics"), episode.raw("/rosout")],
    );
    episode.focusRawTile("/diagnostics");
    await episode.expectRawMeta(
      relativeSecond(longExpectation.diagnosticBeforeMidpointSecond),
    );
    await episode.expectRawField("status.0.message", "nominal");
    episode.focusRawTile("/rosout");
    await episode.expectRawMeta(relativeSecond(long.logBeforeMidpointSecond));
    await episode.expectRawField("msg", "LONG pre-midpoint nominal");
  });
});

function fractionOfLongRecording(second: number): number {
  return second / long.durationSeconds;
}

function relativeSecond(second: number): string {
  return `t=+${second.toFixed(3)}s`;
}
