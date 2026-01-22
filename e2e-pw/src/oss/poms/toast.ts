import { Locator, Page } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";
import { SelectorPom } from "./selector";

export class ToastPom {
  readonly assert: ToastAsserter;
  readonly datasetSelector: SelectorPom;
  readonly locator: Locator;

  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils
  ) {
    this.assert = new ToastAsserter(this);
  }

  get container() {
    return this.page.locator("toast-");
  }

  async getText(pagename: string) {
    return this.page.getByTestId(`${pagename}-page`);
  }
}

class ToastAsserter {
  constructor(private readonly toastPom: ToastPom) {}

  async toastExists(pagename: string) {}
}
