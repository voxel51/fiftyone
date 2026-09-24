// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TextColor } from "@voxel51/voodo";
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

  // The reason covers the whole card, so no dead zone sits between its
  // text; the card's own attributes land on the tooltip's wrapper
  it("explains a disabled card in a tooltip over the whole card", () => {
    render(
      <RunCard
        title="viz"
        status={{ label: "Unavailable", color: TextColor.Muted }}
        meta={["fake patches"]}
        actions={<button type="button">kebab</button>}
        disabled
        disabledReason="Wrong field"
      />,
    );

    const card = screen.getByText("viz").closest(".emb-run-card");
    expect(card?.getAttribute("data-disabled")).toBe("true");
    expect(screen.queryByText("Wrong field")).toBeNull();

    fireEvent.mouseEnter(screen.getByText("Unavailable"));
    expect(screen.getByText("Wrong field")).toBeDefined();
    fireEvent.mouseLeave(screen.getByText("Unavailable"));
    expect(screen.queryByText("Wrong field")).toBeNull();

    fireEvent.mouseEnter(screen.getByText("fake patches"));
    expect(screen.getByText("Wrong field")).toBeDefined();
  });

  it("shows no reason on an enabled card", () => {
    render(<RunCard title="viz" disabledReason="Wrong field" />);

    fireEvent.mouseEnter(screen.getByText("viz"));
    expect(screen.queryByText("Wrong field")).toBeNull();
  });
});
