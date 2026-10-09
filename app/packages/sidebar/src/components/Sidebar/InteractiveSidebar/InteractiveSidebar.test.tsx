import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/state", () => ({
  EntryKind: {
    EMPTY: "EMPTY",
    GROUP: "GROUP",
    INPUT: "INPUT",
    PATH: "PATH",
  },
  useEventHandler: () => undefined,
}));

vi.mock("./useRegisterSidebarCommandHandlers", () => ({
  useRegisterSidebarCommandHandlers: () => undefined,
}));

import InteractiveSidebar from "./InteractiveSidebar";

const ROW_HEIGHT = 30;

const entries = [
  { kind: "GROUP", name: "metadata" },
  { kind: "PATH", path: "metadata.size_bytes", shown: true },
  { kind: "PATH", path: "metadata.width", shown: true },
];

const renderSidebar = () =>
  render(
    <InteractiveSidebar
      isDisabled={() => false}
      modal={false}
      render={(key) => ({ children: <div>{key}</div> })}
      useEntries={() => [entries as never, () => undefined]}
    />,
  );

describe("InteractiveSidebar", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: ROW_HEIGHT,
      width: 200,
    } as DOMRect);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lays entries out in the first committed render, before any frame", () => {
    const { container } = renderSidebar();

    const tops = [
      "sidebar-group-metadata-field",
      "metadata.size_bytes-field",
      "metadata.width-field",
    ].map(
      (dataCy) =>
        (container.querySelector(`[data-cy="${dataCy}"]`) as HTMLElement).style
          .top,
    );

    expect(tops).toEqual(["0px", "33px", "66px"]);
  });

  it("sizes each entry and the column to its content", () => {
    const { container } = renderSidebar();

    const row = container.querySelector(
      '[data-cy="metadata.width-field"]',
    ) as HTMLElement;
    expect(row.style.height).toBe(`${ROW_HEIGHT}px`);
    expect((row.parentElement as HTMLElement).style.minHeight).toBe(
      `${3 * (ROW_HEIGHT + 3) + 3}px`,
    );
  });
});
