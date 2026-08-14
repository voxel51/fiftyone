import { describe, expect, it } from "vitest";

import { shouldPresentDestinationPoster } from "./destination-poster";

describe("shouldPresentDestinationPoster", () => {
  const base = {
    committedSourceKey: null,
    committedStream: null,
    dataStreamSourceKey: "source-a",
    posterSourceKey: "source-a",
    posterStreamId: "/camera/front",
    stream: "/camera/front",
  } as const;

  it("presents the destination poster before the data stream is bound", () => {
    expect(
      shouldPresentDestinationPoster({
        ...base,
        dataStreamSourceKey: "",
      }),
    ).toBe(true);
  });

  it("never re-presents the poster after the first destination frame commits", () => {
    expect(
      shouldPresentDestinationPoster({
        ...base,
        committedSourceKey: "source-a",
        committedStream: "/camera/front",
      }),
    ).toBe(false);
  });

  it("rejects a poster for another visible source or stream", () => {
    expect(
      shouldPresentDestinationPoster({
        ...base,
        dataStreamSourceKey: "source-b",
      }),
    ).toBe(false);
    expect(
      shouldPresentDestinationPoster({
        ...base,
        stream: "/camera/rear",
      }),
    ).toBe(false);
  });

  it("rejects a poster without a resolved stream identity", () => {
    expect(
      shouldPresentDestinationPoster({ ...base, posterStreamId: null }),
    ).toBe(false);
  });

  it("presents the poster when only part of the prior frame identity matches", () => {
    expect(
      shouldPresentDestinationPoster({
        ...base,
        committedSourceKey: "source-previous",
        committedStream: "/camera/front",
      }),
    ).toBe(true);
    expect(
      shouldPresentDestinationPoster({
        ...base,
        committedSourceKey: "source-a",
        committedStream: "/camera/rear",
      }),
    ).toBe(true);
  });
});
