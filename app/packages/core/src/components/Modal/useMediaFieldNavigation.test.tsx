import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { RecoilRoot } from "recoil";
import React from "react";
import { useKeyBindings } from "@fiftyone/commands";
import * as fos from "@fiftyone/state";
import { useMediaFieldNavigation } from "./useMediaFieldNavigation";

////////////////////////////
//   Mock dependencies    //
////////////////////////////

vi.mock("@fiftyone/commands", () => ({
  KnownCommands: {
    ModalPreviousMediaField: "fo.modal.previous.mediafield",
    ModalNextMediaField: "fo.modal.next.mediafield",
  },
  KnownContexts: {
    Modal: "fo.modal",
  },
  useKeyBindings: vi.fn(),
}));

// Define atoms inline in the mock factory to avoid hoisting issues
vi.mock("@fiftyone/state", () => {
  const { atom } = require("recoil");
  return {
    mediaFields: atom({
      key: "test-mediaFields",
      default: [] as string[],
    }),
    selectedMediaField: () =>
      atom({
        key: "test-selectedMediaField-modal",
        default: "filepath",
      }),
  };
});

const mockUseKeyBindings = vi.mocked(useKeyBindings);

////////////////////////////
//         Tests          //
////////////////////////////

describe("useMediaFieldNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes empty bindings when mediaFields is empty", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot>{children}</RecoilRoot>
    );

    renderHook(() => useMediaFieldNavigation(), { wrapper });

    expect(mockUseKeyBindings).toHaveBeenCalledWith("fo.modal", []);
  });

  it("passes empty bindings when only one media field exists", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot
        initializeState={({ set }) => {
          set(fos.mediaFields, ["filepath"]);
        }}
      >
        {children}
      </RecoilRoot>
    );

    renderHook(() => useMediaFieldNavigation(), { wrapper });

    expect(mockUseKeyBindings).toHaveBeenCalledWith("fo.modal", []);
  });

  it("registers PageUp/PageDown bindings when multiple media fields exist", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot
        initializeState={({ set }) => {
          set(fos.mediaFields, ["filepath", "thumbnail_path"]);
        }}
      >
        {children}
      </RecoilRoot>
    );

    renderHook(() => useMediaFieldNavigation(), { wrapper });

    expect(mockUseKeyBindings).toHaveBeenCalledWith(
      "fo.modal",
      expect.arrayContaining([
        expect.objectContaining({
          commandId: "fo.modal.previous.mediafield",
          sequence: "PageUp",
          label: "Previous Media Field",
        }),
        expect.objectContaining({
          commandId: "fo.modal.next.mediafield",
          sequence: "PageDown",
          label: "Next Media Field",
        }),
      ])
    );
  });

  it("provides handler functions in the bindings", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot
        initializeState={({ set }) => {
          set(fos.mediaFields, ["filepath", "thumbnail_path", "field3"]);
        }}
      >
        {children}
      </RecoilRoot>
    );

    renderHook(() => useMediaFieldNavigation(), { wrapper });

    const bindings = mockUseKeyBindings.mock.calls[0][1];
    expect(bindings).toHaveLength(2);
    expect(typeof bindings[0].handler).toBe("function");
    expect(typeof bindings[1].handler).toBe("function");
  });
});
