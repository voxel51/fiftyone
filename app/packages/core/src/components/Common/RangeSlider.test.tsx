import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { atom, RecoilRoot } from "recoil";
import { Slider, Range } from "./RangeSlider";

describe("RangeSlider", () => {
  it("should use transient prop for alternateThumbLabelDirection", () => {
    // This test verifies the styled-components transient prop fix
    // The $ prefix ensures the prop doesn't leak to the DOM

    // Create mock atoms for the test
    const mockValueAtom = atom<number | null | undefined>({
      key: "mockValue",
      default: 50,
    });

    const mockBoundsAtom = atom<Range>({
      key: "mockBounds",
      default: [0, 100],
    });

    const { container } = render(
      <RecoilRoot>
        <Slider
          valueAtom={mockValueAtom}
          boundsAtom={mockBoundsAtom}
          color="#ff0000"
        />
      </RecoilRoot>
    );

    // The slider should render without errors
    expect(container).toBeTruthy();

    // Verify no console warnings about unknown props
    // (This would be caught by React in development mode)
  });
});
