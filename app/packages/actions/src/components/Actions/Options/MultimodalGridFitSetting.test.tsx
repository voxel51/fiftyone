import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MultimodalGridFitSetting from "./MultimodalGridFitSetting";

const harness = vi.hoisted(() => ({
  fit: "cover" as "contain" | "cover",
  isMultimodal: false,
  setFit: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  isMultimodalDataset: Symbol("isMultimodalDataset"),
  multimodalGridFit: Symbol("multimodalGridFit"),
}));

vi.mock("@fiftyone/reverb", () => ({
  useReverbState: () => [harness.fit, harness.setFit],
  useReverbValue: () => harness.isMultimodal,
}));

afterEach(() => {
  harness.fit = "cover";
  harness.isMultimodal = false;
  harness.setFit.mockClear();
});

describe("MultimodalGridFitSetting", () => {
  it("stays hidden for non-multimodal datasets", () => {
    render(<MultimodalGridFitSetting />);

    expect(screen.queryByText("Multimodal media fit")).toBeNull();
  });

  it("defaults to cover and allows contain for multimodal datasets", () => {
    harness.isMultimodal = true;

    render(<MultimodalGridFitSetting />);

    expect(
      screen.getByRole("tab", { name: "cover" }).getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.click(
      document.querySelector("[data-cy=multimodal-grid-fit-contain]")!,
    );
    expect(harness.setFit).toHaveBeenCalledWith("contain");
  });
});
