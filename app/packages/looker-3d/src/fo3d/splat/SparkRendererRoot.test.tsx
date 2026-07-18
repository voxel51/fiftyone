import { cleanup, render } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparkRendererProvider, useSparkRenderer } from "./SparkRendererRoot";
import { SPARK_MAX_STANDARD_DEVIATIONS } from "./constants";

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  disposeGeometry: vi.fn(),
  disposeMaterial: vi.fn(),
  disposeRenderer: vi.fn(),
  gl: {},
  invalidate: vi.fn(),
}));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: unknown) => unknown) =>
    selector({ gl: mocks.gl, invalidate: mocks.invalidate }),
}));

vi.mock("@sparkjsdev/spark", () => ({
  SparkRenderer: class SparkRenderer {
    geometry = {
      boundingBox: null,
      dispose: mocks.disposeGeometry,
    };
    material = { dispose: mocks.disposeMaterial };
    userData = {};

    constructor(options: unknown) {
      mocks.construct(options);
    }

    dispose() {
      mocks.disposeRenderer();
    }
  },
}));

const SplatConsumer = ({
  requiresCovariance = false,
}: {
  requiresCovariance?: boolean;
}) => {
  useSparkRenderer({ requiresCovariance });
  return null;
};

const TestScene = ({ children }: { children?: ReactNode }) => (
  <SparkRendererProvider>{children}</SparkRendererProvider>
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SparkRendererProvider", () => {
  it("mounts one renderer only while splat consumers are present", () => {
    const { rerender } = render(
      <TestScene>
        <SplatConsumer />
        <SplatConsumer />
      </TestScene>,
    );

    expect(mocks.construct).toHaveBeenCalledTimes(1);
    expect(mocks.construct).toHaveBeenCalledWith(
      expect.objectContaining({
        accumExtSplats: false,
        covSplats: false,
        maxStdDev: SPARK_MAX_STANDARD_DEVIATIONS,
      }),
    );

    rerender(<TestScene />);

    expect(mocks.disposeRenderer).toHaveBeenCalledTimes(1);
  });

  it("releases Spark's renderer, geometry, and material", () => {
    const { unmount } = render(
      <TestScene>
        <SplatConsumer />
      </TestScene>,
    );

    unmount();

    expect(mocks.disposeRenderer).toHaveBeenCalledTimes(1);
    expect(mocks.disposeGeometry).toHaveBeenCalledTimes(1);
    expect(mocks.disposeMaterial).toHaveBeenCalledTimes(1);
  });

  it("enables covariance accumulation when a consumer requires it", () => {
    render(
      <TestScene>
        <SplatConsumer requiresCovariance />
      </TestScene>,
    );

    expect(mocks.construct).toHaveBeenCalledWith(
      expect.objectContaining({
        accumExtSplats: true,
        covSplats: true,
      }),
    );
  });

  it("disposes every renderer created by the StrictMode lifecycle", () => {
    const { unmount } = render(
      <StrictMode>
        <TestScene>
          <SplatConsumer />
        </TestScene>
      </StrictMode>,
    );

    expect(mocks.construct).toHaveBeenCalledTimes(2);
    expect(mocks.disposeRenderer).toHaveBeenCalledTimes(1);

    unmount();

    expect(mocks.disposeRenderer).toHaveBeenCalledTimes(2);
    expect(mocks.disposeGeometry).toHaveBeenCalledTimes(2);
    expect(mocks.disposeMaterial).toHaveBeenCalledTimes(2);
  });
});
