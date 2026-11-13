import { describe, expect, test, vi } from "vitest";
import { LocalEventTarget } from "./local-target";

describe("LocalEventTarget", () => {
  test("a listener receives the type and detail, synchronously", () => {
    const target = new LocalEventTarget();
    const listener = vi.fn();
    target.addEventListener("select", listener);

    target.dispatch("select", { id: "1" });

    expect(listener).toHaveBeenCalledWith({
      type: "select",
      detail: { id: "1" },
    });
  });

  test("a dispatched DOM event reaches listeners as itself", () => {
    const target = new LocalEventTarget();
    const listener = vi.fn();
    target.addEventListener("error", listener);
    const error = new ErrorEvent("error", { error: new Error("boom") });

    target.dispatch("error", error);

    expect(listener).toHaveBeenCalledWith(error);
  });

  test("an Error payload is also the event's error, as on an ErrorEvent", () => {
    const target = new LocalEventTarget();
    const listener = vi.fn();
    target.addEventListener("error", listener);
    const error = new Error("boom");

    target.dispatch("error", error);

    expect(listener).toHaveBeenCalledWith({
      type: "error",
      detail: error,
      error,
    });
  });

  test("listeners on one target never hear another's events", () => {
    const one = new LocalEventTarget();
    const other = new LocalEventTarget();
    const listener = vi.fn();
    one.addEventListener("load", listener);

    other.dispatch("load");

    expect(listener).not.toHaveBeenCalled();
  });

  test("a listener object's handleEvent is called", () => {
    const target = new LocalEventTarget();
    const handleEvent = vi.fn();
    target.addEventListener("load", { handleEvent });

    target.dispatch("load", 1);

    expect(handleEvent).toHaveBeenCalledWith({ type: "load", detail: 1 });
  });

  test("a listener added twice runs once", () => {
    const target = new LocalEventTarget();
    const listener = vi.fn();
    target.addEventListener("load", listener);
    target.addEventListener("load", listener);

    target.dispatch("load");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("removeEventListener detaches a listener", () => {
    const target = new LocalEventTarget();
    const listener = vi.fn();
    target.addEventListener("load", listener);
    target.removeEventListener("load", listener);

    target.dispatch("load");

    expect(listener).not.toHaveBeenCalled();
  });

  test("a once listener runs for the first event only", () => {
    const target = new LocalEventTarget();
    const listener = vi.fn();
    target.addEventListener("load", listener, { once: true });

    target.dispatch("load");
    target.dispatch("load");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("aborting the signal detaches its listeners", () => {
    const target = new LocalEventTarget();
    const controller = new AbortController();
    const listener = vi.fn();
    target.addEventListener("load", listener, { signal: controller.signal });

    controller.abort();
    target.dispatch("load");

    expect(listener).not.toHaveBeenCalled();
  });

  test("a listener added with an aborted signal never attaches", () => {
    const target = new LocalEventTarget();
    const controller = new AbortController();
    controller.abort();
    const listener = vi.fn();
    target.addEventListener("load", listener, { signal: controller.signal });

    target.dispatch("load");

    expect(listener).not.toHaveBeenCalled();
  });
});
