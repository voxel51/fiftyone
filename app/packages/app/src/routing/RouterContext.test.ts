import { Resource } from "@fiftyone/utilities";
import {
  fetchQuery,
  Observable,
  type ConcreteRequest,
  type Environment,
} from "relay-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRouter } from "./RouterContext";

vi.mock("react-relay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-relay")>()),
  loadQuery: vi.fn(() => ({ dispose: vi.fn() })),
}));
vi.mock("relay-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("relay-runtime")>()),
  fetchQuery: vi.fn(),
}));

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("current URL search parameters", () => {
  it("includes shared UI query changes before a modal or view builds its URL", () => {
    window.history.replaceState({}, "", "/datasets/one");
    // No routes are loaded in this test, so the Relay environment is unused.
    const router = createRouter({} as Environment, []);
    window.history.replaceState(
      window.history.state,
      "",
      "?subset=one&id=sample",
    );
    expect(router.context.location.search).toBe("?subset=one&id=sample");
    window.history.replaceState(window.history.state, "", "?id=sample");
    expect(router.context.location.search).toBe("?id=sample");
    router.cleanup();
  });

  it("does not mix an outgoing route with the next dataset's query", () => {
    window.history.replaceState({}, "", "/datasets/one?subset=one");
    const router = createRouter({} as Environment, []);
    window.history.replaceState(
      window.history.state,
      "",
      "/datasets/two?subset=two",
    );
    expect(router.context.location.pathname).toBe("/datasets/one");
    expect(router.context.location.search).toBe("?subset=one");
    router.cleanup();
  });
});

it("does not publish a completed route superseded before its animation frame", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  const requests = new Map<string, () => void>();
  vi.mocked(fetchQuery).mockImplementation((_environment, _query, variables) =>
    Observable.create((sink) => {
      requests.set(String(variables.name), () => sink.next({ dataset: null }));
    }),
  );
  const router = createRouter({} as Environment, [
    {
      path: "/datasets/:name",
      component: new Resource(async () => () => null),
      // The request is consumed only by the controlled Relay mocks.
      query: new Resource(async () => ({}) as ConcreteRequest),
    },
  ]);
  const published = vi.fn();
  const pending = vi.fn();
  router.context.subscribe(published, pending);
  const flushFrames = () => frames.splice(0).forEach((frame) => frame(0));

  try {
    window.history.replaceState({}, "", "/datasets/one");
    // createBrowserHistory captured the initial URL at construction.
    router.context.history.replace("/datasets/one", {});
    const initial = router.context.load();
    await vi.waitFor(() => expect(requests.has("one")).toBe(true));
    requests.get("one")!();
    await initial;
    await vi.waitFor(() => expect(frames.length).toBe(2));
    flushFrames();
    published.mockClear();
    pending.mockClear();

    router.context.history.push("/datasets/two", {});
    await vi.waitFor(() => expect(requests.has("two")).toBe(true));
    requests.get("two")!();
    await vi.waitFor(() => expect(frames.length).toBe(2));

    // The completed second entry has queued its publication, but a third
    // request starts before that frame. Its pending entry cannot be read.
    router.context.history.push("/datasets/three", {});
    await vi.waitFor(() => expect(requests.has("three")).toBe(true));
    flushFrames();
    expect(published).not.toHaveBeenCalled();
    expect(pending).toHaveBeenCalledTimes(1);
    expect(router.context.get().pathname).toBe("/datasets/one");

    requests.get("three")!();
    await vi.waitFor(() => expect(frames.length).toBe(1));
    flushFrames();
    expect(published).toHaveBeenCalledTimes(1);
    expect(published.mock.calls[0][0].pathname).toBe("/datasets/three");
    expect(router.context.get().pathname).toBe("/datasets/three");
  } finally {
    router.cleanup();
  }
});
