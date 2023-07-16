import { act, renderHook } from "@testing-library/react-hooks";
import React from "react";
import { RecoilRoot, useRecoilValue } from "recoil";
import { expect, it, test } from "vitest";
import {
  attributeVisibility,
  modalAttributeVisibility,
  sidebarGroupsDefinition,
} from "../../src";
import {
  useClearFiltered,
  useClearVisibility,
} from "../../src/hooks/useGroupEntries";
import { filters, modalFilters } from "../../src/recoil/filters";

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
        snapshot.set(sidebarGroupsDefinition(false), [
          {
            name: "ground_truth",
            paths: ["ground_truth.detection"],
            expanded: true,
          },
          {
            name: "predictions",
            paths: ["predictions.detection"],
            expanded: true,
          },
          {
            name: "primitives",
            paths: ["list_bools", "id", "filepath"],
            expanded: true,
          },
        ]);
        snapshot.set(sidebarGroupsDefinition(true), [
          {
            name: "ground_truth",
            paths: ["ground_truth.detection"],
            expanded: true,
          },
          {
            name: "predictions",
            paths: ["predictions.detection"],
            expanded: true,
          },
          {
            name: "primitives",
            paths: ["list_bools", "id", "filepath"],
            expanded: true,
          },
        ]);
      }}
    >
      {children}
    </RecoilRoot>
  );
};

const Root2: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  return (
    <RecoilRoot
      initializeState={(snapshot) => {
        snapshot.set(attributeVisibility, {
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
        snapshot.set(modalAttributeVisibility, {
          "ground_truth.detections.camera": {
            values: ["cannon"],
            exclude: false,
            isMatching: true,
          },
        });
        snapshot.set(sidebarGroupsDefinition(false), [
          {
            name: "ground_truth",
            paths: ["ground_truth.detection"],
            expanded: true,
          },
          {
            name: "predictions",
            paths: ["predictions.detection"],
            expanded: true,
          },
          {
            name: "primitives",
            paths: ["list_bools", "id", "filepath"],
            expanded: true,
          },
        ]);
        snapshot.set(sidebarGroupsDefinition(true), [
          {
            name: "ground_truth",
            paths: ["ground_truth.detection"],
            expanded: true,
          },
          {
            name: "predictions",
            paths: ["predictions.detection"],
            expanded: true,
          },
          {
            name: "primitives",
            paths: ["list_bools", "id", "filepath"],
            expanded: true,
          },
        ]);
      }}
    >
      {children}
    </RecoilRoot>
  );
};

test("Test useClearFiltered", () => {
  const { result } = renderHook(
    () => ({
      clearModalFilters: useClearFiltered(true, "ground_truth"),
      clearGridFilters: useClearFiltered(false, "ground_truth"),
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

test("Test useClearVisibility", () => {
  const { result } = renderHook(
    () => ({
      clearModalVisibility: useClearVisibility(true, "ground_truth"),
      clearGridVisibility: useClearVisibility(false, "ground_truth"),
      visibility: useRecoilValue(attributeVisibility),
      modalVisibility: useRecoilValue(modalAttributeVisibility),
    }),
    {
      wrapper: Root2,
    }
  );

  it("should clear modal attribute visibility", () => {
    act(() => {
      result.current.clearModalVisibility();
    });

    expect(result.current.modalVisibility).toStrictEqual({});
    expect(Object.keys(result.current.visibility)).toHaveLength(2);
  });

  it("should clear grid attribute visibility", () => {
    act(() => {
      result.current.clearGridVisibility();
    });
    expect(result.current.visibility).toStrictEqual({});
    expect(Object.keys(result.current.modalVisibility)).toHaveLength(1);
  });
});
