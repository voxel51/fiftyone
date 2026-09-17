import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button, Dropdown } from "@voxel51/voodo";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerEpisodeHeaderAction,
  resetEpisodeHeaderActionsForTests,
} from "../../../extensions/episode-actions/registry";
import EpisodeLayoutMenuActions from "./EpisodeLayoutMenuActions";

function openMenu() {
  const onSelect = vi.fn();
  render(
    <Dropdown trigger={<Button>Layout</Button>}>
      <EpisodeLayoutMenuActions onSelect={onSelect} />
    </Dropdown>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Layout" }));
  return onSelect;
}

afterEach(() => {
  cleanup();
  resetEpisodeHeaderActionsForTests();
});

describe("saved layouts availability", () => {
  it("explains availability without enabling an unregistered action", () => {
    const onSelect = openMenu();
    const item = screen.getByRole("menuitem", { name: "Saved layouts…" });
    expect(item.getAttribute("disabled")).not.toBeNull();
    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.mouseEnter(screen.getByTestId("saved-layouts-upsell"));
    expect(
      screen.getByText(
        "Saved layouts let you reuse and share viewer setups. " +
          "Available in other product editions.",
      ),
    ).toBeTruthy();
  });

  it("keeps the upsell when an unrelated layout action is registered", () => {
    registerEpisodeHeaderAction({
      id: "test:other-layout-action",
      order: 10,
      layoutMenuLabel: "Other action",
      Component: () => null,
    });
    openMenu();
    expect(screen.getByTestId("saved-layouts-upsell")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Other action" })).toBeTruthy();
  });

  it("replaces the upsell with the registered saved-layout action", () => {
    registerEpisodeHeaderAction({
      id: "test:saved-layouts",
      order: 10,
      layoutMenuLabel: "Saved layouts…",
      layoutMenuRole: "saved-layouts",
      Component: () => null,
    });
    const onSelect = openMenu();
    expect(screen.queryByTestId("saved-layouts-upsell")).toBeNull();
    const item = screen.getByRole("menuitem", { name: "Saved layouts…" });
    expect(item.getAttribute("disabled")).toBeNull();
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("test:saved-layouts");
  });
});
