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
    return this.locator.locator(".MuiDialogActions-root").first();
  }

  get executeButton() {
    return this.locator.locator('button:text("Execute")');
  }

  async execute() {
    await this.assert.canExecute();
    return this.executeButton.click();
  }

  async waitForValidation() {
    await expect(
      this.footer.locator(".MuiCircularProgress-root")
    ).toBeVisible();
    await expect(
      this.footer.locator(".MuiCircularProgress-root")
    ).not.toBeVisible();
  }

  cancel() {
    return this.locator.locator('button:text("Cancel")').click();
  }

  close() {
    return this.locator.locator('button:text("Close")').click();
  }

  done() {
    return this.locator.locator('button:text("Done")').click();
  }
}

class OperatorsPromptAsserter {
  constructor(private readonly panelPom: OperatorsPromptPom) {}

  async isOpen() {
    await expect(this.panelPom.locator).toBeVisible();
  }
  async isClosed() {
    await expect(this.panelPom.locator).not.toBeVisible();
  }
  async isExecuting() {
    await expect(this.panelPom.locator).toContainText("Executing...");
  }
  async canExecute() {
    await expect(this.panelPom.executeButton).toBeEnabled();
  }
}

type PromptType = "modal" | "drawer" | "view-modal";
