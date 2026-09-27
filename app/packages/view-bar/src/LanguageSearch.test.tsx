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
const encoded = vi.hoisted(() => ({
  current: null as {
    queries: string[];
    freeText: boolean;
    loading: boolean;
    index: { datasetName: string; brainKey: string; runTimestamp: null };
    AddQueries?: React.ComponentType<{
      onClose: () => void;
      onAdded: () => void;
    }>;
  } | null,
  readCount: vi.fn(),
}));
vi.mock("./useSearchQueries", () => ({
  useSearchQueries: (_index: unknown, readCount: number) => {
    encoded.readCount(readCount);
    return encoded.current;
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
    encoded.current = null;
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
  describe("with an index's encoded queries", () => {
    const EXTENSION_INDEX = {
      key: "emb_sim",
      patchesField: null,
      extension: "multimodal",
    };

    const setEncoded = (
      answer: Partial<NonNullable<typeof encoded.current>> = {},
    ) => {
      encoded.current = {
        queries: ["a robot arm", "a red cup"],
        freeText: false,
        loading: false,
        index: {
          datasetName: "robots",
          brainKey: "emb_sim",
          runTimestamp: null,
        },
        ...answer,
      };
    };

    const renderEncoded = (history: string[] = []) => {
      const onSubmit = vi.fn();
      render(
        <LanguageSearch
          onSubmit={onSubmit}
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
      return { onSubmit };
    };

    const type = (text: string) => {
      const field = screen.getByRole("combobox", {
        name: LANGUAGE_SEARCH_LABEL,
      });
      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: text } });
      return field;
    };

    const optionNames = () =>
      screen.queryAllByRole("option").map((option) => option.textContent);

    it("suggests matching encoded queries once three characters are typed", () => {
      setEncoded({ freeText: true });
      renderEncoded();
      type("ro");
      expect(optionNames()).toEqual([]);
      type("rob");
      expect(optionNames()).toEqual(["a robot arm"]);
    });

    it("does not suggest a query the history already offers", () => {
      setEncoded({ freeText: true });
      renderEncoded(["a robot arm"]);
      type("robot");
      expect(optionNames()).toEqual(["a robot arm"]);
    });

    it("searches free text when the index can encode it", () => {
      setEncoded({ freeText: true });
      renderEncoded();
      search("a green bowl");
      expect(extensionRun).toHaveBeenCalledWith(
        EXTENSION_INDEX,
        "a green bowl",
        25,
        null,
      );
    });

    it("refuses text that matches no encoded query", () => {
      setEncoded();
      renderEncoded();
      search("a green bowl");
      expect(extensionRun).not.toHaveBeenCalled();
    });

    it("takes the top encoded match on Enter", () => {
      setEncoded();
      renderEncoded();
      search("robot");
      expect(extensionRun).toHaveBeenCalledWith(
        EXTENSION_INDEX,
        "a robot arm",
        25,
        null,
      );
    });

    it("drops previous queries the index cannot search", () => {
      setEncoded();
      renderEncoded(["a red cup", "a green bowl"]);
      type("");
      expect(optionNames()).toEqual(["a red cup"]);
    });

    it("refuses anything while the encoded queries load", () => {
      setEncoded({ queries: [], freeText: false, loading: true });
      renderEncoded(["a red cup"]);
      search("a red cup");
      expect(extensionRun).not.toHaveBeenCalled();
    });

    it("reads the encoded queries again each time the list opens", () => {
      setEncoded();
      renderEncoded();
      const field = screen.getByRole("combobox", {
        name: LANGUAGE_SEARCH_LABEL,
      });
      const before = encoded.readCount.mock.lastCall?.[0];
      fireEvent.focus(field);
      expect(encoded.readCount.mock.lastCall?.[0]).toBe(before + 1);
    });

    const AddQueries = ({
      onClose,
      onAdded,
    }: {
      onClose: () => void;
      onAdded: () => void;
    }) => (
      <div role="dialog" aria-label="Add queries dialog">
        <button onClick={onAdded}>added</button>
        <button onClick={onClose}>close</button>
      </div>
    );

    it("offers adding queries after the matches, and opens the extension's flow", () => {
      setEncoded({ AddQueries });
      renderEncoded();
      type("robot");
      expect(optionNames()).toEqual(["a robot arm", "Add queries"]);
      fireEvent.mouseDown(screen.getByRole("option", { name: "Add queries" }));
      expect(
        screen.getByRole("dialog", { name: "Add queries dialog" }),
      ).toBeTruthy();
      expect(extensionRun).not.toHaveBeenCalled();
      expect(
        screen.getByRole<HTMLInputElement>("combobox", {
          name: LANGUAGE_SEARCH_LABEL,
        }).value,
      ).toBe("robot");
    });

    it("explains the refusal and offers adding queries when nothing matches", () => {
      setEncoded({ AddQueries });
      renderEncoded();
      type("a green bowl");
      expect(
        screen.getByText(
          "Only queries this index has already encoded can be searched.",
        ),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Add queries" }));
      expect(
        screen.getByRole("dialog", { name: "Add queries dialog" }),
      ).toBeTruthy();
    });

    it("reads the queries again once some are added, and closes the flow on request", () => {
      setEncoded({ AddQueries });
      renderEncoded();
      type("a green bowl");
      fireEvent.click(screen.getByRole("button", { name: "Add queries" }));
      const before = encoded.readCount.mock.lastCall?.[0];
      fireEvent.click(screen.getByRole("button", { name: "added" }));
      expect(encoded.readCount.mock.lastCall?.[0]).toBe(before + 1);
      fireEvent.click(screen.getByRole("button", { name: "close" }));
      expect(
        screen.queryByRole("dialog", { name: "Add queries dialog" }),
      ).toBeNull();
    });
  });
});
