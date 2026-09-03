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

const renderSearch = (props: { available: boolean; enabled: boolean }) => {
  const onUnavailable = vi.fn();
  const onOpenPanel = vi.fn();
  render(
    <LanguageSearch
      onSubmit={noop}
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
  return { onUnavailable, onOpenPanel };
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

  it("offers to configure an index when the operator exists but no index does", () => {
    const { onUnavailable, onOpenPanel } = renderSearch({
      available: true,
      enabled: false,
    });
    fireEvent.focus(
      screen.getByRole("combobox", { name: LANGUAGE_SEARCH_LABEL }),
    );
    expect(onUnavailable).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Configure similarity search" }),
    );
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
  });

  it("offers previous queries when search is possible", () => {
    renderSearch({ available: true, enabled: true });
    fireEvent.focus(
      screen.getByRole("combobox", { name: LANGUAGE_SEARCH_LABEL }),
    );
    expect(screen.getByRole("option", { name: "cats" })).toBeTruthy();
  });
});
