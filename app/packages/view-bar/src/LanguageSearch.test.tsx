import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  dataset: "robots",
  pending: false,
}));
vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => env.dataset,
  useViewChangePending: () => env.pending,
}));
const sources = vi.hoisted(() => ({
  current: null as { label: string; values: string[] } | null,
  wanted: vi.fn(),
}));
vi.mock("./useSearchSources", () => ({
  useSearchSources: (_index: unknown, wanted: boolean) => {
    sources.wanted(wanted);
    return sources.current;
  },
}));
vi.mock("./SearchSettingsPopover", () => ({
  SearchSettingsPopover: ({
    trigger,
    onChangeSources,
  }: {
    trigger: React.ReactNode;
    onChangeSources: (values: string[]) => void;
  }) => (
    <>
      {trigger}
      <button onClick={() => onChangeSources(["/cam_left"])}>
        choose left
      </button>
    </>
  ),
}));

import { LANGUAGE_SEARCH_LABEL, LanguageSearch } from "./LanguageSearch";
import type { TextSearchController } from "./useTextSearch";

const noop = () => undefined;

const search = (query: string) => {
  const field = screen.getByRole("combobox", { name: LANGUAGE_SEARCH_LABEL });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: query } });
  fireEvent.keyDown(field, { key: "Enter" });
};

const controller = (
  overrides: Partial<TextSearchController>,
): TextSearchController => ({
  available: true,
  enabled: true,
  onUnavailable: vi.fn(),
  history: ["cats"],
  promptKeys: [],
  selectedIndex: undefined,
  onSelectKey: noop,
  k: 25,
  onChangeK: noop,
  onOpenPanel: vi.fn(),
  submit: vi.fn(),
  ...overrides,
});

const renderSearch = (overrides: Partial<TextSearchController>) => {
  const controls = controller(overrides);
  render(<LanguageSearch search={controls} />);
  return controls;
};

describe("LanguageSearch", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    env.dataset = "robots";
    env.pending = false;
    sources.current = null;
  });

  it("always renders the field", () => {
    renderSearch({ available: false, enabled: false });
    expect(
      screen.getByRole("combobox", { name: LANGUAGE_SEARCH_LABEL }),
    ).toBeTruthy();
  });

  it("explains itself on click when the operator is not registered", () => {
    const { onUnavailable } = renderSearch({ available: false, enabled: true });
    fireEvent.focus(
      screen.getByRole("combobox", { name: LANGUAGE_SEARCH_LABEL }),
    );
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("offers to set an index up when the operator exists but no index does", () => {
    const { onUnavailable, onOpenPanel } = renderSearch({
      available: true,
      enabled: false,
    });
    fireEvent.focus(
      screen.getByRole("combobox", { name: LANGUAGE_SEARCH_LABEL }),
    );
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(screen.getByText("Describe what you’re looking for")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create index" }));
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
  });

  it("offers previous queries when search is possible", () => {
    renderSearch({ available: true, enabled: true });
    fireEvent.focus(
      screen.getByRole("combobox", { name: LANGUAGE_SEARCH_LABEL }),
    );
    expect(screen.getByRole("option", { name: "cats" })).toBeTruthy();
  });

  it("empties the field when the dataset changes", () => {
    const controls = controller({ history: [] });
    const { rerender } = render(<LanguageSearch search={controls} />);
    const field = () =>
      screen.getByRole<HTMLInputElement>("combobox", {
        name: LANGUAGE_SEARCH_LABEL,
      });
    fireEvent.change(field(), { target: { value: "an animal" } });
    expect(field().value).toBe("an animal");

    env.dataset = "cars";
    rerender(<LanguageSearch search={controls} />);

    expect(field().value).toBe("");
  });

  it("opens the panel when a query is submitted with no index", () => {
    const { submit, onOpenPanel } = renderSearch({
      available: true,
      enabled: false,
    });
    search("person");
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it("runs the query when it is submitted with an index", () => {
    const { submit, onOpenPanel } = renderSearch({
      available: true,
      enabled: true,
    });
    search("person");
    expect(submit).toHaveBeenCalledWith("person", null);
    expect(onOpenPanel).not.toHaveBeenCalled();
  });

  it("does nothing when the operator is not registered", () => {
    const { submit, onOpenPanel } = renderSearch({
      available: false,
      enabled: false,
    });
    search("person");
    expect(submit).not.toHaveBeenCalled();
    expect(onOpenPanel).not.toHaveBeenCalled();
  });

  const renderStreamIndex = () => {
    sources.current = {
      label: "Streams",
      values: ["/cam_left", "/cam_right"],
    };
    const index = {
      key: "emb_sim",
      patchesField: null,
      provider: "multimodal",
    };
    return renderSearch({
      history: [],
      promptKeys: [index],
      selectedIndex: index,
    });
  };

  it("asks for the index's sources only once the settings open", () => {
    renderStreamIndex();
    expect(sources.wanted).toHaveBeenLastCalledWith(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Similarity search settings" }),
    );
    expect(sources.wanted).toHaveBeenLastCalledWith(true);
  });

  it("searches only the sources chosen in the settings", () => {
    const { submit } = renderStreamIndex();
    fireEvent.click(screen.getByRole("button", { name: "choose left" }));
    search("an animal");
    expect(submit).toHaveBeenCalledWith("an animal", ["/cam_left"]);
  });

  it("keeps the search settings shut while a search runs", () => {
    renderSearch({ available: true, enabled: true });
    expect(
      screen.getByRole("button", { name: "Similarity search settings" }),
    ).toBeTruthy();

    cleanup();
    env.pending = true;
    renderSearch({ available: true, enabled: true });

    expect(
      screen.queryByRole("button", { name: "Similarity search settings" }),
    ).toBeNull();
    expect(screen.getByLabelText("Search in progress")).toBeTruthy();
  });
});
