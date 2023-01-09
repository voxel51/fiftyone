import { act, renderHook } from "@testing-library/react-hooks";
import React from "react";
import { RecoilRoot, useRecoilValue } from "recoil";
import { expect, test } from "vitest";
import { selectedLabels, selectedSamples, view } from "../../src";

import useReset from "../../src/hooks/useReset";

const Root: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  return (
    <RecoilRoot
      initializeState={(snapshot) => {
        snapshot.set(view, [
          {
            _cls: "fiftyone.core.stages.Limit",
            kwargs: [["limit", 1]],
          },
        ]);
        snapshot.set(selectedLabels, {
          "000000000000000000000000": {
            field: "field",
            sampleId: "000000000000000000000000",
          },
        });
        snapshot.set(selectedSamples, new Set(["000000000000000000000000"]));
      }}
    >
      {children}
    </RecoilRoot>
  );
};

test("Test useReset", () => {
  const { result } = renderHook(
    () => ({
      reset: useReset(),
      selectedLabels: useRecoilValue(selectedLabels),
      selectedSamples: useRecoilValue(selectedSamples),
      view: useRecoilValue(view),
    }),
    {
      wrapper: Root,
    }
  );

  act(() => {
    result.current.reset();
  });

  expect(result.current.selectedLabels).toStrictEqual({});
  expect(result.current.selectedSamples).toStrictEqual(new Set());
  expect(result.current.view).toStrictEqual([]);
});
