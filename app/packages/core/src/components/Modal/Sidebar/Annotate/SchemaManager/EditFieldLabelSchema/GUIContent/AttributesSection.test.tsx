/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import React from "react";
import { ThemeProvider } from "styled-components";
import { afterEach, describe, expect, it, vi } from "vitest";

const docMode = vi.hoisted(() => ({ current: null as unknown }));

// The app tags elements with `data-cy`.
configure({ testIdAttribute: "data-cy" });

/** Whether `a` comes before `b` in document order. */
const precedes = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

vi.mock("../../useSchemaDocs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../useSchemaDocs")>()),
  useManagerDocMode: () => docMode.current,
}));
vi.mock("@fiftyone/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/components")>()),
  useTheme: () => ({
    voxel: { 500: "#ff6d04" },
    primary: { softBorder: "#333333" },
  }),
}));

import AttributesSection from "./AttributesSection";

const attributes = [
  { name: "color", type: "str" },
  { name: "conf", type: "float" },
  { name: "size", type: "int" },
];

const withProtected = [{ name: "id", type: "str" }, ...attributes];

const renderSection = (
  props: Partial<React.ComponentProps<typeof AttributesSection>> = {},
) =>
  render(
    <ThemeProvider
      theme={{
        background: { level1: "#111111" },
        text: { secondary: "#999999" },
        primary: { plainColor: "#ff6d04" },
      }}
    >
      <AttributesSection
        attributes={attributes}
        field="gt"
        config={{ type: "detections", attributes }}
        onAddAttribute={vi.fn()}
        onEditAttribute={vi.fn()}
        onDeleteAttribute={vi.fn()}
        {...props}
      />
    </ThemeProvider>,
  );

describe("AttributesSection visibility sections", () => {
  afterEach(() => {
    cleanup();
    docMode.current = null;
  });

  it("custom schema: Active / Hidden with checkboxes, hidden tier honored", () => {
    docMode.current = {
      docId: "d1",
      doc: {
        id: "d1",
        name: "lens",
        label_schema: {},
        visibility: { fields: { gt: { attributes: { conf: "hidden" } } } },
      },
      setDoc: vi.fn(),
      api: {},
    };
    renderSection();
    const hiddenHeader = screen.getByText("Hidden");
    const color = screen.getByTestId("attribute-row-color");
    const conf = screen.getByTestId("attribute-row-conf");
    // color sits in Active (above the Hidden header); conf below it.
    expect(precedes(color, hiddenHeader)).toBe(true);
    expect(precedes(hiddenHeader, conf)).toBe(true);
    // Rows are selectable so the footer can move them.
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it("custom schema: the header select-all selects every active row", () => {
    docMode.current = {
      docId: "d1",
      doc: {
        id: "d1",
        name: "lens",
        label_schema: {},
        visibility: { fields: {} },
      },
      setDoc: vi.fn(),
      api: {},
    };
    renderSection();
    const selectAll = screen.getByTestId("select-all-active-attributes");
    expect(selectAll.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(selectAll);
    expect(selectAll.getAttribute("aria-checked")).toBe("true");
    // Both attribute rows (not the shape/label access rows) are selected.
    const rowBoxes = screen
      .getAllByRole("checkbox")
      .filter((el) => el !== selectAll);
    expect(
      rowBoxes.filter((el) => el.getAttribute("aria-checked") === "true"),
    ).toHaveLength(3);
    fireEvent.click(selectAll);
    expect(selectAll.getAttribute("aria-checked")).toBe("false");
  });

  it("custom schema: shift-click selects the range since the last click", () => {
    docMode.current = {
      docId: "d1",
      doc: {
        id: "d1",
        name: "lens",
        label_schema: {},
        visibility: { fields: {} },
      },
      setDoc: vi.fn(),
      api: {},
    };
    renderSection();
    const box = (name: string) =>
      within(screen.getByTestId(`attribute-row-${name}`)).getByRole("checkbox");
    fireEvent.mouseDown(box("color"));
    fireEvent.click(box("color"));
    fireEvent.mouseDown(box("size"), { shiftKey: true });
    fireEvent.click(box("size"));
    for (const name of ["color", "conf", "size"]) {
      expect(box(name).getAttribute("aria-checked")).toBe("true");
    }
  });

  it("custom schema: protected attributes stay active without a checkbox", () => {
    docMode.current = {
      docId: "d1",
      doc: {
        id: "d1",
        name: "lens",
        label_schema: {},
        // A stored hidden tier on `id` must be ignored.
        visibility: {
          fields: { gt: { attributes: { id: "hidden", conf: "hidden" } } },
        },
      },
      setDoc: vi.fn(),
      api: {},
    };
    renderSection({ attributes: withProtected });
    const hiddenHeader = screen.getByText("Hidden");
    const idRow = screen.getByTestId("attribute-row-id");
    expect(precedes(idRow, hiddenHeader)).toBe(true);
    expect(within(idRow).queryByRole("checkbox")).toBeNull();
    // ...and it sits after the hideable rows at the bottom of Active.
    expect(precedes(screen.getByTestId("attribute-row-size"), idRow)).toBe(
      true,
    );
    expect(
      precedes(hiddenHeader, screen.getByTestId("attribute-row-conf")),
    ).toBe(true);
  });

  it("custom schema: a doc without a visibility block still renders", () => {
    docMode.current = {
      docId: "d1",
      doc: { id: "d1", name: "lens", label_schema: {} },
      setDoc: vi.fn(),
      api: {},
    };
    renderSection();
    expect(screen.getByTestId("active-attributes").textContent).toContain(
      "conf",
    );
    expect(screen.queryByTestId("hidden-attributes")).toBeNull();
  });

  it("default schema: both sections, no checkboxes, custom-schema hint", () => {
    renderSection();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Hidden")).toBeTruthy();
    expect(screen.getByTestId("active-attributes").textContent).toContain(
      "color",
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByTestId("select-all-active-attributes")).toBeNull();
    expect(screen.getByText(/create a custom schema/i)).toBeTruthy();
  });
});
