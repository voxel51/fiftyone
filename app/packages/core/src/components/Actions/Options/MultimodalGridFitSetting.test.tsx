import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
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

vi.mock("recoil", () => ({
  useRecoilState: () => [harness.fit, harness.setFit],
  useRecoilValue: () => harness.isMultimodal,
}));

vi.mock("@fiftyone/components", () => ({
  PopoutSectionTitle: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  TabOption: ({
    active,
    options,
  }: {
    active: string;
    options: Array<{
      onClick: () => void;
      text: string;
      title: string;
    }>;
  }) => (
    <div data-active={active} data-testid="fit-options">
      {options.map((option) => (
        <button
          key={option.text}
          onClick={option.onClick}
          title={option.title}
          type="button"
        >
          {option.text}
        </button>
      ))}
    </div>
  ),
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

    expect(screen.getByTestId("fit-options").dataset.active).toBe("cover");
    fireEvent.click(screen.getByRole("button", { name: "contain" }));
    expect(harness.setFit).toHaveBeenCalledWith("contain");
  });
});
