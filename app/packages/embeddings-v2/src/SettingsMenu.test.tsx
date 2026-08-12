import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsMenu } from "./SettingsMenu";

describe("SettingsMenu", () => {
  it("renders nothing when no edition contributes a section", () => {
    render(<SettingsMenu />);
    expect(screen.queryByLabelText("Plot settings")).toBeNull();
  });

  it("shows contributed sections and lets one dismiss the menu", () => {
    render(
      <SettingsMenu
        renderBefore={(close) => (
          <button type="button" onClick={close}>
            pick me
          </button>
        )}
        renderAfter={() => <span>after section</span>}
      />,
    );
    fireEvent.click(screen.getByLabelText("Plot settings"));
    screen.getByText("after section");

    fireEvent.click(screen.getByText("pick me"));
    expect(screen.queryByText("after section")).toBeNull();
  });
});
