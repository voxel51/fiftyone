import { Page } from "@playwright/test";

/**
 * Handle for an armed app-event listener. Deliberately not a thenable:
 * an async method returning a bare promise would adopt (flatten) it, making
 * "armed" and "received" indistinguishable to callers.
 */
export class ArmedEvent {
  private disposed = false;

  constructor(
    readonly received: Promise<void>,
    private readonly teardown: () => Promise<void> = async () => undefined,
  ) {}

  /** Detach the in-page listener. Idempotent; safe after navigation. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.teardown();
  }
}

export interface CountedEvent {
  /** `performance.now()` at dispatch */
  t: number;
  detail?: unknown;
}

declare global {
  interface Window {
    /** Per-counter event records installed by {@link EventUtils.counter}. */
    __EVENT_COUNTS__?: Record<string, CountedEvent[]>;
    /** Detach functions of armed listeners, by exposed-function name. */
    __FO_ARMED__?: Record<string, () => void>;
    /** The app's event-bus tap (`@fiftyone/events`). */
    __FO_EVENTS__?: {
      tap: (listener: (event: string, data: unknown) => void) => () => void;
    };
    /** Bus listeners of {@link EventUtils.initCounter}, tapped once the bus loads. */
    __FO_BUS_COUNTERS__?: ((event: string, data: unknown) => void)[];
    /** The document's `e2e:` events since its start, from {@link EventUtils.recordLoads}. */
    __FO_EVENT_LOG__?: {
      records: { event: string; detail: Record<string, unknown> }[];
      waiters: Set<() => void>;
    };
  }
}

/** Pages whose documents hand every bus event to their bus listeners */
const busTapPages = new WeakSet<Page>();

/**
 * Hand every bus event of each document this page loads to the listeners in
 * `window.__FO_BUS_COUNTERS__`. The bus registry assigns `__FO_EVENTS__` while
 * the App loads, after init scripts run, so the tap is installed the moment
 * it is assigned. Installed once per page; listeners register separately.
 */
const ensureBusTap = async (page: Page): Promise<void> => {
  if (busTapPages.has(page)) return;
  busTapPages.add(page);
  await page.addInitScript(() => {
    const listeners = (window.__FO_BUS_COUNTERS__ ??= []);
    Object.defineProperty(window, "__FO_EVENTS__", {
      configurable: true,
      set(bus: NonNullable<Window["__FO_EVENTS__"]>) {
        Object.defineProperty(window, "__FO_EVENTS__", {
          configurable: true,
          writable: true,
          value: bus,
        });
        bus.tap((event, data) =>
          listeners.forEach((listen) => listen(event, data)),
        );
      },
    });
  });
};

/** Pages whose every document records its `e2e:` events from the start */
const recordingPages = new WeakSet<Page>();

/**
 * Handle for counting occurrences of an app event. Created by
 * {@link EventUtils.initCounter}; counts accumulate from document start.
 */
export class EventCounter {
  constructor(
    private readonly page: Page,
    private readonly key: string,
  ) {}

  /**
   * The number of events observed since creation. Counts live in the page
   * and are read through an evaluation, which runs after all previously
   * dispatched events — no event can be in flight and missed.
   */
  async read(): Promise<number> {
    return (await this.timeline()).length;
  }

  /** Every observed event with its dispatch time and detail. */
  async timeline(): Promise<CountedEvent[]> {
    return this.page.evaluate(
      (key_) => window.__EVENT_COUNTS__?.[key_] ?? [],
      this.key,
    );
  }
}

/** An observed event: its name (one of the names waited on) and payload */
export type ObservedEvent = { event: string; detail?: unknown };

/** An event (or one of several) to wait for, and the payload it must carry */
export type EventCondition = {
  events: string | readonly string[];
  predicate?: (e: ObservedEvent) => boolean;
};

type ArmHandler = (e: ObservedEvent) => boolean;

/** An armed wait not yet satisfied, kept to explain a test that hangs */
interface PendingWait {
  names: string[];
  armedAt: number;
  /** Where the page's event record stood at arming; -1 if it has none */
  recordFrom: number;
  caller: string;
  /** The last few events its predicate rejected, on any channel */
  rejected: ObservedEvent[];
  rejectedCount: number;
}

