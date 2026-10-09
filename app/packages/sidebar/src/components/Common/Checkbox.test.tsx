import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./CountSubcount", () => ({ SuspenseEntryCounts: () => null }));

import Checkbox from "./Checkbox";

const renderCheckbox = (props: { value: boolean; muted?: boolean }) => {
  const setValue = vi.fn();
  render(<Checkbox name="cat" setValue={setValue} {...props} />);
  return setValue;
};

describe("Checkbox", () => {
  afterEach(cleanup);

  it("toggles once from a click on the box", () => {
    const setValue = renderCheckbox({ value: false });
    fireEvent.click(screen.getByRole("checkbox"));

    expect(setValue.mock.calls).toEqual([[true]]);
  });

  it("toggles once from a click on the row", () => {
    const setValue = renderCheckbox({ value: true });
    fireEvent.click(screen.getByText("cat"));

    expect(setValue.mock.calls).toEqual([[false]]);
  });

  it("shows its value as the box's checked state", () => {
    renderCheckbox({ value: true });

    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("does not toggle when muted", () => {
    const setValue = renderCheckbox({ value: false, muted: true });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("cat"));

    expect(setValue).not.toHaveBeenCalled();
  });
});
