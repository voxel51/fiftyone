import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@voxel51/voodo", () => ({
  Card: ({ children, background: _background, ...props }: any) => (
    <div data-card {...props}>
      {children}
    </div>
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
  MenuIconTextItem: ({ text, icon, onClick, disabled, destructive }: any) => (
    <button
      data-destructive={destructive}
      aria-disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {text}
    </button>
  ),
  Pill: ({ children, color }: any) => (
    <span data-color={color}>{children}</span>
  ),
  Text: ({ children, color }: any) => (
    <span data-color={color}>{children}</span>
  ),
  LayersIcon: () => <i>default-icon</i>,
  MoreVertIcon: () => null,
  Align: {},
  Justify: {},
  Orientation: {},
  Size: {},
  Spacing: {},
  StatusColor: {},
  TextColor: { Foreground: "fg", Failure: "failure", Secondary: "secondary" },
  TextVariant: {},
  Variant: {},
}));

import RunCard from "./RunCard";

afterEach(cleanup);

describe("RunCard", () => {
  it("renders a string title with the default icon", () => {
    render(<RunCard title="UMAP" />);

    expect(screen.getByText("UMAP")).toBeTruthy();
    expect(screen.getByText("default-icon")).toBeTruthy();
  });

  it("renders a custom icon and a custom title node", () => {
    render(
      <RunCard title={<input aria-label="rename" />} icon={<i>custom</i>} />,
    );

    expect(screen.getByLabelText("rename")).toBeTruthy();
    expect(screen.getByText("custom")).toBeTruthy();
    expect(screen.queryByText("default-icon")).toBeNull();
  });

  it("passes the hover state to a title function", () => {
    render(
      <RunCard title={(hovering) => <b>{hovering ? "hovered" : "idle"}</b>} />,
    );
    expect(screen.getByText("idle")).toBeTruthy();

    const card = screen.getByText("idle").closest("[data-card]") as HTMLElement;
    fireEvent.mouseEnter(card);
    expect(screen.getByText("hovered")).toBeTruthy();

    fireEvent.mouseLeave(card);
    expect(screen.getByText("idle")).toBeTruthy();
  });

  it("shows the status with its color", () => {
    render(
      <RunCard
        title="t"
        status={{ label: "In Review", color: "status-review-text" }}
      />,
    );

    expect(screen.getByText("In Review").getAttribute("data-color")).toBe(
      "status-review-text",
    );
  });

  it("shows a message, as an error when the tone is failure", () => {
    const { rerender } = render(
      <RunCard title="t" message={{ text: "3 labels" }} />,
    );
    expect(screen.getByText("3 labels").getAttribute("data-color")).toBe(
      "secondary",
    );

    rerender(<RunCard title="t" message={{ text: "Boom", tone: "failure" }} />);
    expect(screen.getByText("Boom").getAttribute("data-color")).toBe("failure");
  });

  it("is status-only without onOpen", () => {
    render(<RunCard title="t" />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens when the card is clicked", () => {
    const onOpen = vi.fn();
    render(<RunCard title="UMAP" onOpen={onOpen} />);

    fireEvent.click(
      screen.getAllByText("UMAP").find((el) => el.tagName === "SPAN")!,
    );

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("offers a focusable open button named after the title, without nesting buttons", () => {
    const onOpen = vi.fn();
    render(<RunCard title="UMAP" onOpen={onOpen} />);

    const open = screen.getByRole("button", { name: "UMAP" });
    expect(open.querySelector("button")).toBeNull();
    fireEvent.click(open);

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("names the open button from openLabel or a generic fallback", () => {
    const { rerender } = render(
      <RunCard title={<b>node</b>} onOpen={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();

    rerender(
      <RunCard title={<b>node</b>} openLabel="Open run 7" onOpen={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Open run 7" })).toBeTruthy();
  });

  it("does not open from keys typed in a nested input", () => {
    const onOpen = vi.fn();
    render(<RunCard title={<input aria-label="rename" />} onOpen={onOpen} />);

    const input = screen.getByLabelText("rename");
    const notPrevented = fireEvent.keyDown(input, { key: " " });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(notPrevented).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("hides the menu when no action is visible", () => {
    render(
      <RunCard
        title="t"
        actions={[{ id: "a", label: "A", onClick: vi.fn(), hidden: true }]}
      />,
    );

    expect(screen.queryByLabelText("Run actions")).toBeNull();
  });

  it("lists visible actions with their disabled and destructive flags", () => {
    render(
      <RunCard
        title="t"
        actions={[
          { id: "v", label: "View", icon: <i>eye</i>, onClick: vi.fn() },
          {
            id: "d",
            label: "Delete",
            onClick: vi.fn(),
            disabled: true,
            destructive: true,
          },
          { id: "h", label: "Hidden", onClick: vi.fn(), hidden: true },
        ]}
      />,
    );

    expect(screen.getByLabelText("Run actions")).toBeTruthy();
    expect(screen.getByText("eye")).toBeTruthy();
    expect(screen.queryByText("Hidden")).toBeNull();
    const del = screen.getByText("Delete");
    expect(del.getAttribute("aria-disabled")).toBe("true");
    expect(del.getAttribute("data-destructive")).toBe("true");
  });

  it("runs an action without opening the card", () => {
    const onOpen = vi.fn();
    const onClick = vi.fn();
    render(
      <RunCard
        title="t"
        onOpen={onOpen}
        actions={[{ id: "v", label: "View", onClick }]}
      />,
    );

    fireEvent.click(screen.getByText("View"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
