import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EpisodeSettingsLabel } from "./EpisodeSettingsLabel";

describe("EpisodeSettingsLabel", () => {
  it("exposes help to pointer and keyboard users", () => {
    render(
      <EpisodeSettingsLabel
        label="Camera geometry"
        tooltip="Explains the camera geometry choice."
      />,
    );

    expect(screen.getByText("Camera geometry")).toBeTruthy();
    const help = screen.getByRole("img", {
      name: "Explains the camera geometry choice.",
    });
    expect(help.getAttribute("data-tooltip")).toBe(
      "Explains the camera geometry choice.",
    );
    expect(help.getAttribute("tabindex")).toBe("0");
  });
});
