import { renderHook } from "@testing-library/react-hooks";
import React from "react";
import { RecoilRoot } from "recoil";

import * as fos from "@fiftyone/state";
import { afterEach, describe, expect, test, vi } from "vitest";

const TEST_DS = {
  name: "test-dataset",
  mediaType: "image",
};

const getRecoilRoot = (
  type: "selectedSample" | "selectedLabel" | "activeImageSort" | "default",
  modal = false
) => {
  const Root: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
    return (
      <RecoilRoot
        initializeState={({ set }) => {
          set(fos.dataset, TEST_DS);
          if (type === "selectedSample") {
            set(fos.selectedSamples, new Set(["1", "2"]));
          }
          if (type === "selectedLabel") {
            set(fos.selectedLabels, [
              {
                labelId: "1",
                field: "test-field",
                sampleId: "1",
              },
            ]);
            set(fos.currentModalSample, { id: "1", index: 1234 });
          }
          if (type === "activeImageSort") {
            set(fos.similarityParameters, {
              brainKey: "test-brain-key",
              k: 10,
              queryIds: ["1"],
            });
          }
          if (modal) {
            set(fos.currentModalSample, { index: 0, id: "0" });
          }
        }}
      >
        {children}
      </RecoilRoot>
    );
  };
  return Root;
};

describe("similarity search helper text and icon are correct", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("Default state show text similarity search", async () => {
    const { result } = renderHook(
      () => fos.useSimilarityType({ isImageSearch: true }),
      { wrapper: getRecoilRoot("default") }
    );
    expect(result.current.text).toBe("Sort by text similarity");
    expect(result.current.showImageSimilarityIcon).toBe(false);
  });

  test("when samples are selected, image similarity search", async () => {
    const { result } = renderHook(
      // isImageSearch is false/true does not impact this test scenario
      () => fos.useSimilarityType({ isImageSearch: false }),
      { wrapper: getRecoilRoot("selectedSample") }
    );
    expect(result.current.text).toBe("Search by image similarity");
    expect(result.current.showImageSimilarityIcon).toBe(true);
  });

  test("when an image similarity is done and extended stage has sorting setting, should show image icon", () => {
    const { result } = renderHook(
      () => fos.useSimilarityType({ isImageSearch: true }),
      { wrapper: getRecoilRoot("activeImageSort") }
    );
    expect(result.current.text).toBe("Search by image similarity");
    expect(result.current.showImageSimilarityIcon).toBe(true);
  });

  test("when an text similarity is done and extended stage has sorting setting, should show text icon", () => {
    const { result } = renderHook(
      () => fos.useSimilarityType({ isImageSearch: false }),
      { wrapper: getRecoilRoot("activeImageSort") }
    );
    expect(result.current.text).toBe("Sort by text similarity");
    expect(result.current.showImageSimilarityIcon).toBe(false);
  });

  test("when labels are selected in sample modal view, should show image icon", () => {
    // isImageSearch is false/true does not impact this test scenario
    const { result } = renderHook(
      () => fos.useSimilarityType({ isImageSearch: false }),
      {
        wrapper: getRecoilRoot("selectedLabel", true),
      }
    );
    expect(result.current.text).toBe("Search by image similarity");
    expect(result.current.showImageSimilarityIcon).toBe(true);
  });
});
