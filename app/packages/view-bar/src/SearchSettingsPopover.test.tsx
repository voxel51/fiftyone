import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PromptableSimilarityIndex } from "@fiftyone/state";
import { afterEach, describe, expect, it, vi } from "vitest";

const HINT = "Ranked over the whole index.";

vi.mock("@fiftyone/state", () => ({
  useTextSearchExtensions: () =>
    new Map([["multimodal", { method: "multimodal", resultsHint: HINT }]]),
}));

import { SearchSettingsPopover } from "./SearchSettingsPopover";

const noop = () => undefined;

const STREAMS = { label: "Streams", values: ["/cam_left", "/cam_right"] };

const openWith = (
  selectedKey: string,
  {
    promptKeys = [
      { key: "emb_sim", patchesField: null, extension: "multimodal" },
      { key: "clip_sim", patchesField: null },
    ],
    sources = null,
    selectedSources = null,
    onChangeSources = noop,
  }: {
    promptKeys?: PromptableSimilarityIndex[];
    sources?: typeof STREAMS | null;
    selectedSources?: string[] | null;
    onChangeSources?: (values: string[]) => void;
  } = {},
) => {
  render(
    <SearchSettingsPopover
      trigger={<button>settings</button>}
      promptKeys={promptKeys}
      selectedKey={selectedKey}
      onSelectKey={noop}
      k={25}
      onChangeK={noop}
      sources={sources}
      selectedSources={selectedSources}
      onChangeSources={onChangeSources}
      onOpenPanel={noop}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "settings" }));
};

describe("SearchSettingsPopover", () => {
  afterEach(cleanup);

  it("shows the selected index's extension hint between the Results label and its input, and none for other indexes", () => {
    openWith("emb_sim");
    const hint = screen.getByText(HINT);
    expect(
      screen.getByText("Results").compareDocumentPosition(hint) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      hint.compareDocumentPosition(screen.getByLabelText("Number of results")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    cleanup();
    openWith("clip_sim");
    expect(screen.getByLabelText("Number of results")).toBeTruthy();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("offers the index's sources only for an index that has them", () => {
    openWith("clip_sim");
    expect(screen.queryByText("Streams")).toBeNull();

    cleanup();
    openWith("emb_sim", { sources: STREAMS });
    expect(screen.getByText("Streams")).toBeTruthy();
  });

  it("offers the Similarity Search panel only while the dataset has an index the server sorts", () => {
    const panelHandOff = () =>
      document.querySelector('[data-cy="search-settings-open-panel"]');
    // The selected index is extension-searched; another index is not
    openWith("emb_sim", { sources: STREAMS });
    expect(panelHandOff()).toBeTruthy();

    cleanup();
    openWith("emb_sim", {
      promptKeys: [
        { key: "emb_sim", patchesField: null, extension: "multimodal" },
      ],
    });
    expect(panelHandOff()).toBeNull();
  });

  it("reads All while every source is searched, and how many otherwise", () => {
    openWith("emb_sim", { sources: STREAMS });
    expect(screen.getByRole("button", { name: "All" })).toBeTruthy();

    cleanup();
    openWith("emb_sim", { sources: STREAMS, selectedSources: ["/cam_left"] });
    expect(screen.getByRole("button", { name: "1 of 2" })).toBeTruthy();
  });

  it("checks every source again when the last one is unchecked", () => {
    const onChangeSources = vi.fn();
    openWith("emb_sim", {
      sources: STREAMS,
      selectedSources: ["/cam_left"],
      onChangeSources,
    });
    fireEvent.click(screen.getByRole("button", { name: "1 of 2" }));
    fireEvent.click(screen.getByLabelText("/cam_left"));
    expect(onChangeSources).toHaveBeenLastCalledWith([
      "/cam_left",
      "/cam_right",
    ]);
  });
});
