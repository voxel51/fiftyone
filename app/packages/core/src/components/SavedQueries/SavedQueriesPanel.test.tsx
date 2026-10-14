import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { SavedQuery } from "./model";
import SavedQueriesPanel from "./SavedQueriesPanel";

const QUERIES: SavedQuery[] = [
  {
    id: "1",
    name: "Night scenes",
    slug: "night-scenes",
    description: "Pedestrians after dark",
    color: "#2970FF",
    viewStages: ["{}"],
  },
  {
    id: "2",
    name: "Picked",
    slug: "picked",
    description: null,
    color: "#123456",
    viewStages: ["{}"],
  },
];

const mocks = vi.hoisted(() => ({
  queries: [] as SavedQuery[],
  loaded: null as SavedQuery | null,
  canEdit: true,
  stages: 2,
  filters: true,
  selectionSize: 0,
  selectionSections: 1,
  selectionSavable: true,
  scope: null as { saved: boolean } | null,
  create: vi.fn(),
  load: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  constants: {
    DEFAULT_COLOR: "#667085",
    COLOR_OPTIONS: [
      { id: "gray", label: "Gray", color: "#667085", description: "" },
      { id: "blue", label: "Blue", color: "#2970FF", description: "" },
      { id: "cyan", label: "Cyan", color: "#06AED4", description: "" },
    ],
  },
}));

vi.mock("./useSavedQueries", () => ({
  useSavedQueries: () => ({
    queries: mocks.queries,
    loaded: mocks.loaded,
    loadedName: mocks.loaded?.name ?? null,
    refresh: vi.fn(),
  }),
  useSavedQueryPermissions: () => ({
    canEdit: mocks.canEdit,
    editDisabledReason: "Saving queries requires dataset edit permission",
    locked: false,
  }),
  useSaveQueryDefinition: (include: boolean) => ({
    parts: {
      stages: mocks.stages,
      filters: mocks.filters,
      sort: false,
      similarity: false,
      fieldVisibility: false,
      resultSelection: false,
      selectedSamples:
        include && mocks.selectionSavable ? mocks.selectionSize : 0,
      selectionUnit: { one: "sample", many: "samples" },
    },
    selectionSize: mocks.selectionSize,
    selectionSections: mocks.selectionSections,
    selectionSavable: mocks.selectionSavable,
    selectionUnit: { one: "sample", many: "samples", temporal: false },
  }),
  useSaveQueryScope: () => mocks.scope,
  useCreateSavedQuery: () => ({ create: mocks.create, creating: false }),
  useLoadSavedQuery: () => mocks.load,
  useEditSavedQuery: () => ({ edit: mocks.edit, editing: false }),
  useDeleteSavedQuery: () => ({ remove: mocks.remove, deleting: false }),
}));

configure({ testIdAttribute: "data-cy" });
afterAll(() => configure({ testIdAttribute: "data-testid" }));

const onClose = vi.fn();

