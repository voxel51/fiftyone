import { describe, expect, it } from "vitest";

import {
  STREAM_SYNC_MODE,
  type DecodedFrame,
  type StreamSyncPolicy,
} from "../../../ir";
import type { EpisodeSession } from "../../../ports";
import { readSynchronizedPlaybackBatchFallback } from "../../../runtime/read-policy";
import { PlaybackSyncMode } from "../../../schemas/v1";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapDecodedMessage,
  type McapStreamSyncPolicy,
} from "../contracts";
import { createWindowBounds, selectCandidatesForTopic } from "./policy";

const STREAM = "/camera";
const TIME_NS = 100n;

describe("generic and MCAP synchronization parity", () => {
  it.each([
    {
      candidates: [79n, 80n, 120n, 121n],
      mcap: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      name: "inclusive nearest boundaries",
      runtime: {
        mode: STREAM_SYNC_MODE.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
    },
    {
      candidates: [100n, 100n, 101n],
      mcap: { limit: 2, mode: PlaybackSyncMode.STRICT },
      name: "duplicate strict timestamps",
      runtime: { limit: 2, mode: STREAM_SYNC_MODE.STRICT },
    },
    {
      candidates: [79n, 80n, 99n, 101n],
      mcap: {
        limit: 2,
        mode: PlaybackSyncMode.LATEST,
        toleranceBeforeNs: 20n,
      },
      name: "bounded latest",
      runtime: {
        limit: 2,
        mode: STREAM_SYNC_MODE.LATEST,
        toleranceBeforeNs: 20n,
      },
    },
    {
      candidates: [1n, 99n, 101n],
      mcap: undefined,
      name: "unbounded default latest",
      runtime: undefined,
    },
  ])("matches $name selection and resolved bounds", async (scenario) => {
    const frames = scenario.candidates.map(frame);
    const runtimeWindow = (
      await readSynchronizedPlaybackBatchFallback(session(frames), {
        ...(scenario.runtime
          ? { streamPolicies: { [STREAM]: scenario.runtime } }
          : {}),
        streams: [STREAM],
        timeNs: [TIME_NS],
      })
    )[0];
    const mcapBounds = createWindowBounds({
      ...(scenario.mcap ? { streamPolicies: { [STREAM]: scenario.mcap } } : {}),
      timeNs: TIME_NS,
      topics: [STREAM],
    }).streamPolicies[STREAM];
    const mcapSelected = selectCandidatesForTopic(
      scenario.candidates.map((timeNs, sequence) => message(timeNs, sequence)),
      TIME_NS,
      mcapBounds,
      (left, right) => left.sequence - right.sequence,
    );

    expect(runtimeWindow.frames.map((item) => item.timestampNs)).toEqual(
      mcapSelected.map((item) => item.timelineTimeNs),
    );
    expect({
      endNs: runtimeWindow.streamPolicies[STREAM].endNs,
      limit: runtimeWindow.streamPolicies[STREAM].limit,
      mode: runtimeWindow.streamPolicies[STREAM].mode,
      startNs: runtimeWindow.streamPolicies[STREAM].startNs,
    }).toEqual({
      endNs: mcapBounds.endTimeNs,
      limit: mcapBounds.limit,
      mode: runtimeMode(mcapBounds.mode),
      startNs: mcapBounds.startTimeNs,
    });
  });

  it("sorts strict duplicate timestamps before limiting them", async () => {
    const frames = [frame(TIME_NS, 2), frame(TIME_NS, 0), frame(TIME_NS, 1)];
    const runtimeWindow = (
      await readSynchronizedPlaybackBatchFallback(session(frames), {
        streamPolicies: {
          [STREAM]: { limit: 2, mode: STREAM_SYNC_MODE.STRICT },
        },
        streams: [STREAM],
        timeNs: [TIME_NS],
      })
    )[0];
    const bounds = createWindowBounds({
      streamPolicies: {
        [STREAM]: { limit: 2, mode: PlaybackSyncMode.STRICT },
      },
      timeNs: TIME_NS,
      topics: [STREAM],
    }).streamPolicies[STREAM];
    const mcapSelected = selectCandidatesForTopic(
      [message(TIME_NS, 2), message(TIME_NS, 0), message(TIME_NS, 1)],
      TIME_NS,
      bounds,
      (left, right) => left.sequence - right.sequence,
    );

    expect(runtimeWindow.frames.map((item) => item.sequence)).toEqual([0, 1]);
    expect(mcapSelected.map((item) => item.sequence)).toEqual([0, 1]);
  });

  it.each([
    {
      mcap: { limit: 0 },
      runtime: { limit: 0 },
    },
    {
      mcap: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceBeforeNs: -1n,
      },
      runtime: {
        mode: STREAM_SYNC_MODE.NEAREST,
        toleranceBeforeNs: -1n,
      },
    },
    {
      mcap: {
        mode: PlaybackSyncMode.LATEST,
        toleranceAfterNs: 1n,
      },
      runtime: {
        mode: STREAM_SYNC_MODE.LATEST,
        toleranceAfterNs: 1n,
      },
    },
  ] as const)(
    "rejects the same invalid policy families",
    async ({
      mcap,
      runtime,
    }: {
      readonly mcap: McapStreamSyncPolicy;
      readonly runtime: StreamSyncPolicy;
    }) => {
      expect(() =>
        createWindowBounds({
          streamPolicies: { [STREAM]: mcap },
          timeNs: TIME_NS,
          topics: [STREAM],
        }),
      ).toThrow();
      await expect(
        readSynchronizedPlaybackBatchFallback(session([]), {
          streamPolicies: { [STREAM]: runtime },
          streams: [STREAM],
          timeNs: [TIME_NS],
        }),
      ).rejects.toThrow();
    },
  );
});

function session(frames: readonly DecodedFrame[]): EpisodeSession {
  return {
    dispose() {
      // The parity fixture owns no resources.
    },
    manifest: {
      episodeId: "parity",
      streams: [
        {
          id: STREAM,
          kind: "unknown",
          payload: { encoding: "fixture" },
          sourceName: STREAM,
          timeRange: { endNs: 200n, startNs: 0n },
        },
      ],
      timeDomain: { id: "time", kind: "timestamp" },
      timeRange: { endNs: 200n, startNs: 0n },
    },
    async *read() {
      yield { frames, stream: STREAM };
    },
  };
}

function frame(timestampNs: bigint, sequence = 0): DecodedFrame {
  return { output: {}, sequence, streamId: STREAM, timestampNs };
}

function message(timelineTimeNs: bigint, sequence: number): McapDecodedMessage {
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    channelId: 1,
    decoded: {
      decoderId: "decoder",
      decoderVersion: "1",
      output: {},
      payload: { encoding: "fixture" },
    },
    logTimeNs: timelineTimeNs,
    publishTimeNs: timelineTimeNs,
    sequence,
    timelineTimeNs,
    topic: STREAM,
  };
}

function runtimeMode(mode: PlaybackSyncMode) {
  switch (mode) {
    case PlaybackSyncMode.NEAREST:
      return STREAM_SYNC_MODE.NEAREST;
    case PlaybackSyncMode.STRICT:
      return STREAM_SYNC_MODE.STRICT;
    case PlaybackSyncMode.LATEST:
      return STREAM_SYNC_MODE.LATEST;
    default:
      throw new Error(`Unexpected resolved MCAP mode ${mode}`);
  }
}
