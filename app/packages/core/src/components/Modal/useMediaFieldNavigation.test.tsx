import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { RecoilRoot, useRecoilValue } from "recoil";
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
vi.mock("@fiftyone/state", async () => {
  const { atom } = await import("recoil");
  // prevent duplicate keys
  const selectedMediaFieldAtom = atom({
    key: "test-selectedMediaField-modal",
    default: "filepath",
  });
  return {
    mediaFields: atom({
      key: "test-mediaFields",
      default: [] as string[],
    }),
    selectedMediaField: () => selectedMediaFieldAtom,
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
          set(fos.mediaFields as Parameters<typeof set>[0], ["filepath"]);
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
          set(fos.mediaFields as Parameters<typeof set>[0], [
            "filepath",
            "thumbnail_path",
          ]);
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
          set(fos.mediaFields as Parameters<typeof set>[0], [
            "filepath",
            "thumbnail_path",
            "field3",
          ]);
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

  it("navigates forward when next handler is invoked", () => {
    const selectedMediaFieldAtom = fos.selectedMediaField(true);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot
        initializeState={({ set }) => {
          set(fos.mediaFields as Parameters<typeof set>[0], [
            "filepath",
            "field2",
            "field3",
          ]);
          set(selectedMediaFieldAtom, "filepath");
        }}
      >
        {children}
      </RecoilRoot>
    );

    // Tracks the selected field
    const useTestHook = () => {
      useMediaFieldNavigation();
      return useRecoilValue(selectedMediaFieldAtom);
    };

    const { result } = renderHook(() => useTestHook(), { wrapper });

    // Get and invoke the next handler
    const bindings = mockUseKeyBindings.mock.calls[0][1];
    const nextHandler = bindings.find(
      (b: { commandId: string }) => b.commandId === "fo.modal.next.mediafield"
    )?.handler;

    expect(nextHandler).toBeDefined();
    act(() => {
      nextHandler!();
    });

    // Should have navigated to field2 from filepath
    expect(result.current).toBe("field2");
  });

  it("navigates backward when previous handler is invoked", () => {
    const selectedMediaFieldAtom = fos.selectedMediaField(true);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot
        initializeState={({ set }) => {
          set(fos.mediaFields as Parameters<typeof set>[0], [
            "filepath",
            "field2",
            "field3",
          ]);
          set(selectedMediaFieldAtom, "field2");
        }}
      >
        {children}
      </RecoilRoot>
    );

    const useTestHook = () => {
      useMediaFieldNavigation();
      return useRecoilValue(selectedMediaFieldAtom);
    };

    const { result } = renderHook(() => useTestHook(), { wrapper });

    // Get the previous handler and invoke it
    const bindings = mockUseKeyBindings.mock.calls[0][1];
    const prevHandler = bindings.find(
      (b: { commandId: string }) =>
        b.commandId === "fo.modal.previous.mediafield"
    )?.handler;

    expect(prevHandler).toBeDefined();
    act(() => {
      prevHandler!();
    });

    // Should have navigated back to filepath from field2
    expect(result.current).toBe("filepath");
  });

  it("wraps around when navigating past the end", () => {
    const selectedMediaFieldAtom = fos.selectedMediaField(true);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot
        initializeState={({ set }) => {
          set(fos.mediaFields as Parameters<typeof set>[0], [
            "filepath",
            "field2",
            "field3",
          ]);
          set(selectedMediaFieldAtom, "field3"); // Start at the last field
        }}
      >
        {children}
      </RecoilRoot>
    );

    const useTestHook = () => {
      useMediaFieldNavigation();
      return useRecoilValue(selectedMediaFieldAtom);
    };

    const { result } = renderHook(() => useTestHook(), { wrapper });

    // Get and invoke the next handler
    const bindings = mockUseKeyBindings.mock.calls[0][1];
    const nextHandler = bindings.find(
      (b: { commandId: string }) => b.commandId === "fo.modal.next.mediafield"
    )?.handler;

    expect(nextHandler).toBeDefined();
    act(() => {
      nextHandler!();
    });

    // Should wrap around to filepath from field3
    expect(result.current).toBe("filepath");
  });

  it("wraps around when navigating before the beginning", () => {
    const selectedMediaFieldAtom = fos.selectedMediaField(true);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot
        initializeState={({ set }) => {
          set(fos.mediaFields as Parameters<typeof set>[0], [
            "filepath",
            "field2",
            "field3",
          ]);
          set(selectedMediaFieldAtom, "filepath"); // Start at the first field
        }}
      >
        {children}
      </RecoilRoot>
    );

    const useTestHook = () => {
      useMediaFieldNavigation();
      return useRecoilValue(selectedMediaFieldAtom);
    };

    const { result } = renderHook(() => useTestHook(), { wrapper });

    // Get and invoke the previous handler
    const bindings = mockUseKeyBindings.mock.calls[0][1];
    const prevHandler = bindings.find(
      (b: { commandId: string }) =>
        b.commandId === "fo.modal.previous.mediafield"
    )?.handler;

    expect(prevHandler).toBeDefined();
    act(() => {
      prevHandler!();
    });

    // Should wrap around to field3 from filepath
    expect(result.current).toBe("field3");
  });

  it("defaults to first field when selectedMediaField is not in the array", () => {
    const selectedMediaFieldAtom = fos.selectedMediaField(true);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot
        initializeState={({ set }) => {
          set(fos.mediaFields as Parameters<typeof set>[0], [
            "filepath",
            "field2",
            "field3",
          ]);
          set(selectedMediaFieldAtom, "wrong_field"); // Field not there
        }}
      >
        {children}
      </RecoilRoot>
    );

    const useTestHook = () => {
      useMediaFieldNavigation();
      return useRecoilValue(selectedMediaFieldAtom);
    };

    const { result } = renderHook(() => useTestHook(), { wrapper });

    // Get and invoke the next handler
    const bindings = mockUseKeyBindings.mock.calls[0][1];
    const nextHandler = bindings.find(
      (b: { commandId: string }) => b.commandId === "fo.modal.next.mediafield"
    )?.handler;

    expect(nextHandler).toBeDefined();
    act(() => {
      nextHandler!();
    });

    // Default to the first field as `wrong_field` doesn't exist in the array
    expect(result.current).toBe("filepath");
  });
});
