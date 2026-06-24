import { render } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import { useSetRecoilState } from "recoil";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FO3D_PERFORMANCE_STATS } from "../../state";
import { Fo3dPerformanceMonitor } from "../Fo3dPerformanceMonitor";

type TestFrameState = {
  clock: {
    elapsedTime: number;
  };
  gl: {
    info: {
      render: {
        calls: number;
        triangles: number;
        points: number;
      };
      memory: {
        geometries: number;
        textures: number;
      };
      programs: unknown[] | null;
    };
  };
};

type TestFrameCallback = (state: TestFrameState) => void;

const harness = vi.hoisted(() => {
  const state = {
    frameCallback: null as TestFrameCallback | null,
    setPerformanceStats: vi.fn(),
    useFrame: vi.fn((callback: TestFrameCallback) => {
      state.frameCallback = callback;
    }),
  };

  return state;
});

vi.mock("@react-three/fiber", () => ({
  useFrame: harness.useFrame,
}));

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");

  return {
    ...actual,
    useSetRecoilState: vi.fn(),
  };
});

const makeFrameState = (elapsedTime: number): TestFrameState => ({
  clock: { elapsedTime },
  gl: {
    info: {
      render: {
        calls: 12,
        triangles: 345,
        points: 678,
      },
      memory: {
        geometries: 9,
        textures: 10,
      },
      programs: [{}, {}],
    },
  },
});

describe("Fo3dPerformanceMonitor", () => {
  beforeEach(() => {
    harness.frameCallback = null;
    harness.setPerformanceStats.mockClear();
    harness.useFrame.mockClear();
    vi.mocked(useSetRecoilState).mockReturnValue(harness.setPerformanceStats);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("publishes throttled renderer stats from inside the canvas frame loop", () => {
    render(<Fo3dPerformanceMonitor />);

    expect(harness.useFrame).toHaveBeenCalledTimes(1);
    expect(harness.frameCallback).not.toBeNull();

    act(() => {
      harness.frameCallback?.(makeFrameState(0));
      harness.frameCallback?.(makeFrameState(0.25));
    });
    expect(harness.setPerformanceStats).not.toHaveBeenCalled();

    act(() => {
      harness.frameCallback?.(makeFrameState(0.5));
    });

    expect(harness.setPerformanceStats).toHaveBeenCalledTimes(1);

    const updateStats = harness.setPerformanceStats.mock.calls[0][0];
    expect(updateStats(DEFAULT_FO3D_PERFORMANCE_STATS)).toMatchObject({
      fps: 6,
      calls: 12,
      triangles: 345,
      points: 678,
      geometries: 9,
      textures: 10,
      programs: 2,
    });
  });
});
