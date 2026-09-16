import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/state", () => ({ useViewChangePending: () => false }));
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
  afterEach(cleanup);

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
});