/** Rejected events a pending wait keeps for its report */
const REJECTED_KEPT = 5;

/** Every pending wait on a page, whichever EventUtils armed it */
const pendingWaits = new WeakMap<Page, Map<string, PendingWait>>();

const pendingFor = (page: Page) => {
  let pending = pendingWaits.get(page);
  if (!pending) {
    pending = new Map();
    pendingWaits.set(page, pending);
  }
  return pending;
};

/** The spec or POM line that armed a wait */
const armingCaller = (): string => {
  const frames = (new Error().stack ?? "").split("\n").slice(1);
  const frame = frames.find(
    (line) => line.includes("/src/") && !line.includes("/event-utils/"),
  );
  return frame?.trim().replace(/^at /, "") ?? "unknown";
};

/**
 * One exposed binding per page routes every armed listener by id. Playwright
 * cannot remove a binding, so a binding per arm would pile up across a spec.
 */
const dispatchers = new WeakMap<
  Page,
  { name: string; handlers: Map<string, ArmHandler>; exposed: Promise<void> }
>();

const dispatcherFor = (page: Page) => {
  let dispatcher = dispatchers.get(page);
  if (!dispatcher) {
    const handlers = new Map<string, ArmHandler>();
    const name = getFunctionNameWithRandomSuffix("__fo_event_utils");
    // an id with no handler has resolved or been disposed: detach it
    const exposed = page.exposeFunction(
      name,
      (id: string, e: ObservedEvent) => handlers.get(id)?.(e) ?? true,
    );
    dispatcher = { name, handlers, exposed };
    dispatchers.set(page, dispatcher);
  }
  return dispatcher;
};

export class EventUtils {
  constructor(private readonly page: Page) {}

  /**
   * Arm a listener for an app event (or the first of several): an
   * `@fiftyone/events` bus event on any channel, an `e2e:` signal or one the
   * App sends for its own use. Resolves only after the in-page listener is
   * attached, so an event fired any time after arming is guaranteed to be
   * observed — arm BEFORE the action that fires the event, then await the
   * handle's `received` after it:
   *
   *   const armed = await eventUtils.arm("grid-mount");
   *   await actionThatRemountsGrid();
   *   await armed.received;
   */
  public async arm(
    events: string | readonly string[],
    predicate: (e: ObservedEvent) => boolean = () => true,
  ): Promise<ArmedEvent> {
    const dispatcher = dispatcherFor(this.page);
    await dispatcher.exposed;
    const names = typeof events === "string" ? [events] : [...events];
    const id = getFunctionNameWithRandomSuffix(names.join("|"));

    let resolveReceived: () => void;
    const received = new Promise<void>((resolve) => {
      resolveReceived = resolve;
    });

    const pending = pendingFor(this.page);
    const wait: PendingWait = {
      names,
      armedAt: Date.now(),
      recordFrom: -1,
      caller: armingCaller(),
      rejected: [],
      rejectedCount: 0,
    };

    // the return value tells the page to detach once the wait is satisfied
    dispatcher.handlers.set(id, (e) => {
      const matched = predicate(e);
      if (matched) {
        dispatcher.handlers.delete(id);
        pending.delete(id);
        resolveReceived();
      } else {
        wait.rejectedCount += 1;
        wait.rejected.push(e);
        if (wait.rejected.length > REJECTED_KEPT) wait.rejected.shift();
      }
      return matched;
    });

    // the listener is attached in its own evaluate — not inside the promise
    // that carries the wait — so attachment is complete when `arm` returns
    const armedAt = await this.page.evaluate(
      ({ names_, dispatcher_, id_ }) => {
        if (!window.__FO_EVENTS__) {
          return null;
        }
        let detach = () => {};
        const deliver = (event: string, detail: unknown) => {
          // @ts-expect-error - the function is exposed at runtime
          window[dispatcher_](id_, { event, detail }).then(
            (matched: boolean) => matched && detach(),
          );
        };

        // bus payloads can hold live objects; forward only primitive fields
        const offBus = window.__FO_EVENTS__.tap((event, data) => {
          if (!names_.includes(event)) return;
          deliver(
            event,
            Object.fromEntries(
              Object.entries((data ?? {}) as Record<string, unknown>).filter(
                ([, v]) =>
                  v === null ||
                  (typeof v !== "object" && typeof v !== "function"),
              ),
            ),
          );
        });

        const armed = (window.__FO_ARMED__ ??= {});
        detach = () => {
          offBus();
          delete armed[id_];
        };
        armed[id_] = detach;
        return window.__FO_EVENT_LOG__?.records.length ?? -1;
      },
      { names_: names, dispatcher_: dispatcher.name, id_: id },
    );
    if (armedAt === null) {
      dispatcher.handlers.delete(id);
      throw new Error(
        `no event bus on this page to wait for ${names.join(" | ")} ` +
          `(armed at ${wait.caller}); has the App loaded?`,
      );
    }
    wait.recordFrom = armedAt;
    pending.set(id, wait);

    return new ArmedEvent(received, async () => {
      dispatcher.handlers.delete(id);
      pending.delete(id);
      await this.page
        .evaluate((key): void => window.__FO_ARMED__?.[key]?.(), id)
        // a navigated or closed page took the listener with it
        .catch((): void => undefined);
    });
  }

