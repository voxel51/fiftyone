import { Page } from "@playwright/test";

/**
 * Handle for an armed document-event listener. Deliberately not a thenable:
 * an async method returning a bare promise would adopt (flatten) it, making
 * "armed" and "received" indistinguishable to callers.
 */
export class ArmedEvent {
  constructor(readonly received: Promise<void>) {}
}

/**
 * Handle for counting occurrences of a document-level CustomEvent. Created
 * by {@link EventUtils.counter}; counts accumulate from creation, so create
 * it at the moment "zero" should mean.
 */
export class EventCounter {
  #count = 0;

  constructor(private readonly page: Page) {}

  /** @internal */
  increment() {
    this.#count++;
  }

  /**
   * The number of events observed since creation. Fences through a no-op
   * page evaluation so every event dispatched before this call is included.
   */
  async read(): Promise<number> {
    await this.page.evaluate((): void => undefined);
    return this.#count;
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
    const counter = new EventCounter(this.page);
    const exposedFunctionName = getFunctionNameWithRandomSuffix(
      `counter_${eventName}`,
    );

    await this.page.exposeFunction(exposedFunctionName, () =>
      counter.increment(),
    );

    await this.page.evaluate(
      ({ eventName_, exposedFunctionName_ }) => {
        document.addEventListener(eventName_, () => {
          // @ts-expect-error - the function is exposed at runtime
          window[exposedFunctionName_]();
        });
      },
      { eventName_: eventName, exposedFunctionName_: exposedFunctionName },
    );

    return counter;
  }
}

const getFunctionNameWithRandomSuffix = (name: string) =>
  `${name}_${Math.random().toString(36).substring(7)}`;
