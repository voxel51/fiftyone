import { describe, expect, it } from "vitest";

import {
  ABORT_ERROR_NAME,
  createAbortError,
  DEFAULT_ABORT_ERROR_MESSAGE,
  throwIfAborted,
} from "./cancellation";

describe("cancellation identity", () => {
  it("creates a fresh Error with stable name, message, and creation stack", () => {
    const first = createAbortError();
    const second = createAbortError("Indexed read aborted");

    expect(first).toBeInstanceOf(Error);
    expect(first.constructor).toBe(Error);
    expect(first.name).toBe(ABORT_ERROR_NAME);
    expect(first.message).toBe(DEFAULT_ABORT_ERROR_MESSAGE);
    expect(first.stack).toContain("createAbortError");
    expect(second).not.toBe(first);
    expect(second.message).toBe("Indexed read aborted");
  });

  it("accepts absent and active signals without throwing", () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();
    expect(() => throwIfAborted(null)).not.toThrow();
    expect(() => throwIfAborted(new AbortController().signal)).not.toThrow();
  });

  it("guards both pre-work and post-work cancellation checkpoints", () => {
    const preWork = new AbortController();
    preWork.abort();
    const preEvents: string[] = [];
    expect(() => {
      throwIfAborted(preWork.signal);
      preEvents.push("work");
    }).toThrowError(DEFAULT_ABORT_ERROR_MESSAGE);
    expect(preEvents).toEqual([]);

    const postWork = new AbortController();
    const postEvents: string[] = [];
    expect(() => {
      throwIfAborted(postWork.signal);
      postEvents.push("work");
      postWork.abort();
      throwIfAborted(postWork.signal);
    }).toThrowError(DEFAULT_ABORT_ERROR_MESSAGE);
    expect(postEvents).toEqual(["work"]);
  });
});
