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
        modal={false}
        onSelect={onSelect}
        path="label"
        placeholder="+ filter by label"
        searchable
      />
    </ReverbRoot>,
  );
  const input =
    screen.getByPlaceholderText<HTMLInputElement>("+ filter by label");
  return { input, onSelect };
};

describe("Search", () => {
  afterEach(cleanup);

  it("adds a picked result and clears the field", async () => {
    const { input, onSelect } = renderSearch();
    fireEvent.focus(input);
    await act(async () => {
      fireEvent.mouseDown(await screen.findByText("cat"));
    });

    expect(onSelect).toHaveBeenCalledWith("cat", { value: "cat", count: 3 });
    expect(input.value).toBe("");
  });

  it("adds null for the None result", async () => {
    const { input, onSelect } = renderSearch();
    fireEvent.focus(input);
    await act(async () => {
      fireEvent.mouseDown(await screen.findByText("None"));
    });

    expect(onSelect).toHaveBeenCalledWith(null, { value: null, count: 1 });
  });

  it("keeps typed text the filter rejects", async () => {
    const { input, onSelect } = renderSearch(false);
    fireEvent.change(input, { target: { value: "dog" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(onSelect).toHaveBeenCalledWith("dog", undefined);
    expect(input.value).toBe("dog");
  });
});
