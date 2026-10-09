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

const open = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};

describe("DatasetMenu", () => {
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
});
