import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Episode3dViewControls } from "./Episode3dViewControls";

describe("Episode3dViewControls", () => {
  it("applies the ego and top camera presets", () => {
    const onEgoView = vi.fn();
    const onTopView = vi.fn();
    render(
      <Episode3dViewControls onEgoView={onEgoView} onTopView={onTopView} />,
    );

    const egoButton = screen.getByRole("button", { name: "Ego view" });
    const topButton = screen.getByRole("button", { name: "Top view" });
    expect(egoButton.getAttribute("title")).toBe(
      "Ego-like view of the current camera target (E)",
    );
    expect(topButton.getAttribute("title")).toBe(
      "Top-down view of the current camera target (T)",
    );
    expect(egoButton.getAttribute("aria-keyshortcuts")).toBe("E");
    expect(topButton.getAttribute("aria-keyshortcuts")).toBe("T");

    fireEvent.click(egoButton);
    fireEvent.click(topButton);

    expect(onEgoView).toHaveBeenCalledTimes(1);
    expect(onTopView).toHaveBeenCalledTimes(1);
  });
});
