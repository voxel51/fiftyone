// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RadioGroup from "../../Common/RadioGroup";
import {
  PanelCheckbox,
  PanelItem,
  PanelNumber,
  PanelSection,
  PanelTabs,
} from "./Panel";

const cy = (id: string) =>
  document.querySelector<HTMLElement>(`[data-cy="${id}"]`)!;

afterEach(cleanup);

describe("panel parts", () => {
  it("titles a section, linking to more on it", () => {
    render(
      <PanelSection href="https://docs" linkTitle="More" title="Grid">
        <div />
      </PanelSection>,
    );

    expect(screen.getByText("Grid")).toBeTruthy();
    expect(screen.getByTitle("More").getAttribute("href")).toBe("https://docs");
  });

  it("checks a box from its row, which holds the checkbox e2e reads", () => {
    const setValue = vi.fn();
    render(<PanelCheckbox name="Carousel" value setValue={setValue} />);

    const row = cy("checkbox-Carousel");
    const box = row.querySelector("[role=checkbox]")!;
    expect(box.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(box);
    expect(setValue).toHaveBeenCalledWith(false);
  });

  it("does not change a muted checkbox", () => {
    const setValue = vi.fn();
    render(<PanelCheckbox muted name="3D" value setValue={setValue} />);

    fireEvent.click(cy("checkbox-3D").querySelector("[role=checkbox]")!);
    expect(setValue).not.toHaveBeenCalled();
  });

  it("picks one of a few options by its hook", () => {
    const onClick = vi.fn();
    render(
      <PanelTabs
        active="slice"
        options={[
          { text: "slice", title: "View slice", onClick: vi.fn() },
          { text: "group", title: "View group", onClick },
        ]}
      />,
    );

    expect(
      screen.getByRole("tab", { name: "slice" }).getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.click(cy("tab-option-View group"));
    expect(onClick).toHaveBeenCalled();
  });

  it("picks one of a list by its hook", () => {
    const setValue = vi.fn();
    render(<RadioGroup choices={["a", "b"]} value="a" setValue={setValue} />);

    expect(
      cy("radio-button-a")
        .querySelector("[role=radio]")
        ?.getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(cy("radio-button-b").querySelector("[role=radio]")!);
    expect(setValue).toHaveBeenCalledWith("b");
  });

  it("sets a number on Enter, resets on empty, and drops anything else", () => {
    const onCommit = vi.fn();
    render(<PanelNumber unit="MB" value={5} onCommit={onCommit} />);
    const input = screen.getByRole("spinbutton");

    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenLastCalledWith(12);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith(null);
  });

  it("runs an item's action from its hook", () => {
    const onClick = vi.fn();
    render(<PanelItem text="Clear selected labels" onClick={onClick} />);

    fireEvent.click(cy("item-action-clear-selected-labels"));
    expect(onClick).toHaveBeenCalled();
  });
});
