import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const HINT = "Ranked over the whole index.";

vi.mock("@fiftyone/state", () => ({
  useTextSearchExtensions: () =>
    new Map([["multimodal", { method: "multimodal", resultsHint: HINT }]]),
}));

import { SearchSettingsPopover } from "./SearchSettingsPopover";

const noop = () => undefined;

const openWith = (selectedKey: string) => {
  render(
    <SearchSettingsPopover
      trigger={<button>settings</button>}
      promptKeys={[
        { key: "emb_sim", patchesField: null, extension: "multimodal" },
        { key: "clip_sim", patchesField: null },
      ]}
      selectedKey={selectedKey}
      onSelectKey={noop}
      k={25}
      onChangeK={noop}
      onOpenPanel={noop}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "settings" }));
};

describe("SearchSettingsPopover", () => {
  afterEach(cleanup);

  it("shows the selected index's extension hint under Results, and none for other indexes", () => {
    openWith("emb_sim");
    expect(screen.getByText(HINT)).toBeTruthy();

    cleanup();
    openWith("clip_sim");
    expect(screen.getByLabelText("Number of results")).toBeTruthy();
    expect(screen.queryByText(HINT)).toBeNull();
  });
});
