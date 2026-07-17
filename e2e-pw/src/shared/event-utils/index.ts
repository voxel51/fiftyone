import { Page } from "@playwright/test";

/**
 * Handle for an armed document-event listener. Deliberately not a thenable:
 * an async method returning a bare promise would adopt (flatten) it, making
 * "armed" and "received" indistinguishable to callers.
 */
export class ArmedEvent {
  constructor(readonly received: Promise<void>) {}
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
}

const getFunctionNameWithRandomSuffix = (name: string) =>
  `${name}_${Math.random().toString(36).substring(7)}`;
