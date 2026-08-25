import { describe, expect, it } from "vitest";

import {
  VideoDecoderFailureError,
  VideoDependencyWaitError,
  VideoIntentCancelledError,
  VideoSchedulerClosedError,
} from "./types";

describe("video errors", () => {
  it("constructs typed errors when the host freezes the base Error name", () => {
    const errors = withReadonlyErrorName(() => [
      new VideoIntentCancelledError(),
      new VideoDependencyWaitError("waiting"),
      new VideoDecoderFailureError("failed"),
      new VideoSchedulerClosedError(),
    ]);

    expect(errors.map((error) => error.name)).toEqual([
      "VideoIntentCancelledError",
      "VideoDependencyWaitError",
      "VideoDecoderFailureError",
      "VideoSchedulerClosedError",
    ]);
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
