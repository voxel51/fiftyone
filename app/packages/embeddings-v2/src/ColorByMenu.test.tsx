// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorByMenu, type ColorByOption } from "./ColorByMenu";

afterEach(cleanup);

const NONE = "__none__";

/** The long dotted paths this control mostly lists in practice */
function streamOptions(count = 12): ColorByOption[] {
  return [
    { id: NONE, data: { label: "None" } },
    { id: "sensor", data: { label: "sensor" } },
    ...Array.from({ length: count }, (_, i) => ({
      id: `imu_signals.angular_velocity_norm_${i}`,
      data: { label: `imu_signals.angular_velocity_norm_${i}` },
    })),
  ];
}

/** Closed it is the button, open it is the filter input — both are the
 * "Color by" control, so always re-query rather than holding a reference */
const control = () => screen.getByLabelText("Color by");

function setup(options = streamOptions(), value = NONE) {
  const onChange = vi.fn();
  render(<ColorByMenu options={options} value={value} onChange={onChange} />);
  return { onChange };
}

describe("ColorByMenu", () => {
  it("reports the picked field on click and closes", () => {
    const { onChange } = setup();
    fireEvent.click(control());

    fireEvent.click(screen.getByText("imu_signals.angular_velocity_norm_3"));

    expect(onChange).toHaveBeenCalledWith(
      "imu_signals.angular_velocity_norm_3",
    );
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it.each([
    ["escape", () => fireEvent.keyDown(document, { key: "Escape" })],
    ["outside click", () => fireEvent.pointerDown(document.body)],
  ])("reopens after dismissing with %s", (_label, dismiss) => {
    setup();
    fireEvent.click(control());
    expect(screen.getByRole("listbox")).toBeTruthy();

    dismiss();
    expect(screen.queryByRole("listbox")).toBeNull();

    // The VOODO combobox this replaced opened on input focus, so a dismiss
    // that left focus on the input made the very next click a no-op
    fireEvent.click(control());
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("closes from the caret without picking anything", () => {
    const { onChange } = setup();
    fireEvent.click(control());

    fireEvent.click(screen.getByLabelText("Close color-by menu"));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("filters from the trigger itself and says so when nothing matches", () => {
    setup();
    fireEvent.click(control());
    // The trigger became the filter box; there is no separate input below it
    expect(control().tagName).toBe("INPUT");

    fireEvent.change(control(), { target: { value: "norm_1" } });
    // norm_1, norm_10, norm_11 — and none of the non-matching entries
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.queryByText("sensor")).toBeNull();

    fireEvent.change(control(), { target: { value: "nothing-matches" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No matching fields")).toBeTruthy();
  });

  it("keeps showing the selection while filtering, and restores it on close", () => {
    setup(streamOptions(), "imu_signals.angular_velocity_norm_2");
    fireEvent.click(control());

    expect(control().getAttribute("placeholder")).toBe(
      "imu_signals.angular_velocity_norm_2",
    );

    fireEvent.change(control(), { target: { value: "norm_5" } });
    fireEvent.keyDown(document, { key: "Escape" });

    // Query is dropped on close, so reopening does not resume a stale filter
    expect(control().textContent).toContain(
      "imu_signals.angular_velocity_norm_2",
    );
    fireEvent.click(control());
    expect(screen.getAllByRole("option").length).toBeGreaterThan(3);
  });

  it("marks only the selected field as picked", () => {
    setup(streamOptions(), "imu_signals.angular_velocity_norm_2");
    fireEvent.click(control());

    const picked = screen
      .getAllByRole("option")
      .filter((el) => el.getAttribute("data-selected") === "true");

    expect(picked).toHaveLength(1);
    expect(picked[0].textContent).toContain(
      "imu_signals.angular_velocity_norm_2",
    );
  });

  it.each([
    {
      name: "an incomplete list says so instead of reading as complete",
      loading: true,
      shown: true,
    },
    {
      name: "a settled list says nothing",
      loading: false,
      shown: false,
    },
  ])("$name", ({ loading, shown }) => {
    render(
      <ColorByMenu
        options={[{ id: NONE, data: { label: "None" } }]}
        value={NONE}
        onChange={vi.fn()}
        loading={loading}
      />,
    );
    fireEvent.click(control());

    expect(Boolean(screen.queryByText("Loading fields\u2026"))).toBe(shown);
  });

  it("says the list is still filling rather than that nothing matched", () => {
    // Both would be true of an empty filtered list, and only one of them
    // tells a reader to wait rather than give up
    render(
      <ColorByMenu options={[]} value={NONE} onChange={vi.fn()} loading />,
    );
    fireEvent.click(control());

    expect(screen.queryByText("No matching fields")).toBeNull();
    expect(screen.getByText("Loading fields\u2026")).toBeTruthy();
  });

  it("does not open when there is nothing to color by", () => {
    render(
      <ColorByMenu options={[]} value={NONE} onChange={vi.fn()} disabled />,
    );

    fireEvent.click(control());

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("moves the active option with arrow keys and exposes it via aria-activedescendant", () => {
    setup();
    fireEvent.click(control());

    const options = screen.getAllByRole("option");
    expect(control().getAttribute("aria-activedescendant")).toBe(options[0].id);

    fireEvent.keyDown(control(), { key: "ArrowDown" });
    expect(control().getAttribute("aria-activedescendant")).toBe(options[1].id);

    fireEvent.keyDown(control(), { key: "ArrowUp" });
    expect(control().getAttribute("aria-activedescendant")).toBe(options[0].id);
  });

  it("does not move the active option past either end of the list", () => {
    setup();
    fireEvent.click(control());

    fireEvent.keyDown(control(), { key: "ArrowUp" });
    expect(control().getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[0].id,
    );

    const last = screen.getAllByRole("option").at(-1);
    for (let i = 0; i < 20; i++) {
      fireEvent.keyDown(control(), { key: "ArrowDown" });
    }
    expect(control().getAttribute("aria-activedescendant")).toBe(last?.id);
  });

  it("picks the active option on Enter", () => {
    const { onChange } = setup();
    fireEvent.click(control());

    fireEvent.keyDown(control(), { key: "ArrowDown" });
    fireEvent.keyDown(control(), { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("sensor");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("resets the active option when the filter narrows the list", () => {
    setup();
    fireEvent.click(control());
    fireEvent.keyDown(control(), { key: "ArrowDown" });
    fireEvent.keyDown(control(), { key: "ArrowDown" });

    fireEvent.change(control(), { target: { value: "norm_5" } });

    expect(control().getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[0].id,
    );
  });
});
