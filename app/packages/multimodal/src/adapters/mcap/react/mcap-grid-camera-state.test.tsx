import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  __resetMcapGridCameraPoseForTests,
  useMcapGridCameraPose,
} from "./mcap-grid-camera-state";

afterEach(() => {
  cleanup();
  __resetMcapGridCameraPoseForTests();
});

describe("MCAP grid camera state", () => {
  it("shares a camera pose across subscribers", () => {
    render(
      <>
        <CameraHarness id="a" />
        <CameraHarness id="b" />
      </>,
    );

    expect(screen.getByTestId("camera-a").textContent).toBe("empty");
    expect(screen.getByTestId("camera-b").textContent).toBe("empty");

    fireEvent.click(screen.getByTestId("camera-a"));

    expect(screen.getByTestId("camera-a").textContent).toBe("1,2,3|4,5,6");
    expect(screen.getByTestId("camera-b").textContent).toBe("1,2,3|4,5,6");
  });
});

function CameraHarness({ id }: { readonly id: string }) {
  const [pose, setPose] = useMcapGridCameraPose();

  return (
    <button
      data-testid={`camera-${id}`}
      onClick={() =>
        setPose({
          position: [1, 2, 3],
          target: [4, 5, 6],
        })
      }
      type="button"
    >
      {pose ? `${pose.position.join(",")}|${pose.target.join(",")}` : "empty"}
    </button>
  );
}
