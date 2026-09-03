import { fireEvent, render } from "@testing-library/react";
import type { WidgetProps } from "@rjsf/utils";
import { describe, expect, it, vi } from "vitest";
import CheckboxesWidget from "./CheckboxesWidget";

const schema = {
  type: "array",
  items: { type: "string", enum: ["missing", "duplicated", "jitter"] },
};

const renderWidget = (value: unknown, onChange = vi.fn()) => {
  const { container } = render(
    <CheckboxesWidget
      {...({
        id: "glitch_kind",
        label: "glitch_kind",
        schema,
        value,
        onChange,
      } as unknown as WidgetProps)}
    />,
  );

  // The widget ids each headlessui control as `${id}-${value}`; that element
  // carries role="checkbox" and aria-checked.
  const box = (name: string) => {
    const el = container.querySelector<HTMLElement>(`#glitch_kind-${name}`);
    if (!el) throw new Error(`no checkbox for ${name}`);
    return el;
  };
  const isChecked = (name: string) =>
    box(name).getAttribute("aria-checked") === "true";

  return { onChange, box, isChecked };
};

describe("CheckboxesWidget", () => {
  it("renders every enum option unchecked when value is undefined", () => {
    const { isChecked } = renderWidget(undefined);
    expect(isChecked("missing")).toBe(false);
    expect(isChecked("duplicated")).toBe(false);
    expect(isChecked("jitter")).toBe(false);
  });

  it("checks the options present in value", () => {
    const { isChecked } = renderWidget(["jitter"]);
    expect(isChecked("jitter")).toBe(true);
    expect(isChecked("missing")).toBe(false);
  });

  it("toggling from a null value emits a one-element array instead of throwing", () => {
    // Regression: the annotate edit form writes an explicit `null` when a
    // conditional attribute is hidden. A destructuring default only covers
    // `undefined`, so `values.map` used to throw and the click was swallowed.
    const { onChange, box } = renderWidget(null);

    fireEvent.click(box("missing"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["missing"]);
  });

  it("adds and removes values preserving enum order", () => {
    const { onChange, box } = renderWidget(["jitter"]);

    fireEvent.click(box("missing"));
    expect(onChange).toHaveBeenLastCalledWith(["missing", "jitter"]);

    fireEvent.click(box("jitter"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
