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
  it("reports the picked field and closes", () => {
    const { onChange } = setup();
    fireEvent.click(control());

    fireEvent.click(screen.getByText("imu_signals.angular_velocity_norm_3"));

    expect(onChange).toHaveBeenCalledWith(
      "imu_signals.angular_velocity_norm_3",
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it.each([
    ["escape", () => fireEvent.keyDown(document, { key: "Escape" })],
    ["outside click", () => fireEvent.pointerDown(document.body)],
  ])("reopens after dismissing with %s", (_label, dismiss) => {
    setup();
    fireEvent.click(control());
    expect(screen.getByRole("menu")).toBeTruthy();

    dismiss();
    expect(screen.queryByRole("menu")).toBeNull();

    // The VOODO combobox this replaced opened on input focus, so a dismiss
    // that left focus on the input made the very next click a no-op
    fireEvent.click(control());
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("closes from the caret without picking anything", () => {
    const { onChange } = setup();
    fireEvent.click(control());

    fireEvent.click(screen.getByLabelText("Close color-by menu"));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("filters from the trigger itself and says so when nothing matches", () => {
    setup();
    fireEvent.click(control());
    // The trigger became the filter box; there is no separate input below it
    expect(control().tagName).toBe("INPUT");

    fireEvent.change(control(), { target: { value: "norm_1" } });
    // norm_1, norm_10, norm_11 — and none of the non-matching entries
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
    expect(screen.queryByText("sensor")).toBeNull();

    fireEvent.change(control(), { target: { value: "nothing-matches" } });
    expect(screen.queryAllByRole("menuitemradio")).toHaveLength(0);
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
    expect(screen.getAllByRole("menuitemradio").length).toBeGreaterThan(3);
  });

  it("marks only the selected field as checked", () => {
    setup(streamOptions(), "imu_signals.angular_velocity_norm_2");
    fireEvent.click(control());

    const checked = screen
      .getAllByRole("menuitemradio")
      .filter((el) => el.getAttribute("aria-checked") === "true");

    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toContain(
      "imu_signals.angular_velocity_norm_2",
    );
  });

  it("does not open when there is nothing to color by", () => {
    render(
      <ColorByMenu options={[]} value={NONE} onChange={vi.fn()} disabled />,
    );

    fireEvent.click(control());

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
