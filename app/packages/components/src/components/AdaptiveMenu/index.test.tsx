import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdaptiveMenu, { type AdaptiveMenuItemComponentPropsType } from ".";
import { hideOverflowingNodes } from "./utils";

vi.mock("@fiftyone/state", () => ({
  escapeKeyHandlerIdsAtom: {},
  useKeyDown: vi.fn(),
}));
vi.mock("recoil", () => ({ useSetRecoilState: () => vi.fn() }));
vi.mock("react-sortablejs", () => ({
  ReactSortable: ({
    children,
    style,
  }: React.HTMLAttributes<HTMLDivElement>) => (
    <div style={style}>{children}</div>
  ),
}));
vi.mock("../PillButton", () => ({
  default: ({
    title,
    onClick,
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{title}</button>
  ),
}));
vi.mock("../PopoutButton", () => ({
  default: ({
    Button,
    open,
    children,
  }: React.PropsWithChildren<{
    Button: React.ReactNode;
    open: boolean;
  }>) => (
    <>
      {Button}
      {open && children}
    </>
  ),
}));

const observers = new Set<TestResizeObserver>();
class TestResizeObserver implements ResizeObserver {
  constructor(readonly callback: ResizeObserverCallback) {}
  observe() {
    observers.add(this);
  }
  unobserve() {
    observers.delete(this);
  }
  disconnect() {
    observers.delete(this);
  }
}

let containerWidth = 525;
const Item = (
  props: AdaptiveMenuItemComponentPropsType & { "data-item-id"?: string },
) => (
  <button data-item-id={props["data-item-id"]}>{props["data-item-id"]}</button>
);
const items = ["sidebar", "colors", "patches", "browse", "options"].map(
  (id) => ({ id, Component: Item }),
);
const operator = { id: "load_group_by", Component: Item };

function settleMeasurements() {
  act(() => {
    vi.advanceTimersByTime(100);
  });
}

function resize(width: number) {
  containerWidth = width;
  act(() => {
    for (const observer of observers) observer.callback([], observer);
    vi.advanceTimersByTime(100);
  });
}

describe("AdaptiveMenu asynchronous items", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    containerWidth = 525;
    // jsdom has no layout: supply fixed button widths and flex-row offsets,
    // while keeping the real overflow calculation and measurement lifecycle.
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.hasAttribute("data-itemid") ? containerWidth : 42;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.parentElement
          ? Array.from(this.parentElement.children).indexOf(this) * 50
          : 0;
      },
    );
  });

  afterEach(() => {
    cleanup();
    hideOverflowingNodes.cancel();
    observers.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("expands for late operators and shrinks on removal without a resize", () => {
    const { container, rerender } = render(
      <AdaptiveMenu id="actions" items={items} />,
    );
    resize(525);
    const row = container.querySelector('[data-itemid="actions"]')!
      .firstElementChild as HTMLElement;
    expect(row.style.width).toBe("242px");

    rerender(<AdaptiveMenu id="actions" items={[...items, operator]} />);
    settleMeasurements();
    expect(row.style.width).toBe("292px");
    expect(screen.queryByText("More items")).toBeNull();

    rerender(<AdaptiveMenu id="actions" items={items} />);
    settleMeasurements();
    expect(row.style.width).toBe("242px");
  });

  it("uses the updated items for overflow when resizing after operators arrive", () => {
    const { rerender } = render(<AdaptiveMenu id="actions" items={items} />);
    resize(525);
    rerender(<AdaptiveMenu id="actions" items={[...items, operator]} />);
    settleMeasurements();

    // Only the first button fits beside the overflow control.
    resize(100);
    fireEvent.click(screen.getByText("More items"));
    expect(screen.getAllByText("load_group_by")).toHaveLength(2);
    expect(screen.getAllByText("colors")).toHaveLength(2);
    expect(screen.getAllByText("sidebar")).toHaveLength(1);

    resize(525);
    expect(screen.queryByText("More items")).toBeNull();
  });

  it("puts late operators in the overflow menu when the row is already full", () => {
    const { rerender } = render(<AdaptiveMenu id="actions" items={items} />);
    resize(280);
    expect(screen.queryByText("More items")).toBeNull();

    rerender(<AdaptiveMenu id="actions" items={[...items, operator]} />);
    settleMeasurements();
    fireEvent.click(screen.getByText("More items"));
    expect(screen.getAllByText("load_group_by")).toHaveLength(2);
    expect(screen.getAllByText("options")).toHaveLength(2);
  });
});
