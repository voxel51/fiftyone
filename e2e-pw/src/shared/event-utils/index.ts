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
   * Arm a listener for a document-level CustomEvent. Resolves only after the
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

    await this.page.exposeFunction(
      exposedFunctionName,
      (e: { detail?: unknown }) => {
        if (predicate(e)) {
          resolveReceived();
        }
      },
    );

    // the listener is attached in its own evaluate — not inside the promise
    // that carries the wait — so attachment is complete when `arm` returns
    await this.page.evaluate(
      ({ eventName_, exposedFunctionName_ }) => {
        document.addEventListener(eventName_, (e: Event) => {
          // CustomEvent instances don't serialize across the boundary;
          // forward only the detail
          // @ts-expect-error - the function is exposed at runtime
          window[exposedFunctionName_]({
            detail: (e as CustomEvent).detail,
          });
        });
      },
      { eventName_: eventName, exposedFunctionName_: exposedFunctionName },
    );

    return new ArmedEvent(received);
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
