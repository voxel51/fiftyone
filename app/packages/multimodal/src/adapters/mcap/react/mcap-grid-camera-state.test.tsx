import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetMcapGridCameraPoseForTests,
  useMcapGridCameraPose,
} from "./mcap-grid-camera-state";

afterEach(() => {
  cleanup();
  __resetMcapGridCameraPoseForTests();
  vi.useRealTimers();
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

  it("isolates camera poses between dataset and media-field scopes", () => {
    render(
      <>
        <CameraHarness id="a" scopeKey="dataset-a:filepath" />
        <CameraHarness id="b" scopeKey="dataset-b:filepath" />
      </>,
    );

    fireEvent.click(screen.getByTestId("camera-a"));
    expect(screen.getByTestId("camera-a").textContent).toBe("1,2,3|4,5,6");
    expect(screen.getByTestId("camera-b").textContent).toBe("empty");
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

  it("refreshes scope retention on access", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { rerender } = render(<CameraHarness id="a" scopeKey="scope-a" />);
    fireEvent.click(screen.getByTestId("camera-a"));

    vi.setSystemTime(20 * 60 * 1000);
    rerender(<CameraHarness id="a" scopeKey="scope-a" />);
    vi.setSystemTime(40 * 60 * 1000);
    rerender(<CameraHarness id="b" scopeKey="scope-b" />);
    rerender(<CameraHarness id="a" scopeKey="scope-a" />);

    expect(screen.getByTestId("camera-a").textContent).toBe("1,2,3|4,5,6");
  });

  it("does not evict a scope while a preview still references it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    render(<CameraHarness id="a" scopeKey="scope-a" />);
    fireEvent.click(screen.getByTestId("camera-a"));

    vi.setSystemTime(31 * 60 * 1000);
    render(<CameraHarness id="b" scopeKey="scope-b" />);
    render(<CameraHarness id="a-copy" scopeKey="scope-a" />);

    expect(screen.getByTestId("camera-a-copy").textContent).toBe("1,2,3|4,5,6");
  });

  it("evicts scopes that remain unused beyond the retention window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { rerender } = render(<CameraHarness id="a" scopeKey="scope-a" />);
    fireEvent.click(screen.getByTestId("camera-a"));

    vi.setSystemTime(31 * 60 * 1000);
    rerender(<CameraHarness id="b" scopeKey="scope-b" />);
    rerender(<CameraHarness id="a" scopeKey="scope-a" />);

    expect(screen.getByTestId("camera-a").textContent).toBe("empty");
  });
});

function CameraHarness({
  enabled = true,
  id,
  scopeKey = "dataset-a:filepath",
}: {
  readonly enabled?: boolean;
  readonly id: string;
  readonly scopeKey?: string;
}) {
  const [pose, setPose] = useMcapGridCameraPose(scopeKey, enabled);

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
