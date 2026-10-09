import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const notify = vi.fn();

vi.mock("@fiftyone/state", () => ({
  useRefresh: () => refresh,
  useNotification: () => notify,
}));

import DatasetMenu from "./DatasetMenu";
import HelpMenu from "./HelpMenu";

const open = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};

describe("header menus", () => {
  afterEach(() => {
    cleanup();
    refresh.mockReset();
    notify.mockReset();
  });

  it("refreshes the dataset from the Dataset menu", async () => {
    render(<DatasetMenu />);
    await open("Dataset actions");
    fireEvent.click(screen.getByRole("menuitem", { name: "Refresh" }));

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("copies the page's link from the Dataset menu", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DatasetMenu />);
    await open("Dataset actions");
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }));
    });

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "Link copied" }),
    );
  });

  it("toggles the theme from the help menu", async () => {
    const onToggleTheme = vi.fn();
    render(<HelpMenu theme="dark" onToggleTheme={onToggleTheme} />);
    await open("Help");
    fireEvent.click(screen.getByRole("menuitem", { name: "Light mode" }));

    expect(onToggleTheme).toHaveBeenCalledOnce();
  });

  it("offers only links without a theme toggle", async () => {
    render(<HelpMenu />);
    await open("Help");

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Documentation", "GitHub", "Discord"]);
  });
});
