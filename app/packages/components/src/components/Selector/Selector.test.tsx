import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Selector from "./Selector";

configure({ testIdAttribute: "data-cy" });

const SLICES = ["image", "video"];

const useSearch = (search: string) => {
  const values = SLICES.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase()),
  );
  return { values, total: values.length };
};

const Option = ({ value }: { value: string }) => <span>{value}</span>;

const renderSelector = (value: string | undefined) =>
  render(
    <Selector
      value={value}
      onSelect={vi.fn()}
      placeholder="Select slice..."
      useSearch={useSearch}
      component={Option}
      cy="test"
    />,
  );

const openResults = () => {
  const input = screen.getByTestId("selector-test");
  fireEvent.focus(input);
  return input;
};

const visibleResults = () =>
  screen
    .queryAllByTestId(/^selector-result-/)
    .map((node) => node.textContent?.trim());

describe("Selector", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows all results when opened with a selected value", () => {
    renderSelector("video");
    openResults();
    expect(visibleResults()).toEqual(SLICES);
  });

  it("does not filter open results when `value` settles after opening", () => {
    // regression: opening the selector before an async `value` arrives
    // (e.g. the annotation slice selector while group data loads), then the
    // value settling, used to seed the search text with the value and filter
    // the open results down to it
    const { rerender } = renderSelector(undefined);
    openResults();
    expect(visibleResults()).toEqual(SLICES);

    rerender(
      <Selector
        value="video"
        onSelect={vi.fn()}
        placeholder="Select slice..."
        useSearch={useSearch}
        component={Option}
        cy="test"
      />,
    );

    expect(visibleResults()).toEqual(SLICES);
  });

  it("does not clobber typed search text when `value` updates mid-edit", () => {
    const { rerender } = renderSelector(undefined);
    const input = openResults();
    fireEvent.change(input, { target: { value: "ima" } });
    expect(visibleResults()).toEqual(["image"]);

    rerender(
      <Selector
        value="video"
        onSelect={vi.fn()}
        placeholder="Select slice..."
        useSearch={useSearch}
        component={Option}
        cy="test"
      />,
    );

    expect((input as HTMLInputElement).value).toBe("ima");
    expect(visibleResults()).toEqual(["image"]);
  });

  it("syncs the displayed value when `value` changes while not editing", () => {
    const { rerender } = renderSelector("image");
    const input = screen.getByTestId("selector-test") as HTMLInputElement;
    expect(input.value).toBe("image");

    rerender(
      <Selector
        value="video"
        onSelect={vi.fn()}
        placeholder="Select slice..."
        useSearch={useSearch}
        component={Option}
        cy="test"
      />,
    );

    expect(input.value).toBe("video");
  });

  it("keeps the selected value displayed after selecting, before `value` updates", async () => {
    // onSelect resolves with the selection, but the `value` prop stays stale —
    // the optimistic display must not revert to the old value when editing ends
    const onSelect = vi.fn(async (search: string) => search);
    render(
      <Selector
        value="image"
        onSelect={onSelect}
        placeholder="Select slice..."
        useSearch={useSearch}
        component={Option}
        cy="test"
      />,
    );

    const input = openResults() as HTMLInputElement;
    fireEvent.change(input, { target: { value: "video" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // wait for the selection to close the results, i.e. editing has ended
    await waitFor(() => expect(visibleResults()).toEqual([]));
    expect(onSelect).toHaveBeenCalledWith("video", "video");
    expect(input.value).toBe("video");
  });
});
