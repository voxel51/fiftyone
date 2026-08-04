// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RAMPS } from "./colors";
import { SettingsMenu } from "./SettingsMenu";

afterEach(cleanup);

/** The menu with just the palette wired; returns the palette spy, since
 * that is what these cases are about */
function open(rampId: "blueOrange" | "coolWarm" | "viridis" = "blueOrange") {
  const onRampChange = vi.fn();
  render(<SettingsMenu rampId={rampId} onRampChange={onRampChange} />);
  fireEvent.click(screen.getByLabelText("Plot settings"));
  return onRampChange;
}

describe("SettingsMenu palette", () => {
  it("offers every ramp and reports the one picked", () => {
    const onRampChange = open();

    fireEvent.click(screen.getByText(RAMPS.viridis.label));
    expect(onRampChange).toHaveBeenCalledWith("viridis");
    // Every ramp is reachable — a ramp with no row is a palette nobody can
    // choose, whatever the data needs
    Object.values(RAMPS).forEach((ramp) => screen.getByText(ramp.label));
  });

  it("stays quiet when the active ramp is picked again", () => {
    const onRampChange = open("viridis");

    fireEvent.click(screen.getByText(RAMPS.viridis.label));
    expect(onRampChange).not.toHaveBeenCalled();
  });
});
