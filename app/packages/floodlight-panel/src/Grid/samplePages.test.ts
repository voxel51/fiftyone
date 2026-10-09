import { describe, expect, it, vi } from "vitest";
import type { IEnvironment } from "relay-runtime";
import { createLimiter, fetchSamplePage } from "./samplePages";

const unsubscribe = vi.fn();
let sink: { next: (data: unknown) => void } | undefined;

vi.mock("react-relay", () => ({
  fetchQuery: () => ({
    subscribe: (observer: { next: (data: unknown) => void }) => {
      sink = observer;
      return { unsubscribe };
    },
  }),
}));
vi.mock("@fiftyone/relay", () => ({
  isPaginateSamplesConnection: () => true,
  paginateSamples: {},
}));

const environment = {} as IEnvironment;

describe("fetchSamplePage", () => {
  it("unsubscribes and rejects when aborted, so nothing lands", async () => {
    const controller = new AbortController();
    const page = fetchSamplePage(environment, {} as never, controller.signal);

    controller.abort();
    sink?.next({ samples: { edges: [] } });

    await expect(page).rejects.toThrow();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("never subscribes once aborted", async () => {
    sink = undefined;
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchSamplePage(environment, {} as never, controller.signal),
    ).rejects.toThrow();
    expect(sink).toBeUndefined();
  });
});

describe("createLimiter", () => {
  it("drops a queued task whose signal aborts", async () => {
    const limit = createLimiter(1);
    let release!: () => void;
    const first = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const second = vi.fn(async () => undefined);
    const controller = new AbortController();

    limit(first);
    limit(second, controller.signal);
    controller.abort();
    release();
    await new Promise((resolve) => setTimeout(resolve));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("never runs more than `max` at once", async () => {
    const limit = createLimiter(2);
    let running = 0;
    let most = 0;
    const task = async () => {
      running++;
      most = Math.max(most, running);
      await Promise.resolve();
      running--;
    };

    await Promise.all(Array.from({ length: 10 }, () => limit(task)));
    expect(most).toBe(2);
  });
});
