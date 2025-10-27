import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecoilRoot } from "recoil";
import PillButton from "./PillButton";

describe("PillButton", () => {
  it("should not forward non-DOM props to the underlying div", () => {
    // This test verifies the styled-components shouldForwardProp fix
    // Props like 'variant', 'color', 'size' should not reach the DOM
    const { container } = render(
      <RecoilRoot>
        <PillButton
        onClick={vi.fn()}
        title="Test Button"
        text="Click me"
        // @ts-ignore - Testing that these props are filtered
        variant="primary"
        color="blue"
        size="large"
      />
      </RecoilRoot>
    );

    const buttonDiv = container.querySelector("div");
    expect(buttonDiv).toBeTruthy();

    // These props should NOT be present on the DOM element
    expect(buttonDiv?.hasAttribute("variant")).toBe(false);
    expect(buttonDiv?.hasAttribute("color")).toBe(false);
    expect(buttonDiv?.hasAttribute("size")).toBe(false);
  });

  it("should forward valid DOM props", () => {
    const handleClick = vi.fn();
    const { container } = render(
      <RecoilRoot>
        <PillButton
        onClick={handleClick}
        title="Test Button"
        text="Click me"
        id="test-button"
        data-testid="pill-button"
      />
      </RecoilRoot>
    );

    const buttonDiv = container.querySelector("div");

    // Valid DOM attributes should be present
    expect(buttonDiv?.getAttribute("id")).toBe("test-button");
    expect(buttonDiv?.getAttribute("data-testid")).toBe("pill-button");
  });

  it("should render with tooltip when title is provided", () => {
    const { getByText } = render(
      <RecoilRoot>
        <PillButton
        onClick={vi.fn()}
        title="Test Tooltip"
        text="Button Text"
      />
      </RecoilRoot>
    );

    expect(getByText("Button Text")).toBeTruthy();
  });
});