beforeEach(() => {
  mocks.queries = QUERIES;
  mocks.loaded = null;
  mocks.canEdit = true;
  mocks.stages = 2;
  mocks.filters = true;
  mocks.selectionSize = 0;
  mocks.selectionSections = 1;
  mocks.selectionSavable = true;
  mocks.scope = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const nameInput = () => screen.getByTestId("saved-queries-name-input");
const saveButton = () =>
  screen.getByTestId("saved-queries-save") as HTMLButtonElement;

describe("saving", () => {
  it("summarizes what the save captures and saves without the selection", () => {
    mocks.selectionSize = 3;
    render(<SavedQueriesPanel onClose={onClose} />);

    expect(screen.getByTestId("saved-queries-definition").textContent).toBe(
      "2 stages · filters",
    );
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(nameInput(), { target: { value: "Dusk" } });
    fireEvent.click(saveButton());

    // Blue is taken by a listed query, so the new one starts in cyan
    expect(mocks.create).toHaveBeenCalledWith(
      { name: "Dusk", description: "", color: "#06AED4" },
      false,
      { onSuccess: expect.any(Function), onError: expect.any(Function) },
    );
  });

  it("saves a description and the color picked from the ribbon", () => {
    render(<SavedQueriesPanel onClose={onClose} />);

    expect(screen.getByLabelText("Color: Cyan")).toBeTruthy();
    fireEvent.click(screen.getByTestId("saved-queries-color"));
    fireEvent.click(screen.getByTestId("saved-query-color-blue"));
    expect(screen.getByLabelText("Color: Blue")).toBeTruthy();

    fireEvent.change(nameInput(), { target: { value: "Dusk" } });
    fireEvent.change(screen.getByTestId("saved-queries-description-input"), {
      target: { value: "Low light" },
    });
    fireEvent.click(saveButton());

    expect(mocks.create.mock.calls[0][0]).toEqual({
      name: "Dusk",
      description: "Low light",
      color: "#2970FF",
    });
  });

  it("offers no save for the bare dataset", () => {
    mocks.stages = 0;
    mocks.filters = false;
    render(<SavedQueriesPanel onClose={onClose} />);

    expect(screen.queryByTestId("saved-queries-save-form")).toBeNull();
    expect(screen.getByTestId("saved-queries-nothing").textContent).toContain(
      "Nothing to save yet",
    );
  });

  it("saves the bare dataset only once limited to the selection", () => {
    mocks.stages = 0;
    mocks.filters = false;
    mocks.selectionSize = 2;
    render(<SavedQueriesPanel onClose={onClose} />);

    fireEvent.change(nameInput(), { target: { value: "Pair" } });
    expect(saveButton().disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Limit to the 2 selected samples"));
    expect(saveButton().disabled).toBe(false);
  });

  it("limits to the picks of every section", () => {
    mocks.selectionSize = 3;
    mocks.selectionSections = 2;
    render(<SavedQueriesPanel onClose={onClose} />);

    expect(
      screen.getByLabelText(
        "Limit to the 3 samples selected across 2 sections",
      ),
    ).toBeTruthy();
  });

  it("includes the tray selection only when the user opts in", () => {
    mocks.selectionSize = 3;
    render(<SavedQueriesPanel onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("Limit to the 3 selected samples"));
    expect(screen.getByTestId("saved-queries-definition").textContent).toBe(
      "2 stages · filters · 3 selected samples",
    );

    fireEvent.change(nameInput(), { target: { value: "Dusk" } });
    fireEvent.click(saveButton());
    expect(mocks.create.mock.calls[0][1]).toBe(true);
  });

  it("never offers a selection whose IDs are regenerated", () => {
    mocks.selectionSize = 3;
    mocks.selectionSavable = false;
    render(<SavedQueriesPanel onClose={onClose} />);

    expect(screen.queryByTestId("saved-queries-include-selection")).toBeNull();
    expect(screen.getByText(/selection isn.t saved/)).toBeTruthy();
  });

  it("offers no save for a loaded query with nothing added", () => {
    mocks.loaded = QUERIES[0];
    mocks.filters = false;
    render(<SavedQueriesPanel onClose={onClose} />);

    expect(screen.queryByTestId("saved-queries-save-form")).toBeNull();
    expect(screen.getByTestId("saved-query-loaded")).toBeTruthy();
  });

  it("saves a loaded query again only with the selection added", () => {
    mocks.loaded = QUERIES[0];
    mocks.filters = false;
    mocks.selectionSize = 2;
    render(<SavedQueriesPanel onClose={onClose} />);

    fireEvent.change(nameInput(), { target: { value: "Night picks" } });
    expect(screen.getByTestId("saved-queries-definition").textContent).toBe(
      "Same as “Night scenes”. Include the selection to save a new query.",
    );
    expect(saveButton().disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Limit to the 2 selected samples"));
    expect(screen.getByTestId("saved-queries-definition").textContent).toBe(
      "2 stages · 2 selected samples",
    );
    fireEvent.click(saveButton());
    expect(mocks.create.mock.calls[0].slice(0, 2)).toEqual([
      expect.objectContaining({ name: "Night picks" }),
      true,
    ]);
  });

  it("blocks a name another query's slug already uses", () => {
    render(<SavedQueriesPanel onClose={onClose} />);

    fireEvent.change(nameInput(), { target: { value: "night SCENES" } });

    expect(screen.getByTestId("saved-queries-name-error").textContent).toBe(
      "“Night scenes” already uses this name",
    );
    expect(saveButton().disabled).toBe(true);
  });

  it("shows a failed save without clearing the name", () => {
    mocks.create.mockImplementation((_draft, _include, callbacks) =>
      callbacks.onError(new Error("Saved view 'Dusk' already exists")),
    );
    render(<SavedQueriesPanel onClose={onClose} />);

    fireEvent.change(nameInput(), { target: { value: "Dusk" } });
    fireEvent.click(saveButton());

    expect(screen.getByRole("alert").textContent).toContain(
      "Saved view 'Dusk' already exists",
    );
    expect((nameInput() as HTMLInputElement).value).toBe("Dusk");
  });

  it("says when an open subset is not part of the saved query", () => {
    mocks.scope = { saved: false };
    render(<SavedQueriesPanel onClose={onClose} />);

    expect(screen.getByText("The open subset isn’t saved")).toBeTruthy();
  });

  it("only lists queries for viewers who cannot save", () => {
    mocks.canEdit = false;
    render(<SavedQueriesPanel onClose={onClose} />);

    expect(screen.queryByTestId("saved-queries-save-form")).toBeNull();
    expect(
      screen.getByText("Saving queries requires dataset edit permission"),
    ).toBeTruthy();
    expect(screen.queryByTestId("saved-query-picked-edit")).toBeNull();
    expect(screen.queryByTestId("saved-query-picked-delete")).toBeNull();

    fireEvent.click(screen.getByTestId("saved-query-picked-load"));
    expect(mocks.load).toHaveBeenCalledWith(QUERIES[1]);
  });
});

describe("the list", () => {
  it("loads a query and closes, and leaves the loaded one as it is", () => {
    mocks.loaded = QUERIES[0];
    render(<SavedQueriesPanel onClose={onClose} />);

    expect(screen.getByTestId("saved-query-loaded")).toBeTruthy();
    fireEvent.click(screen.getByTestId("saved-query-night-scenes-load"));
    expect(mocks.load).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("saved-query-picked-load"));
    expect(mocks.load).toHaveBeenCalledWith(QUERIES[1]);
  });

  it("shows the empty state", () => {
    mocks.queries = [];
    render(<SavedQueriesPanel onClose={onClose} />);

    expect(screen.getByTestId("saved-queries-empty").textContent).toBe(
      "No saved queries yet",
    );
  });

  it("deletes only after confirming", () => {
    render(<SavedQueriesPanel onClose={onClose} />);

    fireEvent.click(screen.getByTestId("saved-query-picked-delete"));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(
      screen.getByText("Subsets saved from its results are kept."),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("saved-query-picked-confirm-delete"));
    expect(mocks.remove).toHaveBeenCalledWith(QUERIES[1], {
      onError: expect.any(Function),
    });
  });

  it("searches once the list is long", () => {
    mocks.queries = Array.from({ length: 8 }, (_, i) => ({
      ...QUERIES[0],
      id: String(i),
      name: `Query ${i}`,
      slug: `query-${i}`,
      description: i === 5 ? "the odd one" : null,
    }));
    render(<SavedQueriesPanel onClose={onClose} />);

    fireEvent.change(screen.getByTestId("saved-queries-search"), {
      target: { value: "odd" },
    });
    expect(screen.getByTestId("saved-query-query-5")).toBeTruthy();
    expect(screen.queryByTestId("saved-query-query-4")).toBeNull();
  });
});

describe("editing", () => {
  it("keeps an SDK color it does not know and submits only metadata", () => {
    render(<SavedQueriesPanel onClose={onClose} />);
    fireEvent.click(screen.getByTestId("saved-query-picked-edit"));

    const save = screen.getByTestId(
      "saved-query-edit-save",
    ) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(
      screen
        .getByTestId("saved-query-color-current")
        .getAttribute("aria-checked"),
    ).toBe("true");

    fireEvent.change(screen.getByTestId("saved-query-edit-description"), {
      target: { value: "From the SDK" },
    });
    fireEvent.click(save);

    expect(mocks.edit).toHaveBeenCalledWith(
      QUERIES[1],
      { name: "Picked", description: "From the SDK", color: "#123456" },
      { onSuccess: expect.any(Function), onError: expect.any(Function) },
    );
  });

  it("returns to the list", () => {
    render(<SavedQueriesPanel onClose={onClose} />);
    fireEvent.click(screen.getByTestId("saved-query-picked-edit"));
    fireEvent.click(screen.getByLabelText("Back to saved queries"));

    expect(screen.getByTestId("saved-queries-panel")).toBeTruthy();
  });
});