  /**
   * Record the `e2e:` events of every document this page loads from here on,
   * from each document's start. Call before navigating; idempotent.
   */
  public async recordLoads(): Promise<void> {
    if (recordingPages.has(this.page)) return;
    recordingPages.add(this.page);

    await ensureBusTap(this.page);
    await this.page.addInitScript(() => {
      if (window.__FO_EVENT_LOG__) return;
      const log: NonNullable<Window["__FO_EVENT_LOG__"]> = {
        records: [],
        waiters: new Set(),
      };
      window.__FO_EVENT_LOG__ = log;

      const counters = (window.__FO_BUS_COUNTERS__ ??= []);
      counters.push((event, data) => {
        if (!event.startsWith("e2e:")) return;
        // bus payloads can hold live objects; keep only primitive fields
        const detail = Object.fromEntries(
          Object.entries((data ?? {}) as Record<string, unknown>).filter(
            ([, v]) =>
              v === null || (typeof v !== "object" && typeof v !== "function"),
          ),
        );
        log.records.push({ event, detail });
        log.waiters.forEach((wake) => wake());
      });
    });
  }

  /**
   * Run `navigate` and resolve once one of `events` has fired in the document
   * it leaves the page on, counting from that document's start. A navigation
   * drops every armed listener, so this reads the record
   * {@link recordLoads} keeps, which must be installed before `navigate`.
   */
  public async afterNavigation<T>(
    events: string | readonly string[],
    navigate: () => Promise<T>,
    predicate: (e: ObservedEvent) => boolean = () => true,
  ): Promise<T> {
    if (!recordingPages.has(this.page)) {
      throw new Error("afterNavigation needs recordLoads() before navigating");
    }
    const names = typeof events === "string" ? [events] : [...events];
    const result = await navigate();

    const pending = pendingFor(this.page);
    const id = getFunctionNameWithRandomSuffix(names.join("|"));
    const wait: PendingWait = {
      names,
      armedAt: Date.now(),
      recordFrom: 0,
      caller: armingCaller(),
      rejected: [],
      rejectedCount: 0,
    };
    // left in place on a throw: only a failed test reports it, and a timed-out
    // test's teardown navigates away before the report is written
    pending.set(id, wait);
    for (let from = 0; ; ) {
      const record = await this.page
        .evaluate(
          ({ names_, from_ }) =>
            new Promise<{ index: number; event: string; detail: unknown }>(
              (resolve) => {
                const log = window.__FO_EVENT_LOG__!;
                const find = () => {
                  for (let i = from_; i < log.records.length; i += 1) {
                    const { event, detail } = log.records[i];
                    if (names_.includes(event)) {
                      log.waiters.delete(find);
                      resolve({ index: i, event, detail });
                      return;
                    }
                  }
                };
                log.waiters.add(find);
                find();
              },
            ),
          { names_: names, from_: from },
        )
        .catch((error: Error) => {
          // the wait lives in one document; a second load strands it
          if (/Execution context was destroyed/.test(error.message)) {
            throw new Error(
              `the page loaded a new document while waiting for ` +
                `${names.join(" | ")} (armed at ${wait.caller})`,
            );
          }
          throw error;
        });
      if (predicate(record)) {
        pending.delete(id);
        return result;
      }
      wait.rejectedCount += 1;
      wait.rejected.push(record);
      if (wait.rejected.length > REJECTED_KEPT) wait.rejected.shift();
      from = record.index + 1;
    }
  }

