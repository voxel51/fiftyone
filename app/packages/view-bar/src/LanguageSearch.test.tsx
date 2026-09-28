import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextSearchSuggestions } from "@fiftyone/state";

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
vi.mock("./useIndexSlices", () => ({ useIndexSlices: () => new Map() }));
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
import { HistorySuggestions } from "./HistorySuggestions";
import type { TextSearchController } from "./useTextSearch";

const noop = () => undefined;

const search = (query: string) => {
  const field = screen.getByRole("combobox", { name: LANGUAGE_SEARCH_LABEL });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: query } });
  fireEvent.keyDown(field, { key: "Enter" });
};

/** An index a text search provider searches, rather than the server. */
const PROVIDER_INDEX = {
  key: "emb_sim",
  patchesField: null,
  provider: "multimodal",
};

/** Renders the field with a similarity index enabled and nothing selected,
 * as `overrides` changes it; returns its controller, callbacks being spies. */
const renderSearch = (overrides: Partial<TextSearchController> = {}) => {
  const controls: TextSearchController = {
    available: true,
    enabled: true,
    onUnavailable: vi.fn(),
    history: [],
    promptKeys: [],
    selectedIndex: undefined,
    onSelectKey: noop,
    k: 25,
    onChangeK: noop,
    onOpenPanel: vi.fn(),
    submit: vi.fn(),
    Suggestions: HistorySuggestions,
    ...overrides,
  };
  const view = render(<LanguageSearch search={controls} />);
  return {
    ...controls,
    rerender: () => view.rerender(<LanguageSearch search={controls} />),
  };
};

/** Renders the field with {@link PROVIDER_INDEX} selected. */
const renderProviderSearch = (overrides: Partial<TextSearchController> = {}) =>
  renderSearch({
    promptKeys: [PROVIDER_INDEX],
    selectedIndex: PROVIDER_INDEX,
    ...overrides,
  });

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

  it("offers the previous queries matching the typed text", () => {
    renderSearch({ history: ["Cats", "dogs"] });
    const field = screen.getByRole("combobox", { name: LANGUAGE_SEARCH_LABEL });
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "ca" } });
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Cats"]);
  });

  it("empties the field when the dataset changes", () => {
    const { rerender } = renderSearch();
    const field = () =>
      screen.getByRole<HTMLInputElement>("combobox", {
        name: LANGUAGE_SEARCH_LABEL,
      });
    fireEvent.change(field(), { target: { value: "an animal" } });
    expect(field().value).toBe("an animal");

    env.dataset = "cars";
    rerender();

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
    return renderProviderSearch();
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
    renderSearch();
    expect(
      screen.getByRole("button", { name: "Similarity search settings" }),
    ).toBeTruthy();

    cleanup();
    env.pending = true;
    renderSearch();

    expect(
      screen.queryByRole("button", { name: "Similarity search settings" }),
    ).toBeNull();
    expect(screen.getByLabelText("Search in progress")).toBeTruthy();
  });
  describe("with a provider's suggestions", () => {
    const seen = vi.fn();

    /** A provider offering `answer` for whatever is typed. */
    const suggesting =
      (
        answer: Partial<TextSearchSuggestions>,
      ): TextSearchController["Suggestions"] =>
      ({ children, ...props }) => {
        seen(props);
        return <>{children({ prompts: [], freeText: false, ...answer })}</>;
      };

    const field = () =>
      screen.getByRole<HTMLInputElement>("combobox", {
        name: LANGUAGE_SEARCH_LABEL,
      });

    it("lists the provider's rows and hands it the typed text, previous queries and whether the list is open", () => {
      renderProviderSearch({
        history: ["a green bowl"],
        Suggestions: suggesting({ prompts: ["a red cup", "a robot arm"] }),
      });
      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: "a r" } });

      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["a red cup", "a robot arm"]);
      expect(seen).toHaveBeenLastCalledWith({
        index: {
          datasetName: "robots",
          brainKey: "emb_sim",
          runTimestamp: null,
        },
        query: "a r",
        history: ["a green bowl"],
        open: true,
      });
    });

    it.each<{
      name: string;
      answer: Partial<TextSearchSuggestions>;
      typed: string;
      runs: string | null;
    }>([
      {
        name: "free text when the provider allows it",
        answer: { freeText: true },
        typed: "a green bowl",
        runs: "a green bowl",
      },
      {
        name: "the top row",
        answer: { prompts: ["a robot arm"] },
        typed: "robot",
        runs: "a robot arm",
      },
      {
        // Nothing matched, so no row can take the Enter
        name: "nothing for text that is no row",
        answer: {},
        typed: "a green bowl",
        runs: null,
      },
    ])("runs $name on Enter", ({ answer, typed, runs }) => {
      const { submit } = renderProviderSearch({
        Suggestions: suggesting(answer),
      });
      search(typed);
      if (runs === null) {
        expect(submit).not.toHaveBeenCalled();
      } else {
        expect(submit).toHaveBeenCalledWith(runs, null);
      }
    });

    it("shows the provider's empty message when it offers nothing", () => {
      renderProviderSearch({
        Suggestions: suggesting({
          emptyMessage: () => <span>nothing can run</span>,
        }),
      });
      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: "a green bowl" } });
      expect(screen.getByText("nothing can run")).toBeTruthy();
    });
  });
});
