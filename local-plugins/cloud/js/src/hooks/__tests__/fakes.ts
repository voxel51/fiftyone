/**
 * Injectable stand-ins for the three App seams the hooks touch: the panel
 * event trigger, the operator executor, and the SSE event source.
 *
 * Every hook takes its collaborators as arguments rather than importing
 * them, which is what makes these enough — no App, no server, no mocking of
 * `@fiftyone/*` module internals.
 */

import { CloudPanelSchemaView, PushData, PushStatus } from "../../types";
import {
  EventSourceConnect,
  EventSourceHandlers,
} from "../useStoreSubscription";
import { PanelMethods } from "../usePanelMethods";

/** Records calls and resolves from a queue of scripted replies. */
export interface FakePanelMethods extends PanelMethods {
  calls: Array<{ method: string; params: unknown }>;
  /** Queue the next result for a given method name. */
  reply(method: keyof PanelMethods, value: unknown): void;
}

export function fakePanelMethods(): FakePanelMethods {
  const calls: Array<{ method: string; params: unknown }> = [];
  const queued = new Map<string, unknown[]>();

  function record(method: keyof PanelMethods, params: unknown) {
    calls.push({ method, params });
    const pending = queued.get(method);
    return Promise.resolve(pending?.length ? pending.shift() : undefined);
  }

  return {
    calls,
    reply(method, value) {
      const pending = queued.get(method) ?? [];
      pending.push(value);
      queued.set(method, pending);
    },
    startPairing: (params) => record("startPairing", params) as never,
    pollPairing: (params) => record("pollPairing", params) as never,
    cancelPairing: () => record("cancelPairing", {}) as never,
    disconnect: () => record("disconnect", {}) as never,
    resetPush: () => record("resetPush", {}) as never,
  };
}

/** A `useOperatorExecutor` stand-in with a controllable `isExecuting`. */
export interface FakeExecutor {
  execute(params: Record<string, unknown>): void;
  calls: Array<Record<string, unknown>>;
  isExecuting: boolean;
  setExecuting(value: boolean): void;
}

export function fakeExecutor(): FakeExecutor {
  const calls: Array<Record<string, unknown>> = [];
  const executor: FakeExecutor = {
    calls,
    isExecuting: false,
    execute(params) {
      calls.push(params);
    },
    setExecuting(value) {
      executor.isExecuting = value;
    },
  };
  return executor;
}

/** An event source that lets a test push store frames on demand. */
export interface FakeEventSource {
  connect: EventSourceConnect;
  /** Delivers a well-formed `{ key, value, metadata }` frame. */
  emit(key: string, value: unknown): void;
  /** Delivers a raw frame — for pings, keep-alives and malformed data. */
  emitRaw(event: { event?: string; data?: string }): void;
  bodies: Array<Record<string, unknown>>;
  subscribed: boolean;
  get aborted(): boolean;
  abortCount: number;
}

export function fakeEventSource(): FakeEventSource {
  let handlers: EventSourceHandlers | null = null;
  let signal: AbortSignal | null = null;
  const source: FakeEventSource = {
    bodies: [],
    subscribed: false,
    abortCount: 0,
    get aborted() {
      return signal?.aborted ?? false;
    },
    connect(path, nextHandlers, nextSignal, body) {
      void path;
      handlers = nextHandlers;
      signal = nextSignal;
      source.subscribed = true;
      source.bodies.push(body);
      nextSignal.addEventListener("abort", () => {
        source.abortCount += 1;
      });
    },
    emit(key, value) {
      source.emitRaw({
        data: JSON.stringify({ key, value, metadata: { source: "test" } }),
      });
    },
    emitRaw(event) {
      handlers?.onmessage?.(event);
    },
  };
  return source;
}

/**
 * A complete `PushData` with the given overrides — panel data is never
 * partial, so tests should not hand-build half of one.
 */
export function pushData(overrides: Partial<PushData>): PushData {
  return {
    status: PushStatus.Idle,
    updated_at: new Date().toISOString(),
    local_dataset: "local-dataset",
    done: 0,
    total: 0,
    ...overrides,
  };
}

/** The schema view a connected panel renders from. */
export function schemaView(
  overrides: Partial<CloudPanelSchemaView> = {},
): CloudPanelSchemaView {
  return {
    start_pairing: "@voxel51/cloud/cloud_panel#start_pairing",
    poll_pairing: "@voxel51/cloud/cloud_panel#poll_pairing",
    cancel_pairing: "@voxel51/cloud/cloud_panel#cancel_pairing",
    disconnect: "@voxel51/cloud/cloud_panel#disconnect",
    reset_push: "@voxel51/cloud/cloud_panel#reset_push",
    local_dataset: "local-dataset",
    dataset_count: 10,
    view_count: 4,
    has_view: false,
    ...overrides,
  };
}
