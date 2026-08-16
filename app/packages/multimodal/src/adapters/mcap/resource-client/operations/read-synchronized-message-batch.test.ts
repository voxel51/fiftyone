import { describe, expect, it } from "vitest";

import {
  INDEXED_RECORD_ID_OPTION_PART_COUNT,
  mintIndexedRecordIdentity,
  parseIndexedRecordIdentity,
  selectEarlyDeliveryTopic,
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

describe("early synchronized delivery", () => {
  it.each([
    [
      "forward",
      [
        ["/large", [{ bytes: 100 }]],
        ["/small", [{ bytes: 10 }]],
        ["/support", [{ bytes: 1 }]],
      ],
    ],
    [
      "reverse",
      [
        ["/support", [{ bytes: 1 }]],
        ["/small", [{ bytes: 10 }]],
        ["/large", [{ bytes: 100 }]],
      ],
    ],
  ] as const)(
    "selects the cheapest eligible surface for %s request order",
    async (_direction, selectedByTopic) => {
      const candidates: readonly (readonly [
        string,
        readonly { readonly bytes: number }[],
      ])[] = selectedByTopic;
      await expect(
        selectEarlyDeliveryTopic({
          earlyDeliveryTopics: ["/large", "/small"],
          estimateCandidateBytes: (candidate) => candidate.bytes,
          selectedByTopic: candidates,
        }),
      ).resolves.toBe("/small");
    },
  );
});
