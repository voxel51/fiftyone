import { describe, expect, it } from "vitest";

import {
  INDEXED_RECORD_ID_OPTION_PART_COUNT,
  mintIndexedRecordIdentity,
  parseIndexedRecordIdentity,
} from "./read-synchronized-message-batch";

describe("indexed record identity", () => {
  it("round-trips physical and decoder-option identity components", () => {
    const recordId = mintIndexedRecordIdentity(
      {
        channelId: 7,
        chunkStartOffset: 1_000n,
        logTimeNs: 90n,
        messageOffset: 900n,
        topic: "/topic",
      },
      {
        cacheKeySuffix: "activeTimeline=log",
        pointCloudColorBy: "intensity",
      },
    );

    expect(INDEXED_RECORD_ID_OPTION_PART_COUNT).toBe(2);
    expect(parseIndexedRecordIdentity(recordId)).toEqual({
      decoderOptionsIdentity: "activeTimeline=log\0intensity",
      physicalRecordIdentity: "/topic\u00007\u000090\u00001000\u0000900",
    });
  });

  it("rejects decoder options that would corrupt the wire boundary", () => {
    expect(() =>
      mintIndexedRecordIdentity(
        {
          channelId: 7,
          chunkStartOffset: 1_000n,
          logTimeNs: 90n,
          messageOffset: 900n,
          topic: "/topic",
        },
        { cacheKeySuffix: "activeTimeline=log\0variant" },
      ),
    ).toThrow("cannot contain NUL bytes");
  });
});
