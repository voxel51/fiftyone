// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunCard } from "./RunCard";

// RTL only auto-cleans up with vitest globals enabled; ours are off
afterEach(cleanup);

describe("RunCard", () => {
  it("is a button only when clickable, and clicks fire", () => {
    const onClick = vi.fn();
    const { rerender } = render(<RunCard title="viz" onClick={onClick} />);

    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(2);

    rerender(<RunCard title="viz" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps action clicks off the card", () => {
    const onClick = vi.fn();
    render(
      <RunCard
        title="viz"
        onClick={onClick}
        actions={<button type="button">kebab</button>}
      />,
    );

    fireEvent.click(screen.getByText("kebab"));
    expect(onClick).not.toHaveBeenCalled();
  });

  // Disabled wins over onClick; a disabled run is still deletable
  it("is inert when disabled, while its actions still work", () => {
    const onClick = vi.fn();
    const onAction = vi.fn();
    render(
      <RunCard
        title="viz"
        disabled
        onClick={onClick}
        actions={
          <button type="button" onClick={onAction}>
            kebab
          </button>
        }
      />,
    );

    fireEvent.click(screen.getByText("viz"));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByText("kebab").closest("[role='button']")).toBeNull();

    fireEvent.click(screen.getByText("kebab"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
