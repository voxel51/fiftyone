import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CONTINUOUS_RAMPS } from "@fiftyone/utilities";
import { SettingsMenu } from "./SettingsMenu";

function open(props: Parameters<typeof SettingsMenu>[0] = {}) {
  render(<SettingsMenu {...props} />);
  fireEvent.click(screen.getByLabelText("Plot settings"));
}

describe("SettingsMenu", () => {
  it("offers every ramp and reports the one picked", () => {
    const onRampChange = vi.fn();
    open({ onRampChange });

    fireEvent.click(screen.getByText("Viridis"));
    expect(onRampChange).toHaveBeenCalledWith("viridis");
    // Every ramp is reachable — a ramp with no row is a palette nobody can
    // pick
    Object.values(CONTINUOUS_RAMPS).forEach((ramp) =>
      screen.getByText(ramp.label),
    );
  });

  it("stays quiet when the active ramp is picked again", () => {
    const onRampChange = vi.fn();
    open({ rampId: "viridis", onRampChange });

    fireEvent.click(screen.getByText("Viridis"));
    expect(onRampChange).not.toHaveBeenCalled();
  });

  it("names what a pick edits: the field, or the scheme default", () => {
    // Like the color settings modal, a ramp is pickable before anything
    // continuous is colored — the pick lands on the scheme's default
    open({ colorscaleTarget: null });
    screen.getByText("Color scheme default");
  });

  it("lets a contributed section dismiss the menu", () => {
    open({
      renderBefore: (close) => (
        <button type="button" onClick={close}>
          pick me
        </button>
      ),
      renderAfter: () => <span>after section</span>,
    });
    screen.getByText("after section");

    fireEvent.click(screen.getByText("pick me"));
    expect(screen.queryByText("after section")).toBeNull();
  });
});
