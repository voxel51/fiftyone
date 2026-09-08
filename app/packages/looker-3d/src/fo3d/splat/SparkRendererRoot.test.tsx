import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { RecoilRoot } from "recoil";
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
  instances: [] as Array<{
    focalAdjustment: number;
    lodSplatScale: number;
    sortRadial: boolean;
  }>,
  setDirty: vi.fn(),
  setSplatSettings: vi.fn(),
  splatSettings: {
    detail: "standard" as "low" | "standard" | "high",
    sharpness: 1,
    sorting: "stable" as "stable" | "accurate",
    maxSh: 3 as 0 | 1 | 2 | 3,
  },
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
    focalAdjustment = 1;
    lodSplatScale = 1;
    sortRadial = true;

    constructor(options: unknown) {
      mocks.construct(options);
      mocks.instances.push(this);
    }

    dispose() {
      mocks.disposeRenderer();
    }

    setDirty() {
      mocks.setDirty();
    }
  },
}));

vi.mock("../../hooks/use-splat-settings", () => ({
  useSplatSettings: () => [mocks.splatSettings, mocks.setSplatSettings],
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
  <RecoilRoot>
    <SparkRendererProvider>{children}</SparkRendererProvider>
  </RecoilRoot>
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.instances.length = 0;
  mocks.splatSettings = {
    detail: "standard",
    sharpness: 1,
    sorting: "stable",
    maxSh: 3,
  };
});

describe("SparkRendererProvider", () => {
  it("does not allocate Spark without a splat consumer", () => {
    render(<TestScene />);

    expect(mocks.construct).not.toHaveBeenCalled();
  });

  it("mounts one renderer only while splat consumers are present", async () => {
    const { rerender } = render(
      <TestScene>
        <SplatConsumer />
        <SplatConsumer />
      </TestScene>,
    );

    await waitFor(() => expect(mocks.construct).toHaveBeenCalledTimes(1));
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

  it("releases Spark's renderer, geometry, and material", async () => {
    const { unmount } = render(
      <TestScene>
        <SplatConsumer />
      </TestScene>,
    );

    await waitFor(() => expect(mocks.construct).toHaveBeenCalledTimes(1));
    unmount();

    expect(mocks.disposeRenderer).toHaveBeenCalledTimes(1);
    expect(mocks.disposeGeometry).toHaveBeenCalledTimes(1);
    expect(mocks.disposeMaterial).toHaveBeenCalledTimes(1);
  });

  it("enables covariance accumulation when a consumer requires it", async () => {
    render(
      <TestScene>
        <SplatConsumer requiresCovariance />
      </TestScene>,
    );

    await waitFor(() =>
      expect(mocks.construct).toHaveBeenCalledWith(
        expect.objectContaining({
          accumExtSplats: true,
          covSplats: true,
        }),
      ),
    );
  });

  it("replaces the renderer when covariance requirements change", async () => {
    const { rerender } = render(
      <TestScene>
        <SplatConsumer />
      </TestScene>,
    );
    await waitFor(() => expect(mocks.construct).toHaveBeenCalledTimes(1));

    rerender(
      <TestScene>
        <SplatConsumer requiresCovariance />
      </TestScene>,
    );

    await waitFor(() => expect(mocks.construct).toHaveBeenCalledTimes(2));
    expect(mocks.disposeRenderer).toHaveBeenCalledTimes(1);
    expect(mocks.construct).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accumExtSplats: true,
        covSplats: true,
      }),
    );
  });

  it("updates renderer preferences without reconstructing Spark", async () => {
    const { rerender } = render(
      <TestScene>
        <SplatConsumer />
      </TestScene>,
    );
    await waitFor(() => expect(mocks.construct).toHaveBeenCalledTimes(1));
    const renderer = mocks.instances[0];

    mocks.splatSettings = {
      detail: "high",
      sharpness: 1.8,
      sorting: "accurate",
      maxSh: 0,
    };
    rerender(
      <TestScene>
        <SplatConsumer />
      </TestScene>,
    );

    expect(mocks.construct).toHaveBeenCalledTimes(1);
    expect(renderer.lodSplatScale).toBe(2);
    expect(renderer.focalAdjustment).toBe(1.8);
    expect(renderer.sortRadial).toBe(false);
    expect(mocks.setDirty).toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it("does not allocate an abandoned StrictMode lifecycle", async () => {
    const { unmount } = render(
      <StrictMode>
        <TestScene>
          <SplatConsumer />
        </TestScene>
      </StrictMode>,
    );

    await waitFor(() => expect(mocks.construct).toHaveBeenCalledTimes(1));
    expect(mocks.disposeRenderer).not.toHaveBeenCalled();

    unmount();

    expect(mocks.disposeRenderer).toHaveBeenCalledTimes(1);
    expect(mocks.disposeGeometry).toHaveBeenCalledTimes(1);
    expect(mocks.disposeMaterial).toHaveBeenCalledTimes(1);
  });

  it("contains renderer failures without unmounting scene content", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.construct.mockImplementationOnce(() => {
      throw new Error("renderer failed");
    });

    render(
      <TestScene>
        <SplatConsumer />
        <div>scene content</div>
      </TestScene>,
    );

    await waitFor(() => expect(mocks.construct).toHaveBeenCalledOnce());
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(screen.getByText("scene content")).not.toBeNull();
    expect(screen.queryByText("renderer failed")).toBeNull();
  });
});
