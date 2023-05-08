import * as fos from "@fiftyone/state";
import { act, renderHook } from "@testing-library/react-hooks";
import React, { useEffect } from "react";
import { RecoilRoot, useRecoilValue } from "recoil";
import { expect, test } from "vitest";
import {
  useBrainResult,
  useBrainResultsSelector,
} from "../../src/useBrainResult";

function Initializer({ initialValue }) {
  const [selected, setSelected] = useBrainResult();
  useEffect(() => {
    setSelected(initialValue);
  }, []);
  return null;
}

test("useBrainResultSelector", () => {
  const { result } = renderHook(() => useBrainResultsSelector(), {
    wrapper: ({ children }) => {
      return (
        <RecoilRoot
          initializeState={(snapshot) => {
            snapshot.set(fos.dataset, {
              brainMethods: [
                {
                  key: "hello",
                  config: {
                    cls: "fiftyone.brain.visualization.VisualizationConfig",
                  },
                },
                {
                  key: "world",
                  config: {
                    cls: "fiftyone.brain.visualization.VisualizationConfig",
                  },
                },
              ],
            });
          }}
        >
          <Initializer initialValue="test" />
          {children}
        </RecoilRoot>
      );
    },
  });

  act(() => {
    result.current.handlers.onSelect("hello");
  });

  expect(result.current.brainKey).toBe("hello");
  expect(result.current.canSelect).toBe(true);
  expect(result.current.hasSelection).toBe(true);
});
