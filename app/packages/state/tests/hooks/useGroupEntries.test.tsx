import { act, renderHook } from "@testing-library/react-hooks";
import React from "react";
import { RecoilRoot, useRecoilValue } from "recoil";
import { expect, it, test } from "vitest";
import { filters, modalFilters } from "../../src/recoil/filters";
import { useClearFiltered } from "../../src/hooks/useGroupEntries";

const Root1: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  return (
    <RecoilRoot
      initializeState={(snapshot) => {
        snapshot.set(filters, {
          "ground_truth.detections.camera": {
            values: ["cannon"],
            exclude: false,
            isMatching: true,
          },
          "ground_truth.detections.label": {
            values: ["cat", "dog"],
            exclude: false,
            isMatching: true,
          },
        });
        snapshot.set(modalFilters, {
          "ground_truth.detections.camera": {
            values: ["cannon"],
            exclude: false,
            isMatching: true,
          },
        });
      }}
    >
      {children}
    </RecoilRoot>
  );
};

test("Test useClearFiltered", () => {
  const { result } = renderHook(
    () => ({
      clearModalFilters: useClearFiltered(true, ""),
      clearGridFilters: useClearFiltered(false, ""),
      filters: useRecoilValue(filters),
      modalFilters: useRecoilValue(modalFilters),
    }),
    {
      wrapper: Root1,
    }
  );

  it("should clear modal filters", () => {
    act(() => {
      result.current.clearModalFilters();
    });

    expect(result.current.modalFilters).toStrictEqual({});
    expect(Object.keys(result.current.filters)).toHaveLength(2);
  });

  it("should clear grid filters", () => {
    act(() => {
      result.current.clearGridFilters();
    });
    expect(result.current.filters).toStrictEqual({});
    expect(Object.keys(result.current.modalFilters)).toHaveLength(1);
  });
});
