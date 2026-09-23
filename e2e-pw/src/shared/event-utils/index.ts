import { Page } from "@playwright/test";

/**
 * Handle for an armed document-event listener. Deliberately not a thenable:
 * an async method returning a bare promise would adopt (flatten) it, making
 * "armed" and "received" indistinguishable to callers.
 */
export class ArmedEvent {
  constructor(readonly received: Promise<void>) {}
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
    /** The app's event-bus tap (`@fiftyone/events`). */
    __FO_EVENTS__?: {
      tap: (listener: (event: string, data: unknown) => void) => () => void;
    };
  }
}

/**
 * Handle for counting occurrences of a document-level CustomEvent. Created
 * by {@link EventUtils.counter}; counts accumulate from creation, so create
 * it at the moment "zero" should mean.
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

export class EventUtils {
  constructor(private readonly page: Page) {}

  /**
   * Arm a listener for an app event: a document-level CustomEvent, or any
   * `@fiftyone/events` bus event on any channel. Resolves only after the
   * in-page listener is attached, so an event fired any time after arming is
   * guaranteed to be observed — arm BEFORE the action that fires the event,
   * then await the handle's `received` after it:
   *
   *   const armed = await eventUtils.arm("grid-mount");
   *   await actionThatRemountsGrid();
   *   await armed.received;
   */
  public async arm(
    eventName: string,
    predicate: (e: { detail?: unknown }) => boolean = () => true,
  ): Promise<ArmedEvent> {
    const exposedFunctionName = getFunctionNameWithRandomSuffix(eventName);

    let resolveReceived: () => void;
    const received = new Promise<void>((resolve) => {
      resolveReceived = resolve;
    });

    // the return value tells the page to detach once the wait is satisfied
    await this.page.exposeFunction(
      exposedFunctionName,
      (e: { detail?: unknown }) => {
        const matched = predicate(e);
        if (matched) {
          resolveReceived();
        }
        return matched;
      },
    );

    // the listener is attached in its own evaluate — not inside the promise
    // that carries the wait — so attachment is complete when `arm` returns
    await this.page.evaluate(
      ({ eventName_, exposedFunctionName_ }) => {
        let detach = () => {};
        const deliver = (detail: unknown) => {
          // @ts-expect-error - the function is exposed at runtime
          window[exposedFunctionName_]({ detail }).then(
            (matched: boolean) => matched && detach(),
          );
        };

        // CustomEvent instances don't serialize across the boundary;
        // forward only the detail
        const onDocument = (e: Event) => deliver((e as CustomEvent).detail);
        document.addEventListener(eventName_, onDocument);

        // bus payloads can hold live objects; forward only primitive fields
        const offBus = window.__FO_EVENTS__?.tap((event, data) => {
          if (event !== eventName_) return;
          deliver(
            Object.fromEntries(
              Object.entries((data ?? {}) as Record<string, unknown>).filter(
                ([, v]) =>
                  v === null ||
                  (typeof v !== "object" && typeof v !== "function"),
              ),
            ),
          );
        });

        detach = () => {
          document.removeEventListener(eventName_, onDocument);
          offBus?.();
        };
      },
      { eventName_: eventName, exposedFunctionName_: exposedFunctionName },
    );

    return new ArmedEvent(received);
  }

  /**
   * Run `action` and resolve once `eventName` fires because of it. The
   * listener is armed before `action` starts, so the event cannot be missed:
   *
   *   await eventUtils.after("page-change", () => page.goBack());
   */
  public async after<T>(
    eventName: string,
    action: () => Promise<T>,
    predicate?: (e: { detail?: unknown }) => boolean,
  ): Promise<T> {
    const armed = await this.arm(eventName, predicate);
    const result = await action();
    await armed.received;
    return result;
  }

  /**
   * Install a counter for a document-level CustomEvent. Counting starts when
   * the returned promise resolves — create the counter BEFORE the actions
   * whose events it should observe, then assert on `read()` after them:
   *
   *   const unmounts = await eventUtils.counter("grid-unmount");
   *   await actionThatRefreshesGrid();
   *   expect(await unmounts.read()).toBe(1);
   */
  public async counter(eventName: string): Promise<EventCounter> {
    const key = getFunctionNameWithRandomSuffix(`counter_${eventName}`);

    await this.page.evaluate(
      ({ eventName_, key_ }) => {
        const store = (window.__EVENT_COUNTS__ ??= {});
        const records: { t: number; detail?: unknown }[] = (store[key_] = []);
        document.addEventListener(eventName_, (e: Event) => {
          records.push({
            t: performance.now(),
            detail: (e as CustomEvent).detail,
          });
        });
      },
      { eventName_: eventName, key_: key },
    );

    return new EventCounter(this.page, key);
  }

  /**
   * Install a counter for a document-level CustomEvent at document start,
   * before any application code runs. Unlike {@link counter}, events fired
   * during initial page load are observed — create the counter BEFORE the
   * navigation whose load it should watch. Each navigation starts a fresh
   * document, resetting the records to empty.
   */
  public async initCounter(eventName: string): Promise<EventCounter> {
    const key = getFunctionNameWithRandomSuffix(`counter_${eventName}`);

    await this.page.addInitScript(
      ({ eventName_, key_ }) => {
        const store = (window.__EVENT_COUNTS__ ??= {});
        const records: { t: number; detail?: unknown }[] = (store[key_] = []);
        document.addEventListener(eventName_, (e: Event) => {
          records.push({
            t: performance.now(),
            detail: (e as CustomEvent).detail,
          });
        });
      },
      { eventName_: eventName, key_: key },
    );

    return new EventCounter(this.page, key);
  }
}

const getFunctionNameWithRandomSuffix = (name: string) =>
  `${name}_${Math.random().toString(36).substring(7)}`;
