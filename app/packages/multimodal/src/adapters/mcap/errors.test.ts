import { describe, expect, it } from "vitest";
import {
  MCAP_READ_CANCELLED_MESSAGE,
  isMcapReadCancelledError,
} from "./errors";

describe("isMcapReadCancelledError", () => {
  it("accepts canonical cancellation errors and AbortErrors", () => {
    expect(
      isMcapReadCancelledError(new Error(MCAP_READ_CANCELLED_MESSAGE)),
    ).toBe(true);

    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    expect(isMcapReadCancelledError(abortError)).toBe(true);
  });

  it("does not treat wrapped cancellation text as benign", () => {
    expect(
      isMcapReadCancelledError(
        new Error(`failed after ${MCAP_READ_CANCELLED_MESSAGE}`),
      ),
    ).toBe(false);
  });
});
