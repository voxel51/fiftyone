import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ReverbRoot } from "@fiftyone/reverb";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/state", async () => {
  const { atom } =
    await vi.importActual<typeof import("@fiftyone/reverb")>(
      "@fiftyone/reverb",
    );
  return {
    isSidebarFilterMode: atom({ key: "test_filterMode", default: true }),
    useDebounceCallback: (cb: (v: string) => void) => cb,
  };
});

vi.mock("./state", async () => {
  const { atomFamily, constSelector } =
    await vi.importActual<typeof import("@fiftyone/reverb")>(
      "@fiftyone/reverb",
    );
  const results = constSelector({
    values: [
      { value: "cat", count: 3 },
      { value: null, count: 1 },
    ],
  });
  return {
    stringSearch: atomFamily({ key: "test_stringSearch", default: "" }),
    stringSearchResults: () => results,
  };
});

vi.mock("../use-query-performance-timeout", () => ({ default: () => {} }));

import Search from "./Search";

const renderSearch = (accept = true) => {
  const onSelect = vi.fn(async () => accept);
  render(
    <ReverbRoot>
      <Search
        color="#ff0000"
        modal={false}
        onSelect={onSelect}
        path="label"
        placeholder="Filter by label"
        searchable
      />
    </ReverbRoot>,
  );
  const input =
    screen.getByPlaceholderText<HTMLInputElement>("Filter by label");
  return { input, onSelect };
};

const type = (input: HTMLInputElement, value: string) => {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
};

describe("Search", () => {
  afterEach(cleanup);

  it("lists nothing until the focused field holds text", () => {
    const { input } = renderSearch();
    fireEvent.focus(input);

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("adds a clicked result, clears the field and keeps focus", async () => {
    const { input, onSelect } = renderSearch();
    type(input, "c");
    const option = await screen.findByText("\u200ecat\u200e");
    expect(fireEvent.mouseDown(option)).toBe(false);
    await act(async () => {
      fireEvent.click(option);
    });

    expect(onSelect).toHaveBeenCalledWith("cat", { value: "cat", count: 3 });
    expect(input.value).toBe("");
  });

  it("adds the highlighted result on Enter, and null for None", async () => {
    const { input, onSelect } = renderSearch();
    type(input, "n");
    await screen.findByRole("listbox");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(onSelect).toHaveBeenCalledWith(null, { value: null, count: 1 });
  });

  it("closes the list on Escape", async () => {
    const { input } = renderSearch();
    type(input, "c");
    await screen.findByRole("listbox");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("keeps typed text the filter rejects", async () => {
    const { input, onSelect } = renderSearch(false);
    type(input, "dog");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(onSelect).toHaveBeenCalledWith("dog", undefined);
    expect(input.value).toBe("dog");
  });
});
