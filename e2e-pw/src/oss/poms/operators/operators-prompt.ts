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

  async isValidated() {
    await expect(
      this.panelPom.footer.locator(".MuiCircularProgress-root")
    ).toBeHidden();
    await expect(
      this.panelPom.footer.locator(".MuiCircularProgress-root")
    ).toBeHidden();
  }
}

type PromptType = "modal" | "drawer" | "view-modal";
