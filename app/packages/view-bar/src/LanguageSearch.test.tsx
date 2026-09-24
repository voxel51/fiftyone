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
vi.mock("./SearchSettingsPopover", () => ({
  SearchSettingsPopover: ({ trigger }: { trigger: React.ReactNode }) => (
    <>{trigger}</>
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
    expect(extensionRun).toHaveBeenCalledWith(index, "an animal", 25);
    expect(onSubmit).not.toHaveBeenCalled();
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
    expect(extensionRun).toHaveBeenCalledWith(index, "an animal", 25);
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
});
