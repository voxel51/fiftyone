import { describe, expect, it } from "vitest";
import type { ByteTimelinePoint } from "../../ir";
import type { ByteClient, ByteRangeReadRequest } from "../../query/bytes";
import {
  episodeBankingEndOffset,
  episodeBankingStartOffset,
  runEpisodeByteBankingPass,
} from "./episode-paused-byte-banking";

const SECOND_NS = 1_000_000_000n;

// Chunks of 100 bytes each starting at file offset 1000 (a header lives
// before the first chunk, like a real episode).
const BYTE_TIMELINE: ByteTimelinePoint[] = [
  {
    cumulativeCompressedBytes: 100,
    endTimeNs: 1n * SECOND_NS,
    startOffsetBytes: 1_000n,
  },
  {
    cumulativeCompressedBytes: 200,
    endTimeNs: 2n * SECOND_NS,
    startOffsetBytes: 1_110n,
  },
  {
    cumulativeCompressedBytes: 300,
    endTimeNs: 3n * SECOND_NS,
    startOffsetBytes: 1_220n,
  },
];

function recordingByteClient() {
  const reads: ByteRangeReadRequest["range"][] = [];
  const bytes: ByteClient = {
    async readBytes(request) {
      reads.push(request.range);
      return {
        bytes: new Uint8Array(Number(request.range.length)),
        range: request.range,
        source: request.source,
      };
    },
  };
  return { bytes, reads };
}

const SOURCE = {
  readProfile: "remote" as const,
  sizeBytes: "1400",
  sourceId: "bank-source",
  url: "https://bytes.example/bank.mcap",
};

describe("episodeBankingStartOffset", () => {
  it("starts at the first chunk still ahead of the playhead", () => {
    expect(episodeBankingStartOffset(BYTE_TIMELINE, 0n)).toBe(1_000n);
    expect(episodeBankingStartOffset(BYTE_TIMELINE, 1n * SECOND_NS)).toBe(
      1_110n,
    );
    expect(episodeBankingStartOffset(BYTE_TIMELINE, 1_500_000_000n)).toBe(
      1_110n,
    );
  });

  it("falls back to the final chunk past the end of the recording", () => {
    expect(episodeBankingStartOffset(BYTE_TIMELINE, 9n * SECOND_NS)).toBe(
      1_220n,
    );
    expect(episodeBankingStartOffset([], 0n)).toBe(0n);
  });
});

describe("episodeBankingEndOffset", () => {
  it("ends after the final chunk's own compressed length", () => {
    // Final chunk: starts at 1220, length 300-200=100 → ends at 1320.
    expect(episodeBankingEndOffset(BYTE_TIMELINE)).toBe(1_320n);
    expect(episodeBankingEndOffset([])).toBe(0n);
  });
});

describe("runEpisodeByteBankingPass", () => {
  it("walks the aligned block grid forward and wraps to the head", async () => {
    const { bytes, reads } = recordingByteClient();

    const outcome = await runEpisodeByteBankingPass({
      blockSizeBytesFor: () => 512,
      bytes,
      endOffset: 1_320n,
      fromOffset: 1_110n,
      shouldStop: () => false,
      source: SOURCE,
    });

    expect(outcome).toBe("completed");
    expect(reads).toEqual([
      // Forward region, aligned down to the 512 grid, clamped at the end.
      { length: 296n, offset: 1_024n },
      // Wrap-around head region up to the forward start.
      { length: 512n, offset: 0n },
      { length: 512n, offset: 512n },
      { length: 86n, offset: 1_024n },
    ]);
  });

  it("stops between blocks when asked", async () => {
    const { bytes, reads } = recordingByteClient();
    let stops = 0;

    const outcome = await runEpisodeByteBankingPass({
      blockSizeBytesFor: () => 512,
      bytes,
      endOffset: 1_320n,
      fromOffset: 0n,
      shouldStop: () => {
        stops += 1;
        return stops > 1;
      },
      source: SOURCE,
    });

    expect(outcome).toBe("stopped");
    expect(reads).toHaveLength(1);
  });

  it("reports failure quietly when a block read rejects", async () => {
    const bytes: ByteClient = {
      async readBytes() {
        throw new Error("network down");
      },
    };

    const outcome = await runEpisodeByteBankingPass({
      blockSizeBytesFor: () => 512,
      bytes,
      endOffset: 1_320n,
      fromOffset: 0n,
      shouldStop: () => false,
      source: SOURCE,
    });

    expect(outcome).toBe("failed");
  });
});
