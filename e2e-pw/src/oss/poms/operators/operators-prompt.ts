import { Locator, Page, expect } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";

export const PROMPT_EVENT = "e2e:operators:prompt";
const OUTPUT_EVENT = "e2e:operators:output-shown";

type PromptPhase = "input" | "executing" | "output" | "closed";

type PromptDetail = {
  operator: string;
  phase: PromptPhase;
  params: string;
  ready: boolean;
};

export const promptDetail = (e: { detail?: unknown }) =>
  e.detail as PromptDetail;

export class OperatorsPromptPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: OperatorsPromptAsserter;
  readonly selectionCount: Locator;
  readonly type: PromptType;

  constructor(
    page: Page,
    private readonly eventUtils: EventUtils,
    type: PromptType = "modal",
  ) {
    this.page = page;
    this.assert = new OperatorsPromptAsserter(this);
    this.locator = this.page.getByTestId(`operators-prompt-${type}`);
    this.type = type;
  }

  get content() {
    if (this.type === "drawer") {
      return this.locator.getByTestId("operators-prompt-drawer-content");
    }
    return this.locator.locator(".MuiDialogContent-root").first();
  }

  get footer() {
    if (this.type === "drawer") {
      return this.locator.getByTestId("operators-prompt-drawer-footer");
    }
    return this.locator.locator(".MuiDialogActions-root").first();
  }

  get executeButton() {
    return this.footer.locator('button:text("Execute")');
  }

  /** Type into the first input; resolves once the form has resolved it */
  async typeInput(text: string) {
    await this.eventUtils.after(
      PROMPT_EVENT,
      () => this.locator.locator("input").first().pressSequentially(text),
      (e) => {
        const { params, ready } = promptDetail(e);
        return ready && Object.values(JSON.parse(params)).includes(text);
      },
    );
  }

  /** Execute, resolving once the run has shown its output or closed */
  async execute() {
    const executing = await this.eventUtils.arm(
      PROMPT_EVENT,
      (e) => promptDetail(e).phase === "executing",
    );
    try {
      await this.eventUtils.after(
        PROMPT_EVENT,
        () => this.executeButton.click(),
        (e) => ["output", "closed"].includes(promptDetail(e).phase),
      );
      await executing.received;
    } finally {
      await executing.dispose();
    }
  }

  /**
   * Run `action` and resolve once the view modal shows an output whose data
   * has `key` equal to `value`
   */
  afterOutput<T>(
    action: () => Promise<T>,
    key: string,
    value: unknown,
  ): Promise<T> {
    return this.eventUtils.after(
      OUTPUT_EVENT,
      action,
      (e) => JSON.parse((e.detail as { data: string }).data)[key] === value,
    );
  }

  /**
   * Resolve on the prompt closing by itself, as a run that needs no output
   * does when it completes
   */
  untilClosed() {
    return this.eventUtils.next(
      PROMPT_EVENT,
      (e) => promptDetail(e).phase === "closed",
    );
  }

  cancel() {
    return this.afterClosed(() =>
      this.footer.locator('button:text("Cancel")').click(),
    );
  }

  close() {
    return this.afterClosed(() =>
      this.footer.locator('button:text("Close")').click(),
    );
  }

  /** Dismiss the view modal's output */
  done() {
    return this.eventUtils.after(
      OUTPUT_EVENT,
      () => this.footer.locator('button:text("Done")').click(),
      (e) => (e.detail as { visible: boolean }).visible === false,
    );
  }

  private afterClosed(action: () => Promise<void>) {
    return this.eventUtils.after(
      PROMPT_EVENT,
      action,
      (e) => promptDetail(e).phase === "closed",
    );
  }
}

class OperatorsPromptAsserter {
  constructor(private readonly panelPom: OperatorsPromptPom) {}

  async isOpen() {
    expect(await this.panelPom.locator.isVisible()).toBe(true);
  }

  async isClosed() {
    expect(await this.panelPom.locator.count()).toBe(0);
  }

  async isExecuting() {
    expect(await this.panelPom.locator.textContent()).toContain("Executing...");
  }

  async canExecute() {
    expect(await this.panelPom.executeButton.isEnabled()).toBe(true);
  }

  async isValidated() {
    expect(
      await this.panelPom.footer.locator(".MuiCircularProgress-root").count(),
    ).toBe(0);
  }

  async hasContent(text: string) {
    expect(await this.panelPom.content.textContent()).toContain(text);
  }
}

type PromptType = "modal" | "drawer" | "view-modal";
