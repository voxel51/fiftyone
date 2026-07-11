import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NonGroupModalSample } from "./ModalSamplePlugin";

const harness = vi.hoisted(() => ({
  loadable: {
    contents: null as unknown,
    state: "hasValue" as "hasValue" | "loading" | "hasError",
    valueOrThrow: vi.fn(),
  },
  persistenceKey: "renderer-McapRenderer" as string | null,
  retainedSample: null as null | {
    sample: { filepath: string; id: string };
    urls: { filepath: string };
  },
  sample2dMounts: 0,
}));

vi.mock("@fiftyone/state", () => ({
  modalSample: "modal-sample",
  selectedMediaField: () => "selected-media-field",
}));

vi.mock("@fiftyone/components", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("recoil", () => ({
  useRecoilValue: () => "filepath",
  useRecoilValueLoadable: () => harness.loadable,
  useSetRecoilState: () => () => undefined,
}));

vi.mock("@fiftyone/utilities", () => ({
  isDirect3dSamplePath: () => false,
}));

vi.mock("./Sample2D", () => ({
  Sample2D: () => {
    React.useEffect(() => {
      harness.sample2dMounts += 1;
    }, []);
    return <div data-testid="sample-2d" />;
  },
}));

vi.mock("./Sample3d", () => ({ Sample3d: () => null }));
vi.mock("./Group", () => ({ default: () => null }));
vi.mock("./use-modal-sample-renderer-persistence", () => ({
  useRetainedModalSample: () => {
    if (harness.loadable.state === "hasValue") {
      harness.retainedSample = harness.loadable.contents as typeof sampleA;
    }
    const transitioning =
      harness.loadable.state === "loading" &&
      harness.persistenceKey !== null &&
      harness.retainedSample !== null;
    return {
      persistenceKey: harness.persistenceKey,
      sample: transitioning
        ? harness.retainedSample
        : harness.loadable.valueOrThrow(),
      transitioning,
    };
  },
}));

const sampleA = {
  sample: { filepath: "/tmp/a.mcap", id: "sample-a" },
  urls: { filepath: "/tmp/a.mcap" },
};
const sampleB = {
  sample: { filepath: "/tmp/b.mcap", id: "sample-b" },
  urls: { filepath: "/tmp/b.mcap" },
};

describe("NonGroupModalSample persistent routing", () => {
  beforeEach(() => {
    harness.loadable = {
      contents: sampleA,
      state: "hasValue",
      valueOrThrow: vi.fn(() => sampleA),
    };
    harness.persistenceKey = "renderer-McapRenderer";
    harness.retainedSample = null;
    harness.sample2dMounts = 0;
  });

  afterEach(cleanup);

  it("does not suspend the persistent sample route while the target resolves", () => {
    const { rerender } = render(<NonGroupModalSample is3DMediaType={false} />);
    expect(screen.getByTestId("sample-2d")).toBeTruthy();

    harness.loadable = {
      contents: Promise.resolve(sampleB),
      state: "loading",
      valueOrThrow: vi.fn(() => {
        throw new Error("should retain the resolved route");
      }),
    };
    rerender(<NonGroupModalSample is3DMediaType={false} />);

    expect(screen.getByTestId("sample-2d")).toBeTruthy();
    expect(harness.sample2dMounts).toBe(1);
  });

  it("keeps the existing suspense behavior for non-persistent renderers", () => {
    const pending = new Promise(() => undefined);
    harness.persistenceKey = null;
    harness.loadable = {
      contents: pending,
      state: "loading",
      valueOrThrow: vi.fn(() => {
        throw pending;
      }),
    };

    render(
      <React.Suspense fallback={<div data-testid="fallback" />}>
        <NonGroupModalSample is3DMediaType={false} />
      </React.Suspense>,
    );

    expect(screen.getByTestId("fallback")).toBeTruthy();
    expect(screen.queryByTestId("sample-2d")).toBeNull();
  });
});
