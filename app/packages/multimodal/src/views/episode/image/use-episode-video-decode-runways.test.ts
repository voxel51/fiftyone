import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { EncodedVideoVisualization } from "../../../ir";
import type { DecodedFrame } from "../../../ir";
import {
  h264RunwayFromMessages,
  useEpisodeVideoDecodeRunway,
} from "./use-episode-video-decode-runways";

afterEach(cleanup);

describe("h264RunwayFromMessages", () => {
  it("keeps the last keyframe and the following delta frames", () => {
    const oldKeyframe = frame(1n, true);
    const oldDelta = frame(2n, false);
    const keyframe = frame(3n, true);
    const deltaA = frame(4n, false);
    const deltaB = frame(5n, false);

    expect(
      h264RunwayFromMessages([
        message(oldKeyframe),
        message(oldDelta),
        message(keyframe),
        message(deltaA),
        message(deltaB),
      ]),
    ).toEqual([keyframe, deltaA, deltaB]);
  });

  it("returns no runway when the range contains only delta frames", () => {
    expect(h264RunwayFromMessages([message(frame(1n, false))])).toEqual([]);
  });

  it("returns an empty runway while a selected stream has no frame", () => {
    const { result } = renderHook(() =>
      useEpisodeVideoDecodeRunway("/camera/image", null),
    );

    expect(result.current).toEqual([]);
  });
});

function frame(
  timestampNs: bigint,
  keyframe: boolean,
): EncodedVideoVisualization {
  return {
    bytes: Uint8Array.of(0, 0, 0, 1, keyframe ? 0x65 : 0x61),
    codec: "h264",
    format: "h264",
    h264: { hasFrame: true },
    keyframe,
    kind: "encoded-video",
    timestampNs,
  };
}

function message(frame: EncodedVideoVisualization): DecodedFrame {
  return {
    output: { visualization: frame },
  } as DecodedFrame;
}
