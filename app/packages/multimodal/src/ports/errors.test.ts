import { describe, expect, it } from "vitest";

import {
  EpisodeReadCancelledError,
  EpisodeReadUnsupportedError,
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
    expect(
      isEpisodeReadCancelledError(new DOMException("Aborted", "AbortError")),
    ).toBe(true);
  });

  it("does not treat wrapped cancellation text as benign", () => {
    expect(
      isEpisodeReadCancelledError(
        new Error(`failed after ${EPISODE_READ_CANCELLED_MESSAGE}`),
      ),
    ).toBe(false);
  });

  it("constructs typed errors when the host freezes the base Error name", () => {
    const cancelled = withReadonlyErrorName(
      () => new EpisodeReadCancelledError(),
    );
    const unsupported = withReadonlyErrorName(
      () => new EpisodeReadUnsupportedError("seek", "unsupported"),
    );

    expect(cancelled).toMatchObject({
      message: EPISODE_READ_CANCELLED_MESSAGE,
      name: "EpisodeReadCancelledError",
    });
    expect(unsupported).toMatchObject({
      message: "unsupported",
      name: "EpisodeReadUnsupportedError",
      operation: "seek",
    });
  });
});

function withReadonlyErrorName<T>(construct: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(Error.prototype, "name");
  if (!descriptor) throw new Error("Error.prototype.name is unavailable");
  Object.defineProperty(Error.prototype, "name", {
    ...descriptor,
    writable: false,
  });
  try {
    return construct();
  } finally {
    Object.defineProperty(Error.prototype, "name", descriptor);
  }
}
