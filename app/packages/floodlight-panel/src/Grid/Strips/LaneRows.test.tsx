import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SETTLE } from "../../host/createHost";
import { createOwnership } from "../../host/ownership";
import type { ValueCount } from "../categorical";
import { type LaneHeights, setLaneHeight } from "../laneHeights";
import { StripsContext, type Strips } from "./context";
import LaneRows from "./LaneRows";

const built = vi.hoisted(
  () => [] as { destroy: () => void; destroyed: boolean; lane: string }[],
);

vi.mock("@fiftyone/floodlight", () => ({
  default: class extends EventTarget {
    destroyed = false;
    lane = "";
    attach(slot: HTMLElement) {
      this.lane =
        slot.closest("[data-cy=lane]")?.querySelector("span")?.textContent ??
        "";
      built.push(this);
      queueMicrotask(() => this.dispatchEvent(new Event("load")));
    }
    destroy() {
      this.destroyed = true;
    }
    updateItems() {}
  },
}));
vi.mock("../samplePages", () => ({
  createPageGetter: () => async () => ({
    items: [],
    next: null,
    previous: null,
  }),
  routeWheel: () => () => undefined,
}));
vi.mock("../useSpotlightPager", () => ({ PAGE_SIZE: 20 }));

// createHost observes each strip's host element; `resize` plays layout
const observed = new Map<Element, ResizeObserverCallback>();
const resize = (lane: string, height: number) => {
  for (const [element, callback] of observed) {
    const label = element.closest("[data-cy=lane]")?.querySelector("span");
    if (label?.textContent !== lane) continue;
    callback(
      [{ contentRect: { height, width: 800 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(element: Element) {
        observed.set(element, this.callback);
      }
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe() {
        this.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      }
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  observed.clear();
  built.length = 0;
});

// each call hands out a new `variables` factory for the same query
const strips = (root: HTMLElement) =>
  ({
    cache: { freeze: () => undefined, unfreeze: () => undefined },
    hasItem: () => false,
    lastSizes: new Map(),
    limit: (task: () => unknown) => task(),
    ownership: createOwnership(),
    records: new Map(),
    register: () => () => undefined,
    renderer: {
      current: {
        detachItem: () => undefined,
        hideItem: () => undefined,
        showItem: async () => 0,
      },
    },
    reset: "reset",
    root,
    spacing: 4,
    store: new WeakMap(),
    variables: (matches: unknown) => (page: number, pageSize: number) =>
      ({ matches, page, pageSize }) as never,
  }) as unknown as Strips;

const lanes = (counts: [string, number][]): ValueCount[] =>
  counts.map(([value, count]) => ({ count, label: value, value }));

const Harness = ({
  context,
  values,
}: {
  context: Strips;
  values: ValueCount[];
}) => {
  const [heights, setHeights] = useState<LaneHeights>({});
  return (
    <StripsContext.Provider value={context}>
      <LaneRows
        defaultHeight={96}
        heights={heights}
        onResize={(key, height) =>
          setHeights((current) => setLaneHeight(current, key, height))
        }
        path="label"
        values={values}
      />
    </StripsContext.Provider>
  );
};

const flush = () => act(async () => undefined);
const builds = (lane: string) => built.filter((b) => b.lane === lane);

const setup = async () => {
  const context = strips(document.createElement("div"));
  const view = render(
    <Harness
      context={context}
      values={lanes([
        ["cat", 5],
        ["dog", 3],
      ])}
    />,
  );
  await flush();
  return { context, view };
};

describe("LaneRows", () => {
  test("builds each strip once across first-load settling and reordering", async () => {
    const { context, view } = await setup();

    // layout settles, the list hides under a suspense and reappears
    for (const height of [96, 96, 0, 96]) {
      act(() => {
        resize("cat", height);
        resize("dog", height);
      });
    }
    await act(async () => vi.advanceTimersByTime(SETTLE * 4));

    // counts resolve into a new order, with a new but equal query factory
    view.rerender(
      <Harness
        context={{ ...context, variables: strips(context.root!).variables }}
        values={lanes([
          ["dog", 9],
          ["cat", 5],
        ])}
      />,
    );
    await act(async () => vi.advanceTimersByTime(SETTLE * 4));

    expect(built.map((b) => b.lane).sort()).toEqual(["cat", "dog"]);
    expect(built.map((b) => b.destroyed)).toEqual([false, false]);
    expect(
      screen.getAllByText(/^(cat|dog)$/).map((e) => e.textContent),
    ).toEqual(["dog", "cat"]);
  });

  test("releasing a lane's handle rebuilds only that lane", async () => {
    await setup();
    act(() => {
      resize("cat", 96);
      resize("dog", 96);
    });

    const [catHandle] = screen.getAllByRole("separator");
    act(() => {
      catHandle.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0, clientY: 0 }),
      );
      catHandle.dispatchEvent(
        new MouseEvent("pointermove", { bubbles: true, clientY: 104 }),
      );
    });
    // nothing re-lays out mid-drag
    const tracks = () =>
      screen
        .getAllByRole("separator")
        .map(
          (h) =>
            (h.previousElementSibling!.firstChild as HTMLElement).style.height,
        );
    expect(tracks()).toEqual(["96px", "96px"]);

    act(() => {
      catHandle.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientY: 104 }),
      );
    });
    expect(tracks()).toEqual(["200px", "96px"]);

    // the new height reaches the strip's host as a cross-axis resize
    act(() => resize("cat", 200));
    await flush();
    await act(async () => vi.advanceTimersByTime(SETTLE));
    await flush();

    const cat = builds("cat");
    const dog = builds("dog");
    // the first build, then the resize's interim and settled builds
    expect(cat.length).toBe(3);
    expect(cat.map((b) => b.destroyed)).toEqual([true, true, false]);
    expect(dog.length).toBe(1);
    expect(dog[0].destroyed).toBe(false);
  });

  test("double-clicking a handle resets that lane to the default height", async () => {
    await setup();
    const [catHandle] = screen.getAllByRole("separator");
    act(() => {
      catHandle.focus();
      catHandle.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
      catHandle.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });
    expect(catHandle.getAttribute("aria-valuenow")).toBe("112");

    act(() => {
      catHandle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(catHandle.getAttribute("aria-valuenow")).toBe("96");
  });
});
