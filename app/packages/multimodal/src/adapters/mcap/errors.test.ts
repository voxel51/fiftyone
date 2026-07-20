import { describe, expect, it } from "vitest";
import {
  errorMessage,
  isReadCancelledError,
  READ_CANCELLED_MESSAGE,
} from "../../errors";

describe("errorMessage", () => {
  it("explains when the recording request returns HTTP 404", () => {
    const error = Object.assign(new Error(""), { code: 404 });

    expect(errorMessage(error)).toBe(
      "Recording not found (HTTP 404). Check that the file still exists at its configured path and is accessible to FiftyOne.",
    );
  });

  it("preserves other error messages", () => {
    expect(errorMessage(new Error("Invalid MCAP footer"))).toBe(
      "Invalid MCAP footer",
    );
  });
});

describe("isReadCancelledError", () => {
  it("accepts canonical cancellation errors and AbortErrors", () => {
    expect(isReadCancelledError(new Error(READ_CANCELLED_MESSAGE))).toBe(true);

    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    expect(isReadCancelledError(abortError)).toBe(true);
  });

  it("does not treat wrapped cancellation text as benign", () => {
    expect(
      isReadCancelledError(new Error(`failed after ${READ_CANCELLED_MESSAGE}`)),
    ).toBe(false);
  });
});
