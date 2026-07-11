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

  it("does not fan pose updates out to inactive cached cells", () => {
    const { rerender } = render(
      <>
        <CameraHarness id="visible" key="visible" />
        <CameraHarness enabled={false} id="hidden" key="hidden" />
      </>,
    );

    fireEvent.click(screen.getByTestId("camera-visible"));
    expect(screen.getByTestId("camera-hidden").textContent).toBe("empty");

    rerender(
      <>
        <CameraHarness id="visible" key="visible" />
        <CameraHarness enabled id="hidden" key="hidden" />
      </>,
    );
    expect(screen.getByTestId("camera-hidden").textContent).toBe("1,2,3|4,5,6");
  });
});

function CameraHarness({
  enabled = true,
  id,
}: {
  readonly enabled?: boolean;
  readonly id: string;
}) {
  const [pose, setPose] = useMcapGridCameraPose(enabled);

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
