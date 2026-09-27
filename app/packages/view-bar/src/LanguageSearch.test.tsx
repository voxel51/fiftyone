import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  dataset: "robots",
  pending: false,
  recentQueries: [] as string[],
}));
vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => env.dataset,
  useViewChangePending: () => env.pending,
}));
const extensionRun = vi.hoisted(() => vi.fn());
vi.mock("./useLanguageSearchExtension", () => ({
  useLanguageSearchExtension: () => ({
    run: extensionRun,
    recentQueries: env.recentQueries,
  }),
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
type ListProps = {
  query: string;
  close: () => void;
  refresh: () => void;
  startAction: (id: string) => void;
};
const suggested = vi.hoisted(() => ({
  current: null as {
    mode: "open" | "pending" | "offered";
    prompts: string[];
    actions: { id: string; label: string }[];
    loading: boolean;
    index: { datasetName: string; brainKey: string; runTimestamp: null };
    EmptyList?: React.ComponentType<ListProps>;
    Action?: React.ComponentType<ListProps & { id: string }>;
  } | null,
  loadCount: vi.fn(),
  history: vi.fn(),
}));
vi.mock("./useSearchSuggestions", () => ({
  useSearchSuggestions: (
    _index: unknown,
    _query: string,
    history: readonly string[],
    loadCount: number,
  ) => {
    suggested.loadCount(loadCount);
    suggested.history(history);
    return suggested.current;
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

const noop = () => undefined;

const search = (query: string) => {
  const field = screen.getByRole("combobox", { name: LANGUAGE_SEARCH_LABEL });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: query } });
  fireEvent.keyDown(field, { key: "Enter" });
};

const renderSearch = (props: { available: boolean; enabled: boolean }) => {
  const onUnavailable = vi.fn();
  const onOpenPanel = vi.fn();
  const onSubmit = vi.fn();
  render(
    <LanguageSearch
      onSubmit={onSubmit}
      onUnavailable={onUnavailable}
      history={["cats"]}
      promptKeys={[]}
      selectedKey={null}
      onSelectKey={noop}
      k={25}
      onChangeK={noop}
      onOpenPanel={onOpenPanel}
      {...props}
    />,
  );
  return { onSubmit, onUnavailable, onOpenPanel };
};

describe("LanguageSearch", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    env.dataset = "robots";
    env.pending = false;
    env.recentQueries = [];
    sources.current = null;
    suggested.current = null;
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

  it("offers a query an extension just ran before the stored history has it", () => {
    env.recentQueries = ["dogs"];
    renderSearch({ available: true, enabled: true });
    fireEvent.focus(
      screen.getByRole("combobox", { name: LANGUAGE_SEARCH_LABEL }),
    );
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["dogs", "cats"]);
  });

  it("empties the field when the dataset changes", () => {
    const props = {
      onSubmit: noop,
      onUnavailable: noop,
      available: true,
      enabled: true,
      history: [],
      promptKeys: [],
      selectedKey: null,
      onSelectKey: noop,
      k: 25,
      onChangeK: noop,
      onOpenPanel: noop,
    };
    const { rerender } = render(<LanguageSearch {...props} />);
    const field = () =>
      screen.getByRole<HTMLInputElement>("combobox", {
        name: LANGUAGE_SEARCH_LABEL,
      });
    fireEvent.change(field(), { target: { value: "an animal" } });
    expect(field().value).toBe("an animal");

    env.dataset = "cars";
    rerender(<LanguageSearch {...props} />);

    expect(field().value).toBe("");
  });

  it("opens the panel when a query is submitted with no index", () => {
    const { onSubmit, onOpenPanel } = renderSearch({
      available: true,
      enabled: false,
    });
    search("person");
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("runs the query when it is submitted with an index", () => {
    const { onSubmit, onOpenPanel } = renderSearch({
      available: true,
      enabled: true,
    });
    search("person");
    expect(onSubmit).toHaveBeenCalledWith("person");
    expect(onOpenPanel).not.toHaveBeenCalled();
  });

  it("does nothing when the operator is not registered", () => {
    const { onSubmit, onOpenPanel } = renderSearch({
      available: false,
      enabled: false,
    });
    search("person");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onOpenPanel).not.toHaveBeenCalled();
  });

  it("hands a query for an index an extension searches to the extension", () => {
    const onSubmit = vi.fn();
    const index = {
      key: "emb_sim",
      patchesField: null,
      extension: "multimodal",
    };
    render(
      <LanguageSearch
        onSubmit={onSubmit}
        onUnavailable={noop}
        available
        enabled
        history={[]}
        promptKeys={[index]}
        selectedKey="emb_sim"
        onSelectKey={noop}
        k={25}
        onChangeK={noop}
        onOpenPanel={noop}
      />,
    );
    search("an animal");
    expect(extensionRun).toHaveBeenCalledWith(index, "an animal", 25, null);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  const renderStreamIndex = () => {
    sources.current = {
      label: "Streams",
      values: ["/cam_left", "/cam_right"],
    };
    const index = {
      key: "emb_sim",
      patchesField: null,
      extension: "multimodal",
    };
    render(
      <LanguageSearch
        onSubmit={noop}
        onUnavailable={noop}
        available
        enabled
        history={[]}
        promptKeys={[index]}
        selectedKey="emb_sim"
        onSelectKey={noop}
        k={25}
        onChangeK={noop}
        onOpenPanel={noop}
      />,
    );
    return index;
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
    const index = renderStreamIndex();
    fireEvent.click(screen.getByRole("button", { name: "choose left" }));
    search("an animal");
    expect(extensionRun).toHaveBeenCalledWith(index, "an animal", 25, [
      "/cam_left",
    ]);
  });

  it("searches an extension's index without the similarity operator or a server index", () => {
    const onUnavailable = vi.fn();
    const onOpenPanel = vi.fn();
    const index = {
      key: "emb_sim",
      patchesField: null,
      extension: "multimodal",
    };
    render(
      <LanguageSearch
        onSubmit={noop}
        onUnavailable={onUnavailable}
        available={false}
        enabled={false}
        history={[]}
        promptKeys={[index]}
        selectedKey="emb_sim"
        onSelectKey={noop}
        k={25}
        onChangeK={noop}
        onOpenPanel={onOpenPanel}
      />,
    );
    search("an animal");
    expect(extensionRun).toHaveBeenCalledWith(index, "an animal", 25, null);
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(onOpenPanel).not.toHaveBeenCalled();
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
  describe("with an extension's suggestions", () => {
    const EXTENSION_INDEX = {
      key: "emb_sim",
      patchesField: null,
      extension: "multimodal",
    };

    const setSuggested = (
      answer: Partial<NonNullable<typeof suggested.current>> = {},
    ) => {
      suggested.current = {
        mode: "offered",
        prompts: [],
        actions: [],
        loading: false,
        index: {
          datasetName: "robots",
          brainKey: "emb_sim",
          runTimestamp: null,
        },
        ...answer,
      };
    };

    const renderSuggested = (history: string[] = []) => {
      render(
        <LanguageSearch
          onSubmit={noop}
          onUnavailable={noop}
          available
          enabled
          history={history}
          promptKeys={[EXTENSION_INDEX]}
          selectedKey="emb_sim"
          onSelectKey={noop}
          k={25}
          onChangeK={noop}
          onOpenPanel={noop}
        />,
      );
    };

    const field = () =>
      screen.getByRole<HTMLInputElement>("combobox", {
        name: LANGUAGE_SEARCH_LABEL,
      });

    const type = (text: string) => {
      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: text } });
    };

    const optionNames = () =>
      screen.queryAllByRole("option").map((option) => option.textContent);

    it("lists matching previous queries, then the extension's prompts, without repeats", () => {
      setSuggested({ mode: "open", prompts: ["a robot arm", "a red cup"] });
      renderSuggested(["a red cup", "a green bowl"]);
      type("a r");
      expect(optionNames()).toEqual(["a red cup", "a robot arm"]);
    });

    it("hands the extension the field's previous queries", () => {
      setSuggested();
      renderSuggested(["a red cup"]);
      expect(suggested.history).toHaveBeenLastCalledWith(["a red cup"]);
    });

    it("searches free text when the extension allows it", () => {
      setSuggested({ mode: "open" });
      renderSuggested();
      search("a green bowl");
      expect(extensionRun).toHaveBeenCalledWith(
        EXTENSION_INDEX,
        "a green bowl",
        25,
        null,
      );
    });

    it("lists only the extension's prompts when only they can run", () => {
      setSuggested({ prompts: ["a red cup"] });
      renderSuggested(["a green bowl"]);
      type("");
      expect(optionNames()).toEqual(["a red cup"]);
    });

    it("refuses text that is not one of the extension's prompts", () => {
      // Nothing matched, so no row can take the Enter
      setSuggested({ prompts: [] });
      renderSuggested();
      search("a green bowl");
      expect(extensionRun).not.toHaveBeenCalled();
    });

    it("takes the top prompt on Enter", () => {
      setSuggested({ prompts: ["a robot arm"] });
      renderSuggested();
      search("robot");
      expect(extensionRun).toHaveBeenCalledWith(
        EXTENSION_INDEX,
        "a robot arm",
        25,
        null,
      );
    });

    it("runs no typed text before the extension's suggester loads", () => {
      setSuggested({ mode: "pending", loading: true });
      renderSuggested(["a red cup"]);
      search("a green bowl");
      expect(extensionRun).not.toHaveBeenCalled();
    });

    it("offers previous queries before the extension's suggester loads", () => {
      setSuggested({ mode: "pending" });
      renderSuggested(["a red cup"]);
      type("");
      expect(optionNames()).toEqual(["a red cup"]);
    });

    it("loads the suggester again each time the list opens", () => {
      setSuggested();
      renderSuggested();
      const before = suggested.loadCount.mock.lastCall?.[0];
      fireEvent.focus(field());
      expect(suggested.loadCount.mock.lastCall?.[0]).toBe(before + 1);
    });

    const Action = ({ id, close, refresh }: ListProps & { id: string }) => (
      <div role="dialog" aria-label={`action ${id}`}>
        <button onClick={refresh}>refresh</button>
        <button onClick={close}>close</button>
      </div>
    );

    it("offers the extension's actions after its prompts, and starts one without searching", () => {
      setSuggested({
        prompts: ["a robot arm"],
        actions: [{ id: "add-queries", label: "Add queries" }],
        Action,
      });
      renderSuggested();
      type("robot");
      expect(optionNames()).toEqual(["a robot arm", "Add queries"]);
      fireEvent.mouseDown(screen.getByRole("option", { name: "Add queries" }));
      expect(
        screen.getByRole("dialog", { name: "action add-queries" }),
      ).toBeTruthy();
      expect(extensionRun).not.toHaveBeenCalled();
      expect(field().value).toBe("robot");
    });

    it("offers no action row when no prompt matched", () => {
      setSuggested({
        actions: [{ id: "add-queries", label: "Add queries" }],
        Action,
      });
      renderSuggested();
      type("a green bowl");
      expect(optionNames()).toEqual([]);
    });

    const EmptyList = ({ startAction }: ListProps) => (
      <button onClick={() => startAction("add-queries")}>
        nothing can run
      </button>
    );

    it("shows the extension's empty list when nothing can run, and starts its action", () => {
      setSuggested({ EmptyList, Action });
      renderSuggested();
      type("a green bowl");
      fireEvent.click(screen.getByRole("button", { name: "nothing can run" }));
      expect(
        screen.getByRole("dialog", { name: "action add-queries" }),
      ).toBeTruthy();
      fireEvent.change(field(), { target: { value: "a green bowls" } });
      expect(field().value).toBe("a green bowls");
    });

    it("shows no empty list while any text can run", () => {
      setSuggested({ mode: "open", EmptyList });
      renderSuggested();
      type("a green bowl");
      expect(
        screen.queryByRole("button", { name: "nothing can run" }),
      ).toBeNull();
    });

    it("loads the suggester again on refresh, and ends the action on close", () => {
      setSuggested({ EmptyList, Action });
      renderSuggested();
      type("a green bowl");
      fireEvent.click(screen.getByRole("button", { name: "nothing can run" }));
      const before = suggested.loadCount.mock.lastCall?.[0];
      fireEvent.click(screen.getByRole("button", { name: "refresh" }));
      expect(suggested.loadCount.mock.lastCall?.[0]).toBe(before + 1);
      fireEvent.click(screen.getByRole("button", { name: "close" }));
      expect(
        screen.queryByRole("dialog", { name: "action add-queries" }),
      ).toBeNull();
    });
  });
});
