import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecoilRoot } from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";

const setDatasetSpy = vi.fn();

// Provide just the @fiftyone/state surface the component imports.
vi.mock("@fiftyone/state", async () => {
  const { atom } = await vi.importActual<typeof import("recoil")>("recoil");
  return {
    datasetName: atom<string | null>({
      key: "test_datasetName",
      default: null,
    }),
    useSetDataset: () => setDatasetSpy,
  };
});

import DatasetSelector from "./DatasetSelector";

const useSearch = () => ({ values: ["quickstart", "quickstart-video"] });

const setup = () =>
  render(
    <RecoilRoot>
      <DatasetSelector useSearch={useSearch} />
    </RecoilRoot>,
  );

describe("DatasetSelector", () => {
  afterEach(() => {
    cleanup();
    setDatasetSpy.mockReset();
  });

  it("keeps the picked name in the field while the dataset loads", () => {
    setup();
    const input = screen.getByRole("combobox", { name: "Dataset" });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "quick" } });
    // voodo's Combobox picks on mousedown, then closes in the same event
    fireEvent.mouseDown(screen.getByRole("option", { name: "quickstart" }));

    expect(setDatasetSpy).toHaveBeenCalledWith("quickstart");
    // The route has not resolved yet (`datasetName` is still null); the field
    // must not blank out in the meantime
    expect((input as HTMLInputElement).value).toBe("quickstart");
  });

  it("restores the current dataset when the list closes without a pick", () => {
    setup();
    const input = screen.getByRole("combobox", { name: "Dataset" });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "quick" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(setDatasetSpy).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("");
  });
});
