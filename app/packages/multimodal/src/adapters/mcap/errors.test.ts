import { describe, expect, it } from "vitest";
import {
  MCAP_READ_CANCELLED_MESSAGE,
  isMcapReadCancelledError,
  mcapErrorMessage,
} from "./errors";

describe("mcapErrorMessage", () => {
  it("explains when the recording request returns HTTP 404", () => {
    const error = Object.assign(new Error(""), { code: 404 });

    expect(mcapErrorMessage(error)).toBe(
      "Recording not found (HTTP 404). Check that the file still exists at its configured path and is accessible to FiftyOne.",
    );
  });

  it("preserves other error messages", () => {
    expect(mcapErrorMessage(new Error("Invalid MCAP footer"))).toBe(
      "Invalid MCAP footer",
    );
  });
});

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
