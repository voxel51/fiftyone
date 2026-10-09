import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const queries = {
  all: [] as unknown[],
  shown: [] as unknown[],
  loaded: null as string | null,
  canEdit: true,
  cannotEditReason: undefined,
  canSave: true,
  load: vi.fn(),
  clear: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  onEditSuccess: vi.fn(),
  onDeleteSuccess: vi.fn(),
};

vi.mock("./useSavedQueries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useSavedQueries")>()),
  default: () => queries,
}));
vi.mock("./ViewDialog", () => ({ default: () => null }));

import SavedQueriesMenu from "./SavedQueriesMenu";
import { kindOf, type SavedQuery } from "./useSavedQueries";

const stage = (cls: string, kwargs: [string, unknown][]) =>
  JSON.stringify({ _cls: `fiftyone.core.stages.${cls}`, kwargs });

const query = (name: string, viewStages: string[] = []) =>
  ({ id: name, name, slug: name, viewStages }) as unknown as SavedQuery;

const NIGHT = query("night", [stage("Match", [["filter", {}]])]);
const DOGS = query("dogs", [
  stage("SortBySimilarity", [
    ["query", "a dog"],
    ["k", 25],
  ]),
]);

const open = () =>
  fireEvent.click(screen.getByRole("button", { name: "Saved queries" }));

describe("SavedQueriesMenu", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    queries.loaded = null;
    queries.canSave = true;
    queries.all = queries.shown = [NIGHT, DOGS];
  });

  it("loads a saved query and closes", () => {
    queries.all = queries.shown = [NIGHT, DOGS];
    render(<SavedQueriesMenu />);
    open();
    fireEvent.click(screen.getByRole("option", { name: /dogs/ }));

    expect(queries.load).toHaveBeenCalledWith(DOGS);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("saves the current query", () => {
    render(<SavedQueriesMenu />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save query" }));

    expect(queries.create).toHaveBeenCalledOnce();
  });

  it("offers no save when there is nothing to save", () => {
    queries.canSave = false;
    render(<SavedQueriesMenu />);
    open();

    expect(
      (screen.getByRole("button", { name: "Save query" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("edits a saved query without loading it", () => {
    render(<SavedQueriesMenu />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit night" }));

    expect(queries.edit).toHaveBeenCalledWith(NIGHT);
    expect(queries.load).not.toHaveBeenCalled();
  });

  it("marks and clears the loaded query", () => {
    queries.loaded = "night";
    render(<SavedQueriesMenu />);
    open();

    expect(
      screen
        .getByRole("option", { name: /night/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Clear loaded query" }));
    expect(queries.clear).toHaveBeenCalledOnce();
  });

  it("closes when the header is hidden", () => {
    const { rerender } = render(<SavedQueriesMenu />);
    open();
    rerender(<SavedQueriesMenu hidden />);

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("tells a search apart from built stages", () => {
    expect(kindOf(DOGS)).toBe("search");
    expect(kindOf(NIGHT)).toBe("stages");
  });
});
