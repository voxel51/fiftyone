/**
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The real package's index drags in relay modules the vitest run cannot
// transform, so the listbox is a faithful structural stub: a listbox
// container carrying the data-cy, with role=option rows named per option
vi.mock("@fiftyone/components", async () => {
  const { createElement } = await import("react");
  return {
    useAnchorRect: () => ({ top: 100, left: 100, width: 200 }),
    AnchoredListbox: (props: {
      "data-cy"?: string;
      options: string[];
      optionAriaLabel?: (option: string) => string;
      renderOption?: (option: string) => unknown;
      onPick: (option: string, index: number) => void;
    }) =>
      createElement(
        "div",
        { role: "listbox", "data-cy": props["data-cy"] },
        props.options.map((option, i) =>
          createElement(
            "div",
            {
              key: option,
              role: "option",
              "aria-label": props.optionAriaLabel?.(option) ?? option,
              onClick: () => props.onPick(option, i),
            },
            (props.renderOption?.(option) as never) ?? option,
          ),
        ),
      ),
  };
});

// Breaks the relay import chain — the vitest run has no relay babel transform
vi.mock("@fiftyone/state", () => {
  const DEFAULT_COLOR = "#667085";
  const COLOR_OPTIONS_MAP = {
    [DEFAULT_COLOR]: { id: "gray", label: "Gray", color: DEFAULT_COLOR },
    "#7A5AF8": { id: "purple", label: "Purple", color: "#7A5AF8" },
  };
  return {
    constants: {
      COLOR_OPTIONS: Object.values(COLOR_OPTIONS_MAP),
      COLOR_OPTIONS_MAP,
      DEFAULT_COLOR,
      DEFAULT_COLOR_OPTION: COLOR_OPTIONS_MAP[DEFAULT_COLOR],
    },
    view: "view",
    useSavedViews: () => ({}),
  };
});

vi.mock("@fiftyone/utilities", () => ({ toSlug: (v: string) => v }));

import { COLOR_SELECT_TEST_EXPORT as ColorSelect } from "./ViewDialog";

describe("ViewDialog color select", () => {
  it("serves the e2e POM's selector chain", () => {
    render(
      <ColorSelect
        id="saved-views-input-color-selection"
        selected={{ id: "gray", label: "Gray", color: "#667085" }}
        onSelect={() => undefined}
      />,
    );

    // POM: colorInputContainer().getByText("Gray") then click
    const trigger = document.querySelector(
      '[data-cy="saved-views-input-color-selection-selection"]',
    ) as HTMLElement;
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger);

    // POM: page.getByTestId("...-selection-view").filter({hasText: "Gray"})
    const popout = document.querySelector(
      '[data-cy="saved-views-input-color-selection-selection-view"]',
    ) as HTMLElement;
    expect(popout).toBeTruthy();
    expect(popout.textContent).toContain("Gray");

    // POM: getByRole("option", { name: "Purple", exact: true })
    const purple = screen.getByRole("option", { name: "Purple" });
    expect(popout.contains(purple)).toBe(true);
  });
});
