import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sample2D, SampleWrapper } from "./Sample2D";

const harness = vi.hoisted(() => ({
  id: "sample-a",
  loadable: {
    contents: null as unknown,
    getValue: vi.fn(),
    state: "hasValue" as "hasValue" | "loading" | "hasError",
  },
  persistenceKey: "renderer-McapRenderer" as string | null,
  retainedSample: null as null | { sample: { _id: string; id: string } },
  rendererMounts: 0,
}));

vi.mock("@fiftyone/keymap", () => ({
  useKeyBinding: () => undefined,
}));

vi.mock("@fiftyone/state", () => ({
  ModalMode: { ANNOTATE: "annotate" },
  modalSample: "modal-sample",
  modalSampleId: "modal-sample-id",
  useHoveredSample: () => ({ handlers: {} }),
  useModalMode: () => "view",
}));

vi.mock("recoil", () => ({
  useRecoilValue: (atom: string) =>
    atom === "modal-sample-id" ? harness.id : harness.loadable.contents,
  useRecoilValueLoadable: () => harness.loadable,
}));

vi.mock("./ModalLooker", () => ({
  ModalLooker: ({
    sample,
    sampleTransitioning,
  }: {
    sample?: { sample: { id: string } };
    sampleTransitioning?: boolean;
  }) => {
    React.useEffect(() => {
      harness.rendererMounts += 1;
    }, []);
    return (
      <div
        data-testid="modal-looker"
        data-transitioning={sampleTransitioning || undefined}
      >
        {sample?.sample.id ?? "suspended"}
      </div>
    );
  },
}));

vi.mock("./SelectSampleCheckbox", () => ({
  SelectSampleCheckbox: () => null,
}));

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
        : harness.loadable.getValue(),
      transitioning,
    };
  },
}));

const sampleA = { sample: { _id: "sample-a", id: "sample-a" } };
const sampleB = { sample: { _id: "sample-b", id: "sample-b" } };

describe("Sample2D persistent renderer transitions", () => {
  beforeEach(() => {
    harness.id = "sample-a";
    harness.loadable = {
      contents: sampleA,
      getValue: vi.fn(() => sampleA),
      state: "hasValue",
    };
    harness.persistenceKey = "renderer-McapRenderer";
    harness.retainedSample = null;
    harness.rendererMounts = 0;
  });

  afterEach(cleanup);

  it("retains the renderer shell while the next modal sample resolves", () => {
    const { rerender } = render(<Sample2D />);
    expect(screen.getByTestId("modal-looker").textContent).toBe("sample-a");

    harness.id = "sample-b";
    harness.loadable = {
      contents: Promise.resolve(sampleB),
      getValue: vi.fn(() => {
        throw new Error("should use retained sample");
      }),
      state: "loading",
    };
    rerender(<Sample2D />);

    expect(screen.getByTestId("modal-looker").textContent).toBe("sample-a");
    expect(screen.getByTestId("modal-looker").dataset.transitioning).toBe(
      "true",
    );
    expect(harness.rendererMounts).toBe(1);

    harness.loadable = {
      contents: sampleB,
      getValue: vi.fn(() => sampleB),
      state: "hasValue",
    };
    rerender(<Sample2D />);

    expect(screen.getByTestId("modal-looker").textContent).toBe("sample-b");
    expect(
      screen.getByTestId("modal-looker").dataset.transitioning,
    ).toBeUndefined();
    expect(harness.rendererMounts).toBe(1);
  });

  it("suspends while a wrapper-owned sample resolves", () => {
    const pending = new Promise(() => undefined);
    harness.loadable = {
      contents: pending,
      getValue: vi.fn(() => {
        throw pending;
      }),
      state: "loading",
    };

    render(
      <React.Suspense fallback={<div data-testid="fallback" />}>
        <SampleWrapper>sample</SampleWrapper>
      </React.Suspense>,
    );

    expect(screen.getByTestId("fallback")).toBeTruthy();
  });
});
