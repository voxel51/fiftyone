import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReverbRoot } from "@fiftyone/reverb";
import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";

const setDatasetSpy = vi.fn();
const searches: string[] = [];

// Provide just the @fiftyone/state surface the component imports.
vi.mock("@fiftyone/state", async () => {
  const { atom, useReverbValue } =
    await vi.importActual<typeof import("@fiftyone/reverb")>(
      "@fiftyone/reverb",
    );
  const datasetName = atom<string | null>({
    key: "test_datasetName",
    default: null,
  });
  return {
    datasetName,
    useCurrentDatasetName: () => useReverbValue(datasetName),
    useSetDataset: () => setDatasetSpy,
  };
});

import { datasetName } from "@fiftyone/state";
import DatasetSelector from "./DatasetSelector";

const ALL = ["quickstart", "quickstart-video", "open-images"];
const useSearch = (search: string) => {
  searches.push(search);
  return { values: ALL.filter((name) => name.includes(search)) };
};

const setup = (applied?: string, hidden = false) =>
  render(
    // Its own store per render: the root initializes a store once, so tests
    // sharing the default one would only ever see the first initializer
    <ReverbRoot
      store={createStore()}
      initializeState={({ set }) => {
        if (applied) set(datasetName, applied);
      }}
    >
      <DatasetSelector useSearch={useSearch} hidden={hidden} />
    </ReverbRoot>,
  );

const trigger = () => screen.getByRole("button", { name: "Switch dataset" });
const search = () => screen.getByRole("combobox", { name: "Find dataset" });

describe("DatasetSelector", () => {
  afterEach(() => {
    cleanup();
    setDatasetSpy.mockReset();
    searches.length = 0;
  });

  it("names the loaded dataset on the pill", () => {
    setup("quickstart");
    expect(trigger().textContent).toContain("quickstart");
  });

  it("searches the server with what is typed in the menu", () => {
    setup("quickstart");
    fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: "open" } });

    expect(searches.at(-1)).toBe("open");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "open-images",
    ]);
  });

  it("loads a picked dataset and names it while it loads", () => {
    setup();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: "quickstart-video" }));

    expect(setDatasetSpy).toHaveBeenCalledWith("quickstart-video");
    expect(trigger().textContent).toContain("quickstart-video");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("picks the highlighted match with the keyboard", () => {
    setup();
    fireEvent.click(trigger());
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    fireEvent.keyDown(search(), { key: "Enter" });

    expect(setDatasetSpy).toHaveBeenCalledWith("quickstart-video");
  });

  it("does not reload the dataset that is already open", () => {
    setup("quickstart");
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: "quickstart" }));

    expect(setDatasetSpy).not.toHaveBeenCalled();
  });

  it("goes to all datasets", () => {
    setup("quickstart");
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: "All datasets" }));

    expect(setDatasetSpy).toHaveBeenCalledWith(null);
  });

  it("closes when the header is hidden", () => {
    const { rerender } = setup("quickstart");
    fireEvent.click(trigger());
    expect(screen.getByRole("listbox")).toBeTruthy();

    rerender(
      <ReverbRoot store={createStore()}>
        <DatasetSelector useSearch={useSearch} hidden />
      </ReverbRoot>,
    );
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
