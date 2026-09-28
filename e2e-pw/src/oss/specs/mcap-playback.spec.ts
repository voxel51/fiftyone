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
    await openMcapModal(grid, modal, sampleIndex.episodeA);
    await modal.episode.waitForReady(tinyA.fileName);
    await modal.episode.addTile("log", "Logs / Diagnostics");
    await modal.episode.setSamplingRate(1);
    await modal.episode.inspectStream("/pose");
    await modal.episode.expectRawField("position.x", tinyA.poseX[0]);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      tinyA.imageRgb[0],
    );

    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 00:00:01.000");
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:01.000 / 2024-01-01 00:00:02.000",
    );
    await modal.episode.expectRawField("position.x", tinyA.poseX[1]);
    await modal.episode.expectLog("A log 1");
    await expectDominantColor(
      modal.episode.image("camera/front"),
      tinyA.imageRgb[1],
    );

    await modal.episode.stepBack();
    await modal.episode.expectUtcTime("2024-01-01 00:00:00.000");
    await modal.episode.expectRawField("position.x", tinyA.poseX[0]);
  });

  test("replaces inventory, layout, capabilities, clock, and decoded content A-B-A", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.episodeA);
    await modal.episode.waitForReady(tinyA.fileName);
    await modal.episode.expectTileTitles(
      ["camera/front", "points"],
      ["Logs / Diagnostics"],
    );
    await modal.episode.expectStreams([
      "/camera/front",
      "/points",
      "/log",
      "/pose",
    ]);

    await modal.episode.navigateDatasetSample("forward", tinyB.fileName);
    await modal.episode.expectStreams(
      ["/camera/rear", "/camera/side", "/scan/rear", "/status"],
      ["/camera/front", "/points", "/log", "/pose"],
    );
    await modal.episode.expectTileTitles(
      ["camera/rear", "camera/side", "scan/rear"],
      ["camera/front", "Logs / Diagnostics"],
    );
    await modal.episode.expectNoUtcTime();
    await modal.episode.expectPlayhead("0:00.00 / 0:01.50");
    await modal.episode.setSamplingRate(2);
    await modal.episode.inspectStream("/status");
    await modal.episode.expectRawField("status_code", tinyB.statusCodes[0]);
    await expectDominantColor(
      modal.episode.image("camera/rear"),
      tinyB.rearImageRgb[0],
    );

    await modal.episode.stepForward();
    await modal.episode.expectPlayhead("0:00.50 / 0:01.50");
    await modal.episode.expectRawField("status_code", tinyB.statusCodes[1]);

    await modal.episode.navigateDatasetSample("backward", tinyA.fileName);
    await modal.episode.expectTileTitleCount("camera/front", 2);
    await modal.episode.expectTileTitles(
      ["camera/front", "points"],
      ["camera/rear", "camera/side", "Logs / Diagnostics"],
    );
    await modal.episode.expectUtcTime("2024-01-01 00:00:00.000");
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:00.000 / 2024-01-01 00:00:02.000",
    );
    await modal.episode.setSamplingRate(1);
    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 00:00:01.000");
  });

  test("seeks, scrubs, synchronizes sparse streams, and clamps one-hour boundaries", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.long);
    await modal.episode.waitForReady(long.fileName);
    await modal.episode.setSamplingRate(2);
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:00.000 / 2024-01-01 01:00:00.000",
    );
    await modal.episode.expectStreams([
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

    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 00:00:00.500");
    await modal.episode.stepBack();
    await modal.episode.expectUtcTime("2024-01-01 00:00:00.000");

    await modal.episode.scrubToFraction(0.5);
    await modal.episode.expectUtcTime("2024-01-01 00:30:00.000");
    await modal.episode.expectPlayhead(
      "2024-01-01 00:30:00.000 / 2024-01-01 01:00:00.000",
    );
    await modal.episode.inspectStream("/odometry");
    await modal.episode.expectRawField("pose.pose.position.x", 180);
    await modal.episode.inspectStream("/status");
    await modal.episode.expectRawField(
      "counter",
      longExpectation.statusCounterAtMidpoint,
    );
    await modal.episode.expectRawField("state", "active-warning");

    await modal.episode.inspectStream("/lidar/points");
    await modal.episode.expectRawMeta(
      relativeSecond(longExpectation.lidarBeforeGapSecond),
    );
    await modal.episode.seekToFraction(0.75);
    await modal.episode.expectUtcTime("2024-01-01 00:45:00.000");
    await modal.episode.seekToFraction(
      fractionOfLongRecording(longExpectation.lidarAfterGapSecond),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:30:12.000",
      500,
    );
    await modal.episode.expectRawMeta(
      relativeSecond(longExpectation.lidarAfterGapSecond),
    );

    await modal.episode.scrubToFraction(1);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 01:00:00.000",
      500,
    );
    await modal.episode.expectPlayhead(
      "2024-01-01 01:00:00.000 / 2024-01-01 01:00:00.000",
    );
    await modal.episode.inspectStream("/status");
    await modal.episode.expectRawField("state", "complete");
    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 01:00:00.000");
    await modal.episode.stepBack();
    await modal.episode.expectUtcTime("2024-01-01 00:59:59.500");
  });

  test("resets duration, streams, playback, seek state, and values short-long-short", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.shortBeforeLong);
    await modal.episode.waitForReady(tinyA.fileName);
    await modal.episode.setSamplingRate(1);
    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 00:00:01.000");
    await modal.episode.inspectStream("/pose");
    await modal.episode.expectRawField("position.x", tinyA.poseX[1]);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      tinyA.imageRgb[1],
    );

    await modal.episode.navigateDatasetSample("forward", long.fileName);
    await modal.episode.expectPaused();
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:00.000 / 2024-01-01 01:00:00.000",
    );
    await modal.episode.expectStreams(
      ["/camera/rear", "/odometry", "/status", "/diagnostics"],
      ["/points", "/log", "/pose"],
    );
    await modal.episode.expectTileTitles(["camera/front"], ["/pose"]);
    await modal.episode.inspectStream("/status");
    await modal.episode.expectRawField("counter", 0);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      long.cameraPhaseRgb[0],
    );

    await modal.episode.seekToFraction(0.75);
    await modal.episode.expectUtcTime("2024-01-01 00:45:00.000");
    await modal.episode.expectRawField(
      "counter",
      longExpectation.statusCounterAtThreeQuarters,
    );

    await modal.episode.navigateDatasetSample("forward", tinyA.fileName);
    await modal.episode.expectPaused();
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:00.000 / 2024-01-01 00:00:02.000",
    );
    await modal.episode.expectStreams(
      ["/camera/front", "/points", "/log", "/pose"],
      ["/camera/rear", "/odometry", "/status", "/diagnostics"],
    );
    await modal.episode.expectTileTitles(
      ["camera/front", "points"],
      ["camera/rear", "/status", "Logs / Diagnostics"],
    );
    await modal.episode.expectRawSelectionCleared();
    await modal.episode.inspectStream("/pose");
    await modal.episode.expectRawField("position.x", tinyA.poseX[0]);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      tinyA.imageRgb[0],
    );
  });

  test("honors rear-camera first and last temporal boundaries through seeks and scrubs", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.long);
    await modal.episode.waitForReady(long.fileName);
    await modal.episode.setSamplingRate(2);

    await modal.episode.seekToFraction(
      fractionOfLongRecording(long.rearFirstSecond - 0.5),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:09:59.500",
      500,
    );
    await modal.episode.expectTileEmpty("camera/rear", "Starts at 10:00.00");

    await modal.episode.scrubToFraction(
      fractionOfLongRecording(long.rearFirstSecond),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:10:00.000",
      500,
    );
    await expectDominantColor(
      modal.episode.image("camera/rear"),
      long.cameraPhaseRgb[0],
    );

    await modal.episode.seekToFraction(
      fractionOfLongRecording(long.rearLastSecond),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:50:00.000",
      500,
    );
    await expectDominantColor(
      modal.episode.image("camera/rear"),
      long.cameraPhaseRgb[3],
    );

    await modal.episode.scrubToFraction(
      fractionOfLongRecording(long.rearLastSecond + 0.5),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:50:00.500",
      500,
    );
    await modal.episode.expectTileEmpty("camera/rear", "No data at this time");
  });

  test("keeps sparse log and diagnostic predecessor anchors synchronized", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.long);
    await modal.episode.waitForReady(long.fileName);
    await modal.episode.addTile("log", "Logs / Diagnostics");
    await modal.episode.setSamplingRate(2);

    await modal.episode.seekToFraction(
      fractionOfLongRecording(long.midpointSecond - 0.5),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:29:59.500",
      500,
    );
    await modal.episode.inspectStream("/diagnostics");
    await modal.episode.expectRawMeta(
      relativeSecond(longExpectation.diagnosticBeforeMidpointSecond),
    );
    await modal.episode.expectRawField("status.0.message", "nominal");
    await modal.episode.inspectStream("/rosout");
    await modal.episode.expectRawMeta(
      relativeSecond(long.logBeforeMidpointSecond),
    );
    await modal.episode.expectRawField("msg", "LONG pre-midpoint nominal");
    await expectDominantColor(
      modal.episode.image("camera/front"),
      long.cameraPhaseRgb[1],
    );

    await modal.episode.scrubToFraction(
      fractionOfLongRecording(long.midpointSecond),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:30:00.000",
      500,
    );
    await modal.episode.focusRawTile("/diagnostics");
    await modal.episode.expectRawMeta(relativeSecond(long.midpointSecond));
    await modal.episode.expectRawField("status.0.message", "midpoint warning");
    await modal.episode.expectRawField("status.0.level", 1);
    await modal.episode.focusRawTile("/rosout");
    await modal.episode.expectRawMeta(relativeSecond(long.midpointSecond));
    await modal.episode.expectRawField("msg", "LONG midpoint warning");
    await modal.episode.expectLogs(["LONG midpoint warning"]);
    await modal.episode.expectDiagnostics(["midpoint warning"]);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      long.cameraPhaseRgb[2],
    );

    await modal.episode.seekToFraction(
      fractionOfLongRecording(long.midpointSecond + 0.5),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:30:00.500",
      500,
    );
    await modal.episode.focusRawTile("/diagnostics");
    await modal.episode.expectRawMeta(relativeSecond(long.midpointSecond));
    await modal.episode.focusRawTile("/rosout");
    await modal.episode.expectRawMeta(relativeSecond(long.midpointSecond));

    await modal.episode.scrubToFraction(
      fractionOfLongRecording(long.midpointSecond - 0.5),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:29:59.500",
      500,
    );
    await modal.episode.focusRawTile("/diagnostics");
    await modal.episode.expectRawMeta(
      relativeSecond(longExpectation.diagnosticBeforeMidpointSecond),
    );
    await modal.episode.expectRawField("status.0.message", "nominal");
    await modal.episode.focusRawTile("/rosout");
    await modal.episode.expectRawMeta(
      relativeSecond(long.logBeforeMidpointSecond),
    );
    await modal.episode.expectRawField("msg", "LONG pre-midpoint nominal");
  });
});

function fractionOfLongRecording(second: number): number {
  return second / long.durationSeconds;
}

function relativeSecond(second: number): string {
  return `t=+${second.toFixed(3)}s`;
}