  /**
   * Explain each wait still pending on this page: what it waits for, where it
   * was armed, the events its predicate rejected, and the `e2e:` events the
   * page sent since. Null if none.
   */
  public async describePending(): Promise<string | null> {
    const waits = [...(pendingWaits.get(this.page)?.values() ?? [])];
    if (!waits.length) return null;
    const records = await this.page
      .evaluate(() => window.__FO_EVENT_LOG__?.records ?? null)
      .catch((): null => null);

    const lines: string[] = [];
    for (const wait of waits) {
      lines.push(
        `still waiting ${Date.now() - wait.armedAt}ms for ` +
          `${wait.names.join(" | ")} (armed at ${wait.caller})`,
      );
      lines.push(
        wait.rejectedCount
          ? `  arrived but rejected by its predicate (last ${wait.rejected.length} of ${wait.rejectedCount}):`
          : "  never arrived",
      );
      for (const { event, detail } of wait.rejected) {
        lines.push(`    ${event} ${JSON.stringify(detail)}`);
      }
      if (!records || wait.recordFrom < 0) {
        lines.push("  no event record for this document");
        continue;
      }
      const since = records.slice(wait.recordFrom);
      const counts = new Map<string, number>();
      for (const { event } of since) {
        if (!wait.names.includes(event)) {
          counts.set(event, (counts.get(event) ?? 0) + 1);
        }
      }
      lines.push(
        counts.size
          ? `  other events since arming: ${[...counts]
              .map(([event, n]) => `${event} x${n}`)
              .join(", ")}`
          : "  no other events since arming",
      );
    }
    return lines.join("\n");
  }

  /**
   * Every payload of `event` in the current document so far, read once from
   * the record {@link recordLoads} keeps
   */
  public async recorded(event: string): Promise<Record<string, unknown>[]> {
    if (!recordingPages.has(this.page)) {
      throw new Error("recorded needs recordLoads() before navigating");
    }
    return this.page.evaluate(
      (name) =>
        (window.__FO_EVENT_LOG__?.records ?? [])
          .filter(({ event: e }) => e === name)
          .map(({ detail }) => detail),
      event,
    );
  }

  /**
   * The latest payload of each of `events` in the current document, read
   * once from the record {@link recordLoads} keeps; absent if never sent
   */
  public async latest<E extends string>(
    events: readonly E[],
  ): Promise<Partial<Record<E, Record<string, unknown>>>> {
    if (!recordingPages.has(this.page)) {
      throw new Error("latest needs recordLoads() before navigating");
    }
    return this.page.evaluate(
      (names) => {
        const found: Record<string, Record<string, unknown>> = {};
        for (const { event, detail } of window.__FO_EVENT_LOG__?.records ??
          []) {
          if (names.includes(event)) found[event] = detail;
        }
        return found;
      },
      events as readonly string[],
    ) as Promise<Partial<Record<E, Record<string, unknown>>>>;
  }

  /**
   * Resolve once `holds()` is true, reading it once after arming `events`
   * and otherwise waiting for the first matching event. Only for a state the
   * app settles into on its own (buffering finishing), which no test action
   * causes; otherwise use {@link after}.
   */
  public async untilState(
    events: string | readonly string[],
    holds: () => Promise<boolean>,
    predicate?: (e: ObservedEvent) => boolean,
  ): Promise<void> {
    const armed = await this.arm(events, predicate);
    try {
      if (await holds()) return;
      await armed.received;
    } finally {
      await armed.dispose();
    }
  }

