/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type Sink = { next: (data: unknown) => void; error: (e: unknown) => void };

const harness = vi.hoisted(() => ({
  selector: null as { id: string; groupId?: string } | null,
  input: null as Record<string, unknown> | null,
  requests: [] as { variables: unknown; sink: Sink; unsubscribe: () => void }[],
}));

vi.mock("@fiftyone/relay", () => ({ samplePosition: "samplePosition" }));
vi.mock("../../atoms/modal", () => ({ modalSelector: "selector" }));
vi.mock("../../atoms/order", () => ({ modalOrderInput: "input" }));
vi.mock("@fiftyone/reverb", () => ({
  useReverbValue: (atom: "selector" | "input") => harness[atom],
}));
vi.mock("react-relay", () => ({
  useRelayEnvironment: () => ({}),
  fetchQuery: (_env: unknown, _query: unknown, variables: unknown) => ({
    subscribe: (sink: Sink) => {
      const request = { variables, sink, unsubscribe: vi.fn() };
      harness.requests.push(request);
      return { unsubscribe: request.unsubscribe };
    },
  }),
}));

import { toModalPosition, useModalPosition } from "./position";

const value = (n: number) => ({ __typename: "SamplePositionValue", value: n });
const timeout = { __typename: "%other" };
const data = (offset: unknown, total: unknown) =>
  ({ samplePosition: { offset, total } }) as Parameters<
    typeof toModalPosition
  >[0];

afterEach(() => {
  harness.selector = null;
  harness.input = null;
  harness.requests = [];
});

describe("toModalPosition", () => {
  it("reads n / total", () => {
    expect(toModalPosition(data(value(4), value(250_000)))).toEqual({
      index: 5,
      total: 250_000,
    });
  });

  it("keeps the offset when only the total timed out", () => {
    expect(toModalPosition(data(value(4), timeout))).toEqual({
      index: 5,
      total: null,
    });
  });

  it("shows nothing when the offset is unknown or timed out", () => {
    expect(toModalPosition(data(null, value(10)))).toBeNull();
    expect(toModalPosition(data(timeout, value(10)))).toBeNull();
  });
});

describe("useModalPosition", () => {
  it("asks nothing for a sample not opened from the grid", () => {
    harness.selector = { id: "s1" };
    const { result } = renderHook(() => useModalPosition());
    expect(result.current).toBeNull();
    expect(harness.requests).toEqual([]);
  });

  it("fetches in the background, naming a group by its group", () => {
    harness.input = { dataset: "d", view: [] };
    harness.selector = { id: "s1", groupId: "g1" };
    const { result } = renderHook(() => useModalPosition());
    expect(result.current).toBeNull();
    expect(harness.requests[0].variables).toEqual({
      input: { dataset: "d", view: [] },
      groupId: "g1",
    });

    act(() => harness.requests[0].sink.next(data(value(0), value(3))));
    expect(result.current).toEqual({ index: 1, total: 3 });
  });

  it("cancels the request when stepping to another sample", () => {
    harness.input = { dataset: "d", view: [] };
    harness.selector = { id: "s1" };
    const { rerender, result } = renderHook(() => useModalPosition());
    const first = harness.requests[0];

    harness.selector = { id: "s2" };
    rerender();
    expect(first.unsubscribe).toHaveBeenCalled();
    expect(harness.requests[1].variables).toEqual({
      input: { dataset: "d", view: [] },
      sampleId: "s2",
    });

    // a late answer for the last sample shows nothing for this one
    act(() => first.sink.next(data(value(0), value(3))));
    expect(result.current).toBeNull();
  });

  it("hides the position when the request fails", () => {
    harness.input = { dataset: "d", view: [] };
    harness.selector = { id: "s1" };
    const { result } = renderHook(() => useModalPosition());
    act(() => harness.requests[0].sink.error(new Error("x")));
    expect(result.current).toBeNull();
  });
});
