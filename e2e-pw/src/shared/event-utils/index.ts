import { Page } from "@playwright/test";

export class EventUtils {
  constructor(private readonly page: Page) {}

  public async getEventReceivedPromiseForPredicate(
    eventName: string,
    predicate: (e: CustomEvent) => boolean
  ) {
    const exposedFunctionName = getFunctionNameWithRandomSuffix(eventName);
    this.page.exposeFunction(exposedFunctionName, (e: CustomEvent) => {
      return predicate(e);
    });

    // note: cannot directly pass function to `evaluate`, which is why we expose it to the `window` object first
    return this.page.evaluate(
      ({ eventName_, exposedFunctionName_ }) =>
        new Promise<void>((resolve) => {
          document.addEventListener(eventName_, (e: CustomEvent) => {
            if (window[exposedFunctionName_](e)) {
              resolve();
            }
          });
        }),
      { eventName_: eventName, exposedFunctionName_: exposedFunctionName }
    );
  }
}

const getFunctionNameWithRandomSuffix = (name: string) =>
  `${name}_${Math.random().toString(36).substring(7)}`;
