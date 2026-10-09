// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TagStrokeIcon } from "@voxel51/voodo";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActionButton from "./ActionButton";

describe("ActionButton", () => {
  afterEach(cleanup);

  it("is an icon action named by its title", () => {
    const onClick = vi.fn();
    render(
      <ActionButton
        data-cy="action"
        highlight
        icon={TagStrokeIcon}
        onClick={onClick}
        title="Tag"
      />,
    );

    const button = screen.getByRole("button", { name: "Tag" });
    expect(button.getAttribute("data-cy")).toBe("action");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows a count beside the icon", () => {
    render(
      <ActionButton
        icon={TagStrokeIcon}
        onClick={vi.fn()}
        text="3"
        title="Selected"
      />,
    );

    expect(screen.getByRole("button").textContent).toBe("3");
  });

  it("spins and ignores presses while loading", () => {
    const onClick = vi.fn();
    render(
      <ActionButton
        icon={TagStrokeIcon}
        loading
        onClick={onClick}
        title="Tag"
      />,
    );

    const button = screen.getByRole("button", { name: "Tag" });
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
