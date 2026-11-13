import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@voxel51/voodo", () => {
  const Box = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Stack: Box,
    Card: ({ children, ...props }: any) => (
      <div data-testid={props["data-testid"]}>{children}</div>
    ),
    Text: ({ children, gradient, color }: any) => (
      <span data-gradient={gradient ? "1" : undefined} data-color={color}>
        {children}
      </span>
    ),
    Modal: ({ open, title, children, footer }: any) =>
      open ? (
        <div role="dialog">
          <span>{title}</span>
          {children}
          {footer}
        </div>
      ) : null,
    Button: ({ children, onClick, disabled }: any) => (
      <button onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    Loader: ({ type }: any) => (
      <div role="status" data-testid={`loader-${type}`} />
    ),
    Align: {},
    IconName: {},
    Justify: {},
    Orientation: {},
    Size: {},
    Spacing: {},
    TextColor: { Failure: "failure", Secondary: "secondary", Muted: "muted" },
    TextVariant: {},
    Variant: {},
  };
});

import RunScreen from "./RunScreen";

afterEach(cleanup);

describe("RunScreen", () => {
  it("shows the title, description and a message picked by status", () => {
    const { rerender } = render(
      <RunScreen title="Computing" description="1,200 samples" />,
    );

    expect(screen.getByText("Computing")).toBeTruthy();
    expect(screen.getByText("1,200 samples")).toBeTruthy();
    expect(
      screen.getByText("Results will appear when the job is finished."),
    ).toBeTruthy();

    rerender(<RunScreen title="t" status="failed" message="Boom" />);
    expect(screen.getByText("Boom")).toBeTruthy();
  });

  it("hides actions without handlers", () => {
    render(<RunScreen title="t" />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls the back, status and stop handlers", () => {
    const [onBack, onViewStatus, onStop] = [vi.fn(), vi.fn(), vi.fn()];
    render(
      <RunScreen
        title="t"
        onBack={onBack}
        onViewStatus={onViewStatus}
        onStop={onStop}
      />,
    );

    fireEvent.click(screen.getByText("Back"));
    fireEvent.click(screen.getByText("View status"));
    fireEvent.click(screen.getByText("Stop"));

    expect(onBack).toHaveBeenCalled();
    expect(onViewStatus).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalled();
  });

  it("disables actions on request and while stopping", () => {
    render(
      <RunScreen
        title="t"
        onViewStatus={vi.fn()}
        viewStatusDisabled
        onStop={vi.fn()}
        stopping
      />,
    );

    expect(
      (screen.getByText("View status") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByText("Stopping…") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("hides the loader and run card on request", () => {
    render(<RunScreen title="t" hideLoader hideRun />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByTestId("run-card")).toBeNull();
  });

  it("uses gradient bars and title in the gradient variant", () => {
    render(<RunScreen title="Generating" variant="gradient" />);

    expect(screen.getByTestId("loader-bars")).toBeTruthy();
    expect(screen.getByText("Generating").getAttribute("data-gradient")).toBe(
      "1",
    );
  });

  it("shows the panel header beside the back action", () => {
    render(
      <RunScreen
        title="t"
        onBack={vi.fn()}
        header={{ title: "Runs", subtitle: "Label your dataset" }}
      />,
    );

    expect(screen.getByText("Runs")).toBeTruthy();
    expect(screen.getByText("Label your dataset")).toBeTruthy();
  });

  it("colors the message by tone, defaulting by status", () => {
    const { rerender } = render(<RunScreen title="t" status="running" />);
    expect(
      screen
        .getByText("Results will appear when the job is finished.")
        .getAttribute("data-color"),
    ).toBe("secondary");

    rerender(<RunScreen title="t" status="failed" />);
    expect(
      screen.getByText("This job failed.").getAttribute("data-color"),
    ).toBe("failure");

    rerender(<RunScreen title="t" status="failed" messageTone="default" />);
    expect(
      screen.getByText("This job failed.").getAttribute("data-color"),
    ).toBe("secondary");
  });

  it("draws the accent bar only when asked", () => {
    const { rerender } = render(<RunScreen title="t" />);
    expect(screen.queryByTestId("run-accent")).toBeNull();

    rerender(<RunScreen title="t" accent />);
    expect(screen.getByTestId("run-accent")).toBeTruthy();
  });

  it("stops after confirmation when stopConfirm is given", () => {
    const onStop = vi.fn();
    render(
      <RunScreen
        title="t"
        onStop={onStop}
        stopConfirm={{
          title: "Stop generating labels?",
          content: "Completed labels will be saved.",
          confirmText: "Stop generating",
        }}
      />,
    );

    fireEvent.click(screen.getByText("Stop"));
    expect(onStop).not.toHaveBeenCalled();
    expect(screen.getByText("Stop generating labels?")).toBeTruthy();
    expect(screen.getByText("Completed labels will be saved.")).toBeTruthy();

    fireEvent.click(screen.getByText("Stop generating"));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not stop when the confirmation is cancelled", () => {
    const onStop = vi.fn();
    render(
      <RunScreen
        title="t"
        onStop={onStop}
        stopConfirm={{ title: "Stop generating labels?" }}
      />,
    );

    fireEvent.click(screen.getByText("Stop"));
    fireEvent.click(screen.getByText("Cancel"));

    expect(onStop).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
