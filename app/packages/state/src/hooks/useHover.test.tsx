import React from "react";
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useHover from "./useHover";
import { screen } from "@testing-library/dom";
import "@testing-library/jest-dom";

describe("useHover should work", () => {
  test("div element should be in DOM when hovered", () => {
    const Div = () => {
      const [ref, value] = useHover();
      return (
        <div>
          <div data-testid="trigger" ref={ref}>
            Trigger
          </div>
          {value && <div data-testid="expected">Expected</div>}
        </div>
      );
    };

    render(<Div />);
    let trigger = screen.queryByTestId("expected");
    expect(screen.queryByTestId("expected")).not.toBeInTheDocument();

    trigger = screen.getByTestId("trigger");
    userEvent.hover(trigger);

    expect(screen.queryByTestId("expected")).toBeInTheDocument();

    userEvent.unhover(trigger);

    expect(screen.queryByTestId("expected")).not.toBeInTheDocument();
  });
});
