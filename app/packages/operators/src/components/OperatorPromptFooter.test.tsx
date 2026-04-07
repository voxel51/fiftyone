import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OperatorPromptFooter from "./OperatorPromptFooter";

describe("OperatorPromptFooter", () => {
  const submitButtonOptions = [{ id: "execute-default", label: "Execute" }];

  afterEach(cleanup);

  it("renders orchestrator setup message when requiresOrchestratorSetup is true", () => {
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(
      screen.queryByText("Background compute is not yet configured")
    ).not.toBeNull();
    expect(screen.queryByText("Set up now")).not.toBeNull();
  });

  it("does not render orchestrator setup message when requiresOrchestratorSetup is false", () => {
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(
      screen.queryByText("Background compute is not yet configured")
    ).toBeNull();
  });

  it("renders only the Close button when requiresOrchestratorSetup is true", () => {
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /execute/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
  });

  it("renders SplitButton and Cancel button when hasSubmitButtonOptions is true", () => {
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        hasSubmitButtonOptions={true}
        submitButtonOptions={submitButtonOptions}
      />
    );

    expect(screen.queryByRole("button", { name: "Execute" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeNull();
  });

  it("renders execute and cancel buttons when hasSubmitButtonOptions is false", () => {
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        hasSubmitButtonOptions={false}
      />
    );

    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeNull();
  });

  it("calls onCancel when Close button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />
    );

    screen.getByRole("button", { name: "Close" }).click();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup={false}
        onCancel={onCancel}
        onSubmit={vi.fn()}
        hasSubmitButtonOptions={false}
      />
    );

    screen.getByRole("button", { name: /cancel/i }).click();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onSubmit when Execute button is clicked", () => {
    const onSubmit = vi.fn();
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        hasSubmitButtonOptions={false}
      />
    );

    screen.getByRole("button", { name: /execute/i }).click();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("does not call onSubmit when disableSubmit is true", () => {
    const onSubmit = vi.fn();
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        hasSubmitButtonOptions={false}
        disableSubmit
        disabledReason="Submission disabled"
      />
    );

    const executeButton = screen.getByRole("button", { name: /execute/i });
    expect((executeButton as HTMLButtonElement).disabled).toBe(true);

    executeButton.click();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("hides execute submit control when submitOptionsLoading is true", () => {
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        hasSubmitButtonOptions={false}
        submitOptionsLoading
      />
    );

    expect(screen.queryByRole("button", { name: /execute/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeNull();
  });

  it("hides split submit control when submitOptionsLoading is true", () => {
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        hasSubmitButtonOptions={true}
        submitButtonOptions={submitButtonOptions}
        submitOptionsLoading
      />
    );

    expect(screen.queryByRole("button", { name: /execute/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeNull();
  });

  it("renders loading indicator when loading is true", () => {
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        hasSubmitButtonOptions={false}
        loading
      />
    );

    expect(screen.queryByRole("progressbar")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeNull();
  });

  it("calls onSubmit when SplitButton is clicked", () => {
    const onSubmit = vi.fn();
    render(
      <OperatorPromptFooter
        requiresOrchestratorSetup={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        hasSubmitButtonOptions={true}
        submitButtonOptions={submitButtonOptions}
      />
    );

    screen.getByRole("button", { name: "Execute" }).click();
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
