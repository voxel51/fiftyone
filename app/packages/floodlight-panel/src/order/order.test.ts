import { describe, expect, it, vi } from "vitest";
import type { IEnvironment } from "relay-runtime";
import { openOrder } from "./order";

const calls: Record<string, unknown>[] = [];
vi.mock("react-relay", () => ({
  fetchQuery: (_: unknown, __: unknown, variables: Record<string, unknown>) => {
    calls.push(variables);
    return {
      subscribe: (observer: {
        next: (data: unknown) => void;
        error: (error: unknown) => void;
      }) => {
        if (variables.withFirstPage) observer.error(new Error("unknown field"));
        else
          observer.next({
            openOrder: {
              __typename: "Order",
              token: "t",
              mode: "INDEXED",
              total: null,
              bounds: null,
              ticks: [],
            },
          });
        return { unsubscribe: () => undefined };
      },
    };
  },
}));
vi.mock("@fiftyone/relay", () => ({ openOrder: {} }));

describe("openOrder", () => {
  it("opens again without the first page when the open with it fails", async () => {
    const opened = await openOrder(
      {} as IEnvironment,
      { dataset: "d", view: [] },
      new AbortController().signal,
      { count: 50, filter: null, paginationData: true, maxQueryTime: null },
    );

    expect(calls.map((variables) => Boolean(variables.withFirstPage))).toEqual([
      true,
      false,
    ]);
    expect(opened).toMatchObject({ kind: "order", mode: "INDEXED" });
    expect(opened.kind === "order" && opened.first).toBeUndefined();
  });
});
