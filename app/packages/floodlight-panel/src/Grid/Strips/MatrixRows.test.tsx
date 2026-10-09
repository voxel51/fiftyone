import type { ID, Show } from "@fiftyone/floodlight";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createOwnership, scopeRenderer } from "../../host/ownership";
import { createPageSource } from "../../host/pageSource";
import type { ValueCount } from "../categorical";
import type { CellSource } from "./cellSource";
import { StripsContext, type Strips } from "./context";
import { type Expander, ExpanderContext } from "./expansion";
import { createHScroll } from "./hscroll";
import { MatrixContext, type MatrixModel } from "./matrixContext";
import { keyOf } from "./matrixLayout";
import { createRowStore } from "./rowPages";
import MatrixRows from "./MatrixRows";

// Mirrors useRenderer over the looker cache; `shown` is the lookers held.
const cacheRenderer = () => {
  const lookers = new Map<string, HTMLElement>();
  const shown = new Set<string>();
  const createItem = vi.fn();
  const showItem: Show<number, unknown> = async ({ element, id }) => {
    const key = id.description;
    if (shown.has(key)) return 0;
    let looker = lookers.get(key);
    if (!looker) {
      createItem(key);
      looker = document.createElement("canvas");
      lookers.set(key, looker);
    }
    element.appendChild(looker);
    shown.add(key);
    return 0;
  };
  return {
    createItem,
    shown,
    renderer: {
      showItem,
      hideItem: ({ id }: { id: ID }) => shown.delete(id.description),
      detachItem: (id: ID) => {
        lookers.get(id.description)?.remove();
        shown.delete(id.description);
      },
    },
  };
};

const axis = (prefix: string): ValueCount[] =>
  Array.from({ length: 100 }, (_, i) => ({
    count: 20,
    label: `${prefix}${i}`,
    value: `${prefix}${i}`,
  }));

const ROWS = axis("r");
const COLS = axis("c");
const ROW_HEIGHT = 120;
const COL_WIDTH = 150;
// 8 columns in view
const TRACK = 8 * COL_WIDTH;

const cellSources = () => {
  const sources = new Map<string, CellSource>();
  return (row: ValueCount, col: ValueCount) => {
    const key = `${keyOf(row)}|${keyOf(col)}`;
    if (!sources.has(key)) {
      sources.set(
        key,
        createPageSource(async (page: number) => ({
          items: Array.from({ length: 20 }, (_, i) => ({
            aspectRatio: 1,
            data: {} as never,
            id: { description: `${row.label}:${col.label}:${i}` },
            key: page,
          })),
          next: null,
          previous: null,
        })) as CellSource,
      );
    }
    return sources.get(key)!;
  };
};

const EXPANDER: Expander = {
  collapse: () => undefined,
  expand: () => undefined,
  expanded: null,
  land: () => undefined,
  returned: () => undefined,
  returning: null,
};

const setup = () => {
  const fake = cacheRenderer();
  const strips = {
    hasItem: () => false,
    lastSizes: new Map(),
    ownership: createOwnership(),
    register: () => () => undefined,
    renderer: { current: fake.renderer },
    store: new WeakMap(),
  } as unknown as Strips;
  const scroll = createHScroll();
  const model: MatrixModel = {
    colField: "clip",
    cols: COLS,
    colWidth: COL_WIDTH,
    gutter: 14,
    rowField: "truth",
    rowHeadWidth: 120,
    rows: ROWS,
    scroll,
    sourceFor: cellSources(),
    trackWidth: TRACK,
  };
  const store = createRowStore();
  // stands in for the matrix's Floodlight instance, showing rows 0-5
  const floodlight = scopeRenderer(store.renderer, createOwnership());
  const showRow = (index: number) => {
    const tile = document.createElement("div");
    document.body.appendChild(tile);
    floodlight.showItem({
      dimensions: [120 + TRACK, ROW_HEIGHT],
      element: tile,
      id: { description: keyOf(ROWS[index]) },
      spotlight: undefined as never,
      zooming: false,
    });
  };
  for (let r = 0; r < 6; r++) showRow(r);

  render(
    <StripsContext.Provider value={strips}>
      <ExpanderContext.Provider value={EXPANDER}>
        <MatrixContext.Provider value={model}>
          <MatrixRows rows={ROWS} store={store} />
        </MatrixContext.Provider>
      </ExpanderContext.Provider>
    </StripsContext.Provider>,
  );

  return { fake, floodlight, scroll };
};

const cells = () => screen.queryAllByRole("button");
const rowHead = (index: number) => screen.getByTitle(`r${index} (20)`);

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("windowed matrix rows", () => {
  test("mounts only shown rows and the columns in view, lookers for visible cells", async () => {
    const { fake } = setup();

    expect(screen.getAllByTitle(/^r\d+ \(20\)$/)).toHaveLength(6);
    // 8 columns in view plus one of overscan on the right
    expect(cells()).toHaveLength(6 * 9);
    await waitFor(() => expect(fake.shown.size).toBe(6 * 8 * 5));
  });

  test("scrolling sideways swaps cells without remounting rows", async () => {
    const { fake, scroll } = setup();
    await waitFor(() => expect(fake.shown.size).toBe(240));
    const head = rowHead(0);
    const kept = screen.getByLabelText(/^truth r0 × clip c5,/);
    const created = fake.createItem.mock.calls.length;

    act(() => scroll.set(3 * COL_WIDTH));

    expect(rowHead(0)).toBe(head);
    expect(screen.getByLabelText(/^truth r0 × clip c5,/)).toBe(kept);
    expect(screen.queryByLabelText(/^truth r0 × clip c1,/)).toBeNull();
    // columns 2-11: 3-10 in view, one of overscan each side
    expect(cells()).toHaveLength(6 * 10);
    await waitFor(() => expect(fake.shown.size).toBe(6 * 8 * 5));
    // columns 8-10 come into view (8 was overscan, which holds no lookers)
    expect(fake.createItem.mock.calls.length - created).toBe(6 * 3 * 5);
  });

  test("a row Floodlight hides unmounts its cells and releases their lookers", async () => {
    const { fake, floodlight } = setup();
    await waitFor(() => expect(fake.shown.size).toBe(240));

    act(() => floodlight.hideItem({ id: { description: keyOf(ROWS[0]) } }));

    expect(screen.getAllByTitle(/^r\d+ \(20\)$/)).toHaveLength(5);
    expect(cells()).toHaveLength(5 * 9);
    expect(fake.shown.size).toBe(5 * 8 * 5);
  });
});
