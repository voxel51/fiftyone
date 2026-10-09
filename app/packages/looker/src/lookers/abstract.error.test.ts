import { LocalEventTarget } from "@fiftyone/events";
import { describe, expect, it, vi } from "vitest";
import { VideoLooker } from "./video";

const looker = () => {
  const eventTarget = new LocalEventTarget();
  return { eventTarget, updater: vi.fn() };
};

describe("looker error events", () => {
  it("puts an error a worker reports in the looker's state", () => {
    const target = looker();
    const listener = vi.fn();
    target.eventTarget.addEventListener("error", listener);
    const error = new Error("decode failed");

    VideoLooker.prototype.dispatchEvent.call(target, "error", error);

    expect(target.updater).toHaveBeenCalledExactlyOnceWith({ error });
    expect(listener).not.toHaveBeenCalled();
  });

  it("sends other events to the looker's listeners as { type, detail }", () => {
    const target = looker();
    const listener = vi.fn();
    target.eventTarget.addEventListener("load", listener);

    VideoLooker.prototype.dispatchEvent.call(target, "load", { page: 1 });

    expect(target.updater).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: "load",
      detail: { page: 1 },
    });
  });
});

describe("looker error listeners", () => {
  it("receive an uncaught error as both `error` and `detail`", () => {
    const eventTarget = new LocalEventTarget();
    const listener = vi.fn();
    eventTarget.addEventListener("error", listener);
    const error = new Error("render failed");

    eventTarget.dispatch("error", error);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      detail: error,
      error,
    });
  });
});
