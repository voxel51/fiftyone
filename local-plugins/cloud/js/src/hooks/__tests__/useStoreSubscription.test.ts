/**
 * `useStoreSubscription`: the local re-implementation of core's hook, so it
 * needs the same tolerances.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StoreSubscriptionCallback,
  useStoreSubscription,
} from "../useStoreSubscription";
import { fakeEventSource } from "./fakes";

const OPERATOR_URI = "@voxel51/cloud/cloud_push_subscription";

function subscribe(onMessage = vi.fn()) {
  const source = fakeEventSource();
  const rendered = renderHook(() =>
    useStoreSubscription({
      operatorUri: OPERATOR_URI,
      datasetId: "ds-1",
      datasetName: "quickstart",
      onMessage,
      connect: source.connect,
    }),
  );
  return { source, onMessage, ...rendered };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("useStoreSubscription", () => {
  it("posts the operator uri and dataset identity", () => {
    const { source } = subscribe();

    expect(source.subscribed).toBe(true);
    expect(source.bodies[0]).toEqual({
      operator_uri: OPERATOR_URI,
      dataset_id: "ds-1",
      dataset_name: "quickstart",
    });
  });

  it("delivers parsed key/value/metadata to the callback", () => {
    const { source, onMessage } = subscribe();

    act(() => source.emit("push", { status: "running" }));

    expect(onMessage).toHaveBeenCalledWith(
      "push",
      { status: "running" },
      { source: "test" },
    );
  });

  it("skips ping events and empty-data keep-alive frames", () => {
    const { source, onMessage } = subscribe();

    act(() => {
      source.emitRaw({ event: "ping", data: "{}" });
      source.emitRaw({ data: "" });
      source.emitRaw({});
    });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("survives a malformed frame", () => {
    const { source, onMessage } = subscribe();

    act(() => source.emitRaw({ data: "{not json" }));
    act(() => source.emit("push", { status: "done" }));

    // One bad frame must not drop the subscription carrying the bar.
    expect(warn).toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it("aborts on unmount", () => {
    const { source, unmount } = subscribe();

    unmount();

    expect(source.aborted).toBe(true);
  });

  it("reconnects with a fresh controller on reset", () => {
    const { source, result, onMessage } = subscribe();

    act(() => result.current.reset());

    // An aborted controller stays aborted, so a reused one would abort the
    // new stream the instant it opened.
    expect(source.bodies).toHaveLength(2);
    expect(source.aborted).toBe(false);

    act(() => source.emit("push", { status: "running" }));
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it("does not resubscribe when only the callback identity changes", () => {
    const source = fakeEventSource();
    const { rerender } = renderHook<
      ReturnType<typeof useStoreSubscription>,
      { onMessage: StoreSubscriptionCallback<unknown> }
    >(
      ({ onMessage }) =>
        useStoreSubscription({
          operatorUri: OPERATOR_URI,
          onMessage,
          connect: source.connect,
        }),
      { initialProps: { onMessage: vi.fn() } },
    );

    rerender({ onMessage: vi.fn() });

    expect(source.bodies).toHaveLength(1);
  });
});
