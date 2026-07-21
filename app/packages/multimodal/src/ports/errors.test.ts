import { describe, expect, it } from "vitest";

import {
  EPISODE_READ_CANCELLED_MESSAGE,
  isEpisodeReadCancelledError,
} from "./errors";

describe("isEpisodeReadCancelledError", () => {
  it("accepts serialized cancellation errors and AbortErrors", () => {
    expect(
      isEpisodeReadCancelledError(new Error(EPISODE_READ_CANCELLED_MESSAGE)),
    ).toBe(true);

    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    expect(isEpisodeReadCancelledError(abortError)).toBe(true);
  });

  it("does not treat wrapped cancellation text as benign", () => {
    expect(
      isEpisodeReadCancelledError(
        new Error(`failed after ${EPISODE_READ_CANCELLED_MESSAGE}`),
      ),
    ).toBe(false);
  });
});