  /**
   * Run `action` and resolve once one of `events` fires because of it. The
   * listener is armed before `action` starts, so the event cannot be missed:
   *
   *   await eventUtils.after("e2e:app:page-change", () => page.goBack());
   */
  public async after<T>(
    events: string | readonly string[],
    action: () => Promise<T>,
    predicate?: (e: ObservedEvent) => boolean,
  ): Promise<T> {
    const armed = await this.arm(events, predicate);
    try {
      const result = await action();
      await armed.received;
      return result;
    } finally {
      await armed.dispose();
    }
  }

  /**
   * Run `action` and resolve once each of `conditions` has been met by an
   * event it causes, in any order; all are armed before `action` starts
   */
  public async afterAll<T>(
    conditions: readonly EventCondition[],
    action: () => Promise<T>,
  ): Promise<T> {
    const armed = await Promise.all(
      conditions.map(({ events, predicate }) => this.arm(events, predicate)),
    );
    try {
      const result = await action();
      await Promise.all(armed.map((handle) => handle.received));
      return result;
    } finally {
      await Promise.all(armed.map((handle) => handle.dispose()));
    }
  }

  /**
   * Run `action` and resolve once `events` have fired in order because of it,
   * for when the app sends them back to back (a save's success, then settled).
   * All are armed before `action` starts, so none can be missed.
   */
  public async afterSequence<T>(
    events: readonly string[],
    action: () => Promise<T>,
  ): Promise<T> {
    let seen = 0;
    const armed = await Promise.all(
      events.map((event, index) =>
        this.arm(event, () => {
          if (seen !== index) return false;
          seen += 1;
          return true;
        }),
      ),
    );
    try {
      const result = await action();
      await armed[armed.length - 1].received;
      return result;
    } finally {
      await Promise.all(armed.map((handle) => handle.dispose()));
    }
  }

  /**
   * Install a counter for an app event (a bus event such as `grid-mount`) at
   * document start, before any application code runs, so events fired during
   * the initial page load are observed.
   * Create the counter BEFORE the navigation whose load it should watch; each
   * navigation starts a fresh document, resetting the records to empty.
   */
  public async initCounter(eventName: string): Promise<EventCounter> {
    const key = getFunctionNameWithRandomSuffix(`counter_${eventName}`);

    await ensureBusTap(this.page);
    await this.page.addInitScript(
      ({ eventName_, key_ }) => {
        const store = (window.__EVENT_COUNTS__ ??= {});
        const records: { t: number; detail?: unknown }[] = (store[key_] = []);
        const record = (detail: unknown) =>
          records.push({ t: performance.now(), detail });
        const counters = (window.__FO_BUS_COUNTERS__ ??= []);
        counters.push((event, data) => event === eventName_ && record(data));
      },
      { eventName_: eventName, key_: key },
    );

    return new EventCounter(this.page, key);
  }

  /**
   * Count `eventName` in every document this page loads from here on, for a
   * check that spans navigations; returns a read of the per-document counts
   */
  public async countPerDocument(eventName: string): Promise<() => number[]> {
    const counts = new Map<string, number>();
    const binding = getFunctionNameWithRandomSuffix("perDocument");
    await this.page.exposeBinding(binding, (_source, documentId: string) => {
      counts.set(documentId, (counts.get(documentId) ?? 0) + 1);
    });
    await ensureBusTap(this.page);
    await this.page.addInitScript(
      ({ eventName_, binding_ }) => {
        const documentId = `${performance.timeOrigin}-${Math.random()}`;
        const report = (window as unknown as Record<string, unknown>)[
          binding_
        ] as (documentId: string) => void;
        (window.__FO_BUS_COUNTERS__ ??= []).push(
          (event) => event === eventName_ && report(documentId),
        );
      },
      { eventName_: eventName, binding_: binding },
    );
    return () => [...counts.values()];
  }
}

const getFunctionNameWithRandomSuffix = (name: string) =>
  `${name}_${Math.random().toString(36).substring(7)}`;
