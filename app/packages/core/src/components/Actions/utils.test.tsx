import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionDiv } from "./utils";

describe("ActionDiv", () => {
  it("should not forward non-DOM props to the underlying div", () => {
    // This test verifies the styled-components shouldForwardProp fix
    // Props like 'variant', 'closeOverflow', 'refresh' should not reach the DOM
    const { container } = render(
      <ActionDiv
        // @ts-ignore - Testing that these props are filtered
        variant="primary"
        closeOverflow={() => {}}
        refresh={() => {}}
        data-testid="action-div"
      />
    );

    const div = container.querySelector("div");
    expect(div).toBeTruthy();

    // These AdaptiveMenu props should NOT be present on the DOM element
    expect(div?.hasAttribute("variant")).toBe(false);
    expect(div?.hasAttribute("closeOverflow")).toBe(false);
    expect(div?.hasAttribute("refresh")).toBe(false);

    // Valid DOM attributes should be present
    expect(div?.getAttribute("data-testid")).toBe("action-div");
  });

  it("should allow standard DOM props", () => {
    const { container } = render(
      <ActionDiv
        id="test-action"
        className="action-class"
        style={{ position: "relative" }}
      />
    );

    const div = container.querySelector("div");
    expect(div?.getAttribute("id")).toBe("test-action");
    expect(div?.className).toContain("action-class");
  });
});
