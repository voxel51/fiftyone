/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { setImmediate } from "node:timers/promises";
import { Resource } from "@fiftyone/utilities";
import type { Session } from "@fiftyone/state";
import type { ConcreteRequest, Environment } from "relay-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import makeRoutes, { type Queries } from "../makeRoutes";
import { createRouter, type RoutingContext } from "../routing/RouterContext";
import type { Route } from "../routing";

type QueryRequest = {
  resolve: (data: object) => void;
};

const mocks = vi.hoisted(() => ({
  commitMutation: vi.fn(),
  fetchQuery: vi.fn(),
  before: new Set<() => void>(),
  router: undefined as RoutingContext<Queries> | undefined,
  session: {} as Session,
}));

vi.mock("relay-runtime", () => ({
  commitMutation: mocks.commitMutation,
  fetchQuery: mocks.fetchQuery,
}));
vi.mock("react-relay", () => ({
  loadQuery: (_: unknown, __: unknown, variables: object) => ({ variables }),
}));
vi.mock("@fiftyone/relay", () => ({
  setFieldVisibilityStage: {},
  subscribeBefore: (callback: () => void) => {
    mocks.before.add(callback);
    return () => mocks.before.delete(callback);
  },
}));
vi.mock("@fiftyone/state", () => ({
  stateSubscription: "subscription",
  viewsAreEqual: (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b),
  useSessionRef: () => mocks.session,
  useSessionSetter: () => vi.fn(),
}));
vi.mock("recoil", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recoil")>()),
  // Invoke the event callback without mounting the unrelated App providers.
  useRecoilCallback: (
    factory: (context: { set: () => void }) => (payload: unknown) => void,
  ) => factory({ set: () => undefined }),
}));
vi.mock("../Renderer", () => ({ pendingEntry: "pendingEntry" }));
vi.mock("../routing", async () => ({
  ...(await import("../routing/matchPath")),
  useRouterContext: () => mocks.router,
}));

import useSetFieldVisibilityStage from "../useEvents/useSetFieldVisibilityStage";
import onSetFieldVisibilityStage from "./onSetFieldVisibilityStage";

const STAGE = {
  _cls: "fiftyone.core.stages.ExcludeFields",
  kwargs: { field_names: ["labels"], _allow_missing: true },
};
const VALUE = { cls: STAGE._cls, kwargs: { field_names: ["labels"] } };
const STATE = {
  view: [{ _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 5]] }],
  schemaExclusion: ["secret"],
  groupSlice: "left",
  modalSelector: { id: "sample-id" },
  workspace: { _name: "review", children: [] },
  fieldVisibility: {
    _cls: STAGE._cls,
    kwargs: { field_names: ["previous"], _allow_missing: true },
  },
};
const URL =
  "/datasets/dataset?view=kept&subset=demo&id=sample-id&slice=left&workspace=review";

beforeEach(() => {
  mocks.before.clear();
  mocks.commitMutation.mockReset();
  mocks.session = {} as Session;
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("field visibility during a hard refresh", () => {
  it.each(["local", "reset", "server"] as const)(
    "preserves route and session state for a %s update",
    async (kind) => {
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal(
        "requestAnimationFrame",
        (callback: FrameRequestCallback) => {
          frames.push(callback);
          return frames.length;
        },
      );
      let requested: (request: QueryRequest) => void;
      let nextRequest = new Promise<QueryRequest>((resolve) => {
        requested = resolve;
      });
      const takeRequest = async () => {
        const result = await nextRequest;
        nextRequest = new Promise<QueryRequest>((resolve) => {
          requested = resolve;
        });
        return result;
      };
      mocks.fetchQuery.mockImplementation(() => ({
        subscribe: ({ next }: { next: (data: object) => void }) => {
          requested({ resolve: next });
          return { unsubscribe: vi.fn() };
        },
      }));
      const flushFrames = async () => {
        await setImmediate();
        frames.splice(0).forEach((callback) => callback(0));
        await setImmediate();
      };
      const route = makeRoutes().find(({ path }) => path === "/datasets/:name");
      if (!route) throw new Error("dataset route missing");
      const routerObject = createRouter({} as Environment, [
        {
          ...route,
          component: new Resource<Route<Queries>>(async () => () => null),
          query: new Resource<ConcreteRequest>(
            async () => ({}) as ConcreteRequest,
          ),
        },
      ]);
      const router = routerObject.context;
      mocks.router = router;
      const publications: string[] = [];
      router.subscribe((entry) => {
        publications.push(entry.state.event ?? "refresh");
        for (const callback of mocks.before) callback();
      });
      try {
        router.history.replace(URL, STATE);
        const initialRequest = takeRequest();
        const initial = router.load();
        (await initialRequest).resolve({});
        await initial;
        await flushFrames();
        publications.length = 0;

        const refreshRequest = takeRequest();
        const refreshing = router.load(true);
        const refresh = await refreshRequest;
        expect(() => router.get()).toThrow("entry is loading");

        if (kind === "server") {
          const handler = useSetFieldVisibilityStage(
            {} as Parameters<typeof useSetFieldVisibilityStage>[0],
          );
          handler({ stage: STAGE });
        } else {
          onSetFieldVisibilityStage({
            environment: {} as Environment,
            router,
            sessionRef: { current: mocks.session },
            setter: vi.fn(),
            subscription: "subscription",
            handleError: vi.fn(),
          })(
            { get: () => "subscription", set: vi.fn() } as never,
            kind === "reset" ? undefined : VALUE,
          );
        }
        const stage = kind === "reset" ? undefined : STAGE;
        expect(router.location.state).toEqual({
          ...STATE,
          event: "fieldVisibility",
          fieldVisibility: stage,
        });
        expect(mocks.commitMutation).toHaveBeenCalledTimes(
          kind === "server" ? 0 : 1,
        );
        if (kind !== "server") {
          expect(mocks.commitMutation.mock.calls[0][1].variables).toEqual({
            stage,
            subscription: "subscription",
          });
        }

        // The replacement query waits for the old refresh. Its publication
        // must supersede the refresh rather than consume the session callback.
        const replacementRequest = takeRequest();
        refresh.resolve({});
        await refreshing;
        const replacement = await replacementRequest;
        await flushFrames();
        expect(publications).toEqual([]);
        expect(mocks.before.size).toBe(1);
        replacement.resolve({});
        await flushFrames();
        expect(publications).toEqual(["fieldVisibility"]);
        expect(mocks.before.size).toBe(0);
        expect(mocks.session.fieldVisibilityStage).toEqual(
          kind === "reset"
            ? undefined
            : kind === "server"
              ? { cls: STAGE._cls, kwargs: STAGE.kwargs }
              : VALUE,
        );
        expect(router.get().state).toMatchObject({
          ...STATE,
          fieldVisibility: stage,
          name: "dataset",
          savedViewSlug: "kept",
          extendedView: [
            ...STATE.view,
            ...(stage ? [stage] : []),
            {
              _cls: STAGE._cls,
              kwargs: { field_names: ["secret"], _allow_missing: true },
            },
          ],
        });
        expect(router.location.pathname + router.location.search).toBe(URL);
      } finally {
        routerObject.cleanup();
      }
    },
  );
});
