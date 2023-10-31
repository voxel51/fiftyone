import React from "react";
import { renderHook, act } from "@testing-library/react-hooks";
import {
  RecoilRoot,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
} from "recoil";

import { afterEach, describe, expect, test, vi } from "vitest";
import * as fos from "@fiftyone/state";
import { FIELDS } from "../useSchemaSettings.utils.test";
import { RelayEnvironmentProvider } from "react-relay";
import { Environment } from "relay-runtime";

const TEST_DS = {
  name: "test-dataset",
  mediaType: "image",
};

const Root: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  return (
    <RecoilRoot
      initializeState={({ set }) => {
        set(fos.dataset, TEST_DS);
        set(fos.showNestedFieldsState, false);
        set(fos.excludedPathsState({}), {
          [TEST_DS.name]: [FIELDS.METADATA_FIELD.path],
        });
      }}
    >
      <RelayEnvironmentProvider environment={new Environment({})}>
        {children}
      </RelayEnvironmentProvider>
    </RecoilRoot>
  );
};

describe("useResetExcludedFieldStage ", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should reset excludedFieldsStageState field_names correctly", async () => {
    const { result } = renderHook(
      () => {
        const [excludedFieldsStage, setExcludedFieldsStage] = useRecoilState(
          fos.excludedPathsState({})
        );
        const resetExcludedPaths = useResetRecoilState(
          fos.excludedPathsState({})
        );

        return {
          excludedFieldsStage,
          setExcludedFieldsStage,
          resetExcludedPaths,
        };
      },
      {
        wrapper: Root,
      }
    );

    expect(result.current.excludedFieldsStage).toStrictEqual({
      [TEST_DS.name]: [FIELDS.METADATA_FIELD.path],
    });

    act(() => {
      result.current.resetExcludedPaths();
    });

    expect(result.current.excludedFieldsStage[TEST_DS.name].size).toEqual(0);
  });
});
