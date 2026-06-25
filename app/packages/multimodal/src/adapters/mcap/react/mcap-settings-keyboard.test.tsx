import { cleanup, fireEvent, render } from "@testing-library/react";
import { Checkbox } from "@voxel51/voodo";
import { useState, type KeyboardEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkboxNoSpaceToggleProps,
  preventSettingsCheckboxSpaceToggle,
} from "./mcap-settings-keyboard";

function keyboardEvent(key: string, code?: string): KeyboardEvent<HTMLElement> {
  return {
    code,
    key,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLElement>;
}

describe("preventSettingsCheckboxSpaceToggle", () => {
  it("prevents space key checkbox activation", () => {
    const event = keyboardEvent(" ");
    preventSettingsCheckboxSpaceToggle(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("handles legacy and code-based space events", () => {
    const legacyEvent = keyboardEvent("Spacebar");
    const codeEvent = keyboardEvent("Unidentified", "Space");

    preventSettingsCheckboxSpaceToggle(legacyEvent);
    preventSettingsCheckboxSpaceToggle(codeEvent);

    expect(legacyEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(codeEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("leaves non-space keys alone", () => {
    const event = keyboardEvent("Enter");
    preventSettingsCheckboxSpaceToggle(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

// Integration: the predicate above is only correct if cancelling the event on
// a real voodo Checkbox actually suppresses its Space-toggle. These render a
// live Checkbox and assert the end-to-end behavior.
describe("checkboxNoSpaceToggleProps on a voodo Checkbox", () => {
  afterEach(() => cleanup());

  function renderCheckbox(extraProps: Record<string, unknown>) {
    const onChange = vi.fn();
    const { getByRole } = render(
      <Checkbox
        label="option"
        checked={false}
        onChange={onChange}
        {...extraProps}
      />,
    );
    const checkbox = getByRole("checkbox");
    checkbox.focus();
    return { checkbox, onChange };
  }

  function StatefulCheckbox({
    extraProps,
  }: {
    readonly extraProps: Record<string, unknown>;
  }) {
    const [checked, setChecked] = useState(false);
    return (
      <Checkbox
        label="option"
        checked={checked}
        onChange={setChecked}
        {...extraProps}
      />
    );
  }

  function renderStatefulCheckbox(extraProps: Record<string, unknown>) {
    const { getByRole } = render(<StatefulCheckbox extraProps={extraProps} />);
    const checkbox = getByRole("checkbox");
    checkbox.focus();
    return { checkbox };
  }

  function pressSpace(el: HTMLElement) {
    fireEvent.keyDown(el, { key: " ", code: "Space" });
    fireEvent.keyUp(el, { key: " ", code: "Space" });
  }

  function pressEnter(el: HTMLElement) {
    fireEvent.keyDown(el, { key: "Enter", code: "Enter" });
    fireEvent.keyUp(el, { key: "Enter", code: "Enter" });
  }

  // Control: proves the test reproduces voodo's Space-to-toggle, so the guard
  // assertion below can't pass for the wrong reason.
  it("toggles on Space without the guard props", () => {
    const { checkbox, onChange } = renderCheckbox({});
    pressSpace(checkbox);
    expect(onChange).toHaveBeenCalled();
  });

  it("does not toggle on Space with the guard props", () => {
    const { checkbox, onChange } = renderCheckbox(checkboxNoSpaceToggleProps);
    pressSpace(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still toggles on pointer click with the guard props", () => {
    const { checkbox, onChange } = renderCheckbox(checkboxNoSpaceToggleProps);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalled();
  });

  it("still toggles on Enter with the guard props", () => {
    const { checkbox } = renderStatefulCheckbox(checkboxNoSpaceToggleProps);
    expect(checkbox.getAttribute("aria-checked")).toBe("false");

    pressEnter(checkbox);

    expect(checkbox.getAttribute("aria-checked")).toBe("true");
  });
});
