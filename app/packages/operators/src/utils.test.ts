import { describe, expect, it, vi } from "vitest";
import { OperatorPromptType } from "./types";
import { getOperatorPromptConfigs } from "./utils";

describe("getOperatorPromptConfigs", () => {
  it("show is false when nothing is active", () => {
    const { show, showResultOrError } = getOperatorPromptConfigs(
      createOperatorPromptOptions(),
    );
    expect(show).toBe(false);
    expect(showResultOrError).toBeFalsy();
  });

  it("show is true when hasResultOrError is true", () => {
    const { show, showResultOrError } = getOperatorPromptConfigs(
      createOperatorPromptOptions({ hasResultOrError: true }),
    );
    expect(showResultOrError).toBe(true);
    expect(show).toBe(true);
  });

  it("show is truthy when executorError is set", () => {
    const { show, showResultOrError } = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        executorError: new Error("Executor error"),
      }),
    );
    expect(showResultOrError).toBeTruthy();
    expect(show).toBeTruthy();
  });

  it("show is truthy when resolveError is set", () => {
    const { show } = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        resolveError: new Error("Resolve error"),
      }),
    );
    expect(show).toBeTruthy();
  });

  it("show is true when showPrompt is true", () => {
    const { show } = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        showPrompt: true,
        inputFields: { view: {} },
      }),
    );
    expect(show).toBe(true);
  });

  it("show is true when isExecuting is true", () => {
    const { show } = getOperatorPromptConfigs(
      createOperatorPromptOptions({ isExecuting: true }),
    );
    expect(show).toBe(true);
  });

  it("submitButtonText defaults to Execute", () => {
    const { submitButtonText } = getOperatorPromptConfigs(
      createOperatorPromptOptions(),
    );
    expect(submitButtonText).toBe("Execute");
  });

  it("cancelButtonText defaults to Cancel", () => {
    const { cancelButtonText } = getOperatorPromptConfigs(
      createOperatorPromptOptions(),
    );
    expect(cancelButtonText).toBe("Cancel");
  });

  it("uses submitButtonLabel from PromptView when present", () => {
    const { submitButtonText } = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        promptView: {
          name: "PromptView",
          submit_button_label: "Run!",
          label: "My prompt",
        },
      }),
    );
    expect(submitButtonText).toBe("Run!");
  });

  it("keeps default submitButtonText when PromptView has no label", () => {
    const { submitButtonText } = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        promptView: { name: "PromptView", label: "My prompt" },
      }),
    );
    expect(submitButtonText).toBe("Execute");
  });

  it("sets onSubmit and onCancel from prompt when showPrompt is true", () => {
    const onSubmit = vi.fn();
    const cancel = vi.fn();
    const configs = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        showPrompt: true,
        onSubmit,
        cancel,
        inputFields: { view: {} },
      }),
    );
    expect(configs.onSubmit).toBe(onSubmit);
    expect(configs.onCancel).toBe(cancel);
    expect(configs.cancelButtonText).toBe("Cancel");
  });

  it("sets onCancel to close and cancelButtonText to Close when showing result or error", () => {
    const close = vi.fn();
    const configs = getOperatorPromptConfigs(
      createOperatorPromptOptions({ hasResultOrError: true, close }),
    );
    expect(configs.onCancel).toBe(close);
    expect(configs.cancelButtonText).toBe("Close");
  });

  it("returns onSubmit as undefined when neither showPrompt nor showResultOrError", () => {
    const { onSubmit } = getOperatorPromptConfigs(
      createOperatorPromptOptions(),
    );
    expect(onSubmit).toBeUndefined();
  });

  it("falls back to close when onCancel is not set", () => {
    const close = vi.fn();
    const { onClose } = getOperatorPromptConfigs(
      createOperatorPromptOptions({ close }),
    );
    expect(onClose).toBe(close);
  });

  it("uses onCancel as onClose when set", () => {
    const close = vi.fn();
    const cancel = vi.fn();
    const { onClose } = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        showPrompt: true,
        cancel,
        close,
        inputFields: { view: {} },
      }),
    );
    expect(onClose).toBe(cancel);
  });

  it("hasValidationErrors is false when array is empty", () => {
    const { hasValidationErrors, disableSubmit } = getOperatorPromptConfigs(
      createOperatorPromptOptions({ validationErrors: [] }),
    );
    expect(hasValidationErrors).toBe(false);
    expect(disableSubmit).toBe(false);
  });

  it("hasValidationErrors is true and disableSubmit is true when errors exist", () => {
    const {
      hasValidationErrors,
      disableSubmit,
      validationErrorsStr,
      disabledReason,
    } = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        validationErrors: [
          { path: "foo", reason: "required" },
          { path: "bar", reason: "invalid" },
        ],
      }),
    );
    expect(hasValidationErrors).toBe(true);
    expect(disableSubmit).toBe(true);
    expect(validationErrorsStr).toBe(
      "params.foo: required\nparams.bar: invalid",
    );
    expect(disabledReason).toContain(
      "Cannot execute operator with validation errors",
    );
  });

  it("disabledReason mentions validation errors when there are validation errors", () => {
    const { disabledReason } = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        validationErrors: [{ path: "x", reason: "bad" }],
      }),
    );
    expect(disabledReason).toContain("validation errors");
    expect(disabledReason).toContain("params.x: bad");
  });

  it("disabledReason mentions validating when resolving and there are no validation errors", () => {
    const { disabledReason } = getOperatorPromptConfigs(
      createOperatorPromptOptions({ resolving: true }),
    );
    expect(disabledReason).toContain("validating");
  });

  it("loading is true when resolving", () => {
    const { loading } = getOperatorPromptConfigs(
      createOperatorPromptOptions({ resolving: true }),
    );
    expect(loading).toBe(true);
  });

  it("disableSubmit is true when resolving", () => {
    const { disableSubmit } = getOperatorPromptConfigs(
      createOperatorPromptOptions({ resolving: true }),
    );
    expect(disableSubmit).toBe(true);
  });

  it("passes through submitOptions fields", () => {
    const options = [{ label: "opt1" }];
    const configs = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        submitOptions: {
          options,
          isLoading: true,
          hasOptions: true,
          requiresOrchestratorSetup: true,
        },
      }),
    );
    expect(configs.submitButtonOptions).toBe(options);
    expect(configs.submitButtonLoading).toBe(true);
    expect(configs.hasSubmitButtonOptions).toBe(true);
    expect(configs.requiresOrchestratorSetup).toBe(true);
  });

  it("returns title from inputFields view label when showPrompt is true", () => {
    const { title } = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        showPrompt: true,
        inputFields: { view: { label: "My Input" } },
      }),
    );
    expect(title).toBe("My Input");
  });

  it("returns title from outputFields view label when not showing prompt", () => {
    const { title } = getOperatorPromptConfigs(
      createOperatorPromptOptions({
        showPrompt: false,
        outputFields: { view: { label: "My Output" } },
      }),
    );
    expect(title).toBe("My Output");
  });

  it("returns undefined title when no fields", () => {
    const { title } = getOperatorPromptConfigs(createOperatorPromptOptions());
    expect(title).toBeUndefined();
  });

  it("exposes customPrompt and customPromptName from promptView", () => {
    const promptView = { name: "PromptView", label: "test" };
    const { customPrompt, customPromptName } = getOperatorPromptConfigs(
      createOperatorPromptOptions({ promptView }),
    );
    expect(customPrompt).toBe(promptView);
    expect(customPromptName).toBe("PromptView");
  });

  it("customPrompt and customPromptName are null/undefined when promptView is null", () => {
    const { customPrompt, customPromptName } = getOperatorPromptConfigs(
      createOperatorPromptOptions({ promptView: null }),
    );
    expect(customPrompt).toBeNull();
    expect(customPromptName).toBeUndefined();
  });
});

function createOperatorPromptOptions(
  overrides: Partial<OperatorPromptForConfig> = {},
): OperatorPromptForConfig {
  return {
    hasResultOrError: false,
    executorError: null,
    resolveError: null,
    showPrompt: false,
    isExecuting: false,
    promptView: null,
    submitOptions: {
      options: [],
      isLoading: false,
      hasOptions: false,
      requiresOrchestratorSetup: false,
    },
    onSubmit: vi.fn(),
    cancel: vi.fn(),
    close: vi.fn(),
    validationErrors: [],
    resolving: false,
    inputFields: null,
    outputFields: null,
    ...overrides,
  };
}

type OperatorPromptForConfig = Pick<
  NonNullable<OperatorPromptType>,
  | "hasResultOrError"
  | "executorError"
  | "resolveError"
  | "showPrompt"
  | "isExecuting"
  | "promptView"
  | "submitOptions"
  | "onSubmit"
  | "cancel"
  | "close"
  | "validationErrors"
  | "resolving"
  | "inputFields"
  | "outputFields"
>;
