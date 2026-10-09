import { Page } from "src/oss/fixtures";
import type { EventUtils } from "src/shared/event-utils";

type TaggerMode = "sample" | "label";

const COUNT_SHOWN = "e2e:tagger:count-shown";

export class GridTaggerPom {
  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils,
  ) {}

  /**
   * Run `action` (opening the tagger, which starts in sample mode in the
   * grid, or switching its mode) and resolve once `mode`'s count has rendered
   * its input
   */
  afterCountShown<T>(mode: TaggerMode, action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after(
      COUNT_SHOWN,
      action,
      (e) => (e.detail as { labels: boolean }).labels === (mode === "label"),
    );
  }

  /** Switch to `mode` from the other mode; resolves once its count shows */
  async setActiveTaggerMode(mode: TaggerMode) {
    await this.afterCountShown(mode, () =>
      this.page.getByTestId(`tagger-switch-${mode}`).click(),
    );
  }

  async getTagInputTextPlaceholder(mode: TaggerMode) {
    return this.page
      .getByTestId(`${mode}-tag-input`)
      .getAttribute("placeholder");
  }

  async addNewTag(mode: TaggerMode, tag: string) {
    const input = this.page.getByTestId(`${mode}-tag-input`);
    await input.fill(tag);
    await this.page.keyboard.press("Enter");
    await this.page.getByTestId(`button-Apply`).click();
  }
}
