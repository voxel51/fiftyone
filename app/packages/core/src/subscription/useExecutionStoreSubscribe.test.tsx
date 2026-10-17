import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getEventSource } = vi.hoisted(() => ({ getEventSource: vi.fn() }));

vi.mock("@fiftyone/utilities/src/fetch", () => ({ getEventSource }));
vi.mock("@fiftyone/operators/src/operators", () => ({
  resolveOperatorURI: (uri: string) => uri,
}));
vi.mock("@fiftyone/state", () => ({ datasetName: {} }));
vi.mock("recoil", async () => {
  const { useCallback } =
    await vi.importActual<typeof import("react")>("react");
  const snapshot = { getLoadable: () => ({ getValue: () => "ds" }) };
  return {
    useRecoilCallback: (fn: (i: object) => () => void, deps: unknown[]) =>
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useCallback(() => fn({ snapshot })(), deps),
  };
});

import {
  setExecutionStoreTransport,
  useExecutionStoreSubscribe,
} from "./useExecutionStoreSubscribe";

afterEach(() => {
  setExecutionStoreTransport(null);
  getEventSource.mockReset();
});

describe("useExecutionStoreSubscribe transport", () => {
  it("routes through a registered transport instead of the operator stream", () => {
    const release = vi.fn();
    let request: Parameters<
      Parameters<typeof setExecutionStoreTransport>[0] & object
    >[0];
    setExecutionStoreTransport((r) => {
      request = r;
      return release;
    });
    const callback = vi.fn();

    const { result, unmount } = renderHook(() =>
      useExecutionStoreSubscribe({
        operatorUri: "@org/plugin/notifier",
        datasetId: "d1",
        callback,
      }),
    );
    act(() => request.onHealth(true));
    request.onMessage("k", { v: 1 }, { dataset_id: "d1" });

    expect(getEventSource).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      operatorUri: "@org/plugin/notifier",
      datasetId: "d1",
    });
    expect(result.current.isSubscriptionHealthy).toBe(true);
    expect(callback).toHaveBeenCalledWith("k", { v: 1 }, { dataset_id: "d1" });

    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("falls back to the operator stream when the transport declines", () => {
    setExecutionStoreTransport(() => null);

    renderHook(() =>
      useExecutionStoreSubscribe({
        operatorUri: "@org/plugin/notifier",
        callback: vi.fn(),
      }),
    );

    expect(getEventSource).toHaveBeenCalledTimes(1);
  });
});
