import { Locator, Page, expect } from "src/oss/fixtures";

export class OperatorsPromptPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: OperatorsPromptAsserter;
  readonly selectionCount: Locator;
  readonly type: PromptType;

  constructor(page: Page, type: PromptType = "modal") {
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

  async execute() {
    await this.assert.canExecute();
    return this.executeButton.click();
  }

  cancel() {
    return this.footer.locator('button:text("Cancel")').click();
  }

  close() {
    return this.footer.locator('button:text("Close")').click();
  }

  done() {
    return this.footer.locator('button:text("Done")').click();
  }

  /**
   * Records every distinct text the prompt content renders from now on.
   *
   * A MutationObserver runs after each DOM commit, so a state that is on
   * screen for only a few hundred milliseconds is captured even when the
   * test runner's own polling is too slow to observe it live.
   */
  async recordContentText() {
    await this.page.evaluate((testId) => {
      const w = window as unknown as {
        __foE2ePromptContentHistory?: Record<string, string[]>;
      };
      if (!w.__foE2ePromptContentHistory) {
        w.__foE2ePromptContentHistory = {};
      }
      const history: string[] = [];
      w.__foE2ePromptContentHistory[testId] = history;
      const read = () => {
        const content = document.querySelector(
          `[data-cy="${testId}"] .MuiDialogContent-root, ` +
            `[data-cy="${testId}"] [data-cy="operators-prompt-drawer-content"]`,
        );
        const text = content?.textContent ?? "";
        if (text && history[history.length - 1] !== text) {
          history.push(text);
        }
      };
      new MutationObserver(read).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      read();
    }, `operators-prompt-${this.type}`);
  }

  /** Every distinct content text seen since `recordContentText()`. */
  recordedContentText(): Promise<string[]> {
    return this.page.evaluate(
      (testId) =>
        (
          window as unknown as {
            __foE2ePromptContentHistory?: Record<string, string[]>;
          }
        ).__foE2ePromptContentHistory?.[testId] ?? [],
      `operators-prompt-${this.type}`,
    );
  }
}

class OperatorsPromptAsserter {
  constructor(private readonly panelPom: OperatorsPromptPom) {}

  async isOpen() {
    await expect(this.panelPom.locator).toBeVisible();
  }
  async isClosed() {
    await expect(this.panelPom.locator).toBeHidden();
  }
  async isExecuting() {
    await expect(this.panelPom.locator).toContainText("Executing...");
  }
  async canExecute() {
    await expect(this.panelPom.executeButton).toBeEnabled();
  }

  /**
   * The content has rendered `text` at some point since
   * `recordContentText()`, even if it has since been replaced.
   */
  async hasRenderedText(text: string) {
    await expect
      .poll(
        async () => {
          const history = await this.panelPom.recordedContentText();
          return history.some((t) => t.includes(text));
        },
        { message: `prompt content never rendered "${text}"` },
      )
      .toBe(true);
  }

  async isValidated() {
    await expect(
      this.panelPom.footer.locator(".MuiCircularProgress-root"),
    ).toBeHidden();
    await expect(
      this.panelPom.footer.locator(".MuiCircularProgress-root"),
    ).toBeHidden();
  }
}

type PromptType = "modal" | "drawer" | "view-modal";
