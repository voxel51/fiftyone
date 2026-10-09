import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@voxel51/voodo", () => {
  return {
    Card: ({ children, background: _background, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
    Stack: ({ children, onClick, onKeyDown }: any) => (
      <div onClick={onClick} onKeyDown={onKeyDown}>
        {children}
      </div>
    ),
    Dropdown: ({ trigger, children }: any) => (
      <div>
        {trigger}
        {children}
      </div>
    ),
    Button: ({ "aria-label": label }: any) => <button aria-label={label} />,
    MenuIconTextItem: ({ text, onClick }: any) => (
      <button onClick={onClick}>{text}</button>
    ),
    Pill: ({ children }: any) => <span>{children}</span>,
    Text: ({ children }: any) => <span>{children}</span>,
    LayersIcon: () => null,
    MoreVertIcon: () => null,
    VisibilityIcon: () => null,
    StatusColor: { FailedText: "failed", ProgressText: "progress" },
    Align: {},
    Justify: {},
    Orientation: {},
    Size: {},
    Spacing: {},
    TextColor: {},
    TextVariant: {},
    Variant: {},
  };
});

import PendingRunCard from "./PendingRunCard";

afterEach(cleanup);

describe("PendingRunCard", () => {
  it("shows the title and a readable state", () => {
    render(<PendingRunCard title="UMAP" runState="scheduled" />);

    expect(screen.getByText("UMAP")).toBeTruthy();
    expect(screen.getByText("Scheduled")).toBeTruthy();
  });

  it("renders a custom icon", () => {
    render(
      <PendingRunCard
        title="UMAP"
        runState="running"
        icon={<i data-testid="custom-icon" />}
      />,
    );

    expect(screen.getByTestId("custom-icon")).toBeTruthy();
  });

  it("is status-only without onOpen", () => {
    render(<PendingRunCard title="UMAP" runState="running" />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens from a card click and from the open button", () => {
    const onOpen = vi.fn();
    render(<PendingRunCard title="UMAP" runState="failed" onOpen={onOpen} />);

    fireEvent.click(
      screen.getAllByText("UMAP").find((el) => el.tagName === "SPAN")!,
    );
    fireEvent.click(screen.getByRole("button", { name: "UMAP" }));

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("offers View run only with onViewRun, without opening the card", () => {
    const onOpen = vi.fn();
    const onViewRun = vi.fn();
    const { rerender } = render(
      <PendingRunCard title="UMAP" runState="running" onOpen={onOpen} />,
    );
    expect(screen.queryByText("View run")).toBeNull();

    rerender(
      <PendingRunCard
        title="UMAP"
        runState="running"
        onOpen={onOpen}
        onViewRun={onViewRun}
      />,
    );
    fireEvent.click(screen.getByText("View run"));

    expect(onViewRun).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
